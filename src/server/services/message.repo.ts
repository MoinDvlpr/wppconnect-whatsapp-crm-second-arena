import { and, desc, eq, lt, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { chats, contacts, messageReactions, messages } from "@/db/schema";
import { newId } from "@/lib/api";
import { normalizeWhatsAppId } from "@/lib/ids";
import { messagePreview, type MessageStatus, type NormalizedMessage } from "../wpp/normalize";

export type MessageRow = typeof messages.$inferSelect;
const ORDER: Record<MessageStatus, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, PLAYED: 4, FAILED: -1 };

export const messageRepo = {
  toInsert(n: NormalizedMessage, raw?: unknown): typeof messages.$inferInsert {
    return {
      id: newId(), sessionId: n.sessionId, waMessageId: n.id, chatId: n.chatId, senderId: n.senderId, recipientId: n.recipientId, fromMe: n.fromMe, type: n.type,
      body: n.body, caption: n.caption, timestamp: n.timestamp, status: n.status, ack: n.ack, quotedMessageId: n.quotedMessageId, mentionedIds: n.mentionedIds,
      isForwarded: n.isForwarded, isStarred: n.isStarred, edited: n.edited, revoked: n.revoked, hasMedia: n.hasMedia, mediaMimeType: n.mediaMimeType, mediaFilename: n.mediaFilename,
      mediaSize: n.mediaSize, location: n.location, vcard: n.vcard, senderName: n.senderName, metadata: n.metadata, rawPayload: process.env.KEEP_RAW_PAYLOAD === "true" ? raw : null,
    };
  },
  /** Idempotent upsert keyed by (sessionId, waMessageId). Returns inserted=false if it already existed. */
  async upsertIncoming(n: NormalizedMessage, raw?: unknown) {
    const values = this.toInsert(n, raw);
    const res = await db.insert(messages).values(values).onConflictDoNothing({ target: [messages.sessionId, messages.waMessageId] }).returning();
    const inserted = res.length > 0;
    const row = inserted ? res[0] : (await db.select().from(messages).where(and(eq(messages.sessionId, n.sessionId), eq(messages.waMessageId, n.id))).limit(1))[0];
    if (inserted) await this.touchChat(n);
    return { inserted, message: row };
  },
  async bulkUpsert(list: NormalizedMessage[]) {
    if (!list.length) return 0;
    const res = await db.insert(messages).values(list.map((n) => this.toInsert(n))).onConflictDoNothing({ target: [messages.sessionId, messages.waMessageId] }).returning({ id: messages.id });
    return res.length;
  },
  async touchChat(n: NormalizedMessage) {
    const kind = normalizeWhatsAppId(n.chatId)?.kind ?? "unknown";
    const ts = new Date(n.timestamp * 1000);
    await db.insert(chats).values({ id: newId(), sessionId: n.sessionId, waId: n.chatId, kind, name: n.fromMe ? null : n.senderName ?? null, lastMessageAt: ts, lastMessagePreview: messagePreview(n), lastMessageType: n.type, lastMessageFromMe: n.fromMe, unreadCount: n.fromMe ? 0 : 1 })
      .onConflictDoUpdate({
        target: [chats.sessionId, chats.waId], set: {
          lastMessageAt: sql`greatest(coalesce(${chats.lastMessageAt}, to_timestamp(0)), ${ts.toISOString()}::timestamptz)`,
          lastMessagePreview: messagePreview(n), lastMessageType: n.type, lastMessageFromMe: n.fromMe,
          unreadCount: n.fromMe ? 0 : sql`${chats.unreadCount} + 1`, updatedAt: new Date(),
        }
      });
    if (!n.fromMe && kind === "user") {
      await db.update(contacts).set({ lastInteractionAt: ts, pushName: n.senderName ?? undefined }).where(and(eq(contacts.sessionId, n.sessionId), eq(contacts.waId, n.chatId)));
    }
    
    // Asynchronously resolve and link lid/c.us mappings for the chat and sender
    if (kind === "lid" || kind === "user") {
      import("./whatsapp.service").then(({ ContactService }) => {
        ContactService.resolveAndLinkWaId(n.sessionId, n.chatId).catch(() => {});
        if (n.senderId && n.senderId !== "me" && n.senderId !== n.chatId) {
          ContactService.resolveAndLinkWaId(n.sessionId, n.senderId).catch(() => {});
        }
      }).catch(() => {});
    }
  },
  async findByWaId(sessionId: string, waMessageId: string) {
    const [m] = await db.select().from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.waMessageId, waMessageId))).limit(1);
    return m ?? null;
  },
  /** Only moves status forward (never READ -> DELIVERED). */
  async updateStatus(sessionId: string, waMessageId: string, status: MessageStatus, ack: number) {
    const m = await this.findByWaId(sessionId, waMessageId);
    if (!m) return null;
    if (status !== "FAILED" && ORDER[m.status as MessageStatus] >= ORDER[status]) return null;
    await db.update(messages).set({ status, ack }).where(eq(messages.id, m.id));
    return { ...m, status, ack };
  },
  async markEdited(sessionId: string, waMessageId: string, body: string) {
    await db.update(messages).set({ body, edited: true }).where(and(eq(messages.sessionId, sessionId), eq(messages.waMessageId, waMessageId)));
  },
  async markRevokedByStanza(sessionId: string, target: string, chatId: string | null) {
    // target may be full serialized id or stanza id suffix
    const res = await db.update(messages).set({ revoked: true, body: null, caption: null }).where(and(eq(messages.sessionId, sessionId), sql`(${messages.waMessageId} = ${target} OR ${messages.waMessageId} LIKE ${"%_" + target})`, chatId ? eq(messages.chatId, chatId) : sql`true`)).returning({ id: messages.id });
    return res.length;
  },
  async upsertReaction(sessionId: string, messageId: string, senderId: string, emoji: string, timestamp: number) {
    if (!emoji) { await db.delete(messageReactions).where(and(eq(messageReactions.sessionId, sessionId), eq(messageReactions.messageId, messageId), eq(messageReactions.senderId, senderId))); return; }
    await db.insert(messageReactions).values({ id: newId(), sessionId, messageId, senderId, emoji, timestamp }).onConflictDoUpdate({ target: [messageReactions.sessionId, messageReactions.messageId, messageReactions.senderId], set: { emoji, timestamp } });
  },
  /** Merges a poll vote into the poll_creation message metadata.pollVotes map and returns updated row. */
  async upsertPollVote(sessionId: string, waMessageId: string, senderId: string, selectedOptions: string[]) {
    const m = await this.findByWaId(sessionId, waMessageId);
    if (!m) return null;
    const meta = { ...(m.metadata || {}) } as Record<string, unknown>;
    const votes = { ...(meta.pollVotes as Record<string, string[]> || {}) };
    if (selectedOptions.length === 0) { delete votes[senderId]; } else { votes[senderId] = selectedOptions; }
    meta.pollVotes = votes;
    await db.update(messages).set({ metadata: meta }).where(eq(messages.id, m.id));
    return { ...m, metadata: meta };
  },
  async listByChat(sessionId: string, chatId: string, opts: { limit: number; before?: number; after?: number }) {
    const conds = [eq(messages.sessionId, sessionId), eq(messages.chatId, chatId)];
    if (opts.before) conds.push(lt(messages.timestamp, opts.before));
    if (opts.after) conds.push(gt(messages.timestamp, opts.after));
    const rows = await db.select().from(messages).where(and(...conds)).orderBy(opts.after ? messages.timestamp : desc(messages.timestamp)).limit(opts.limit);
    const ordered = opts.after ? rows : rows.reverse();
    const ids = ordered.map((r) => r.waMessageId);
    const reactions = ids.length ? await db.select().from(messageReactions).where(and(eq(messageReactions.sessionId, sessionId), sql`${messageReactions.messageId} in ${ids}`)) : [];
    const byMsg = new Map<string, { senderId: string; emoji: string }[]>();
    for (const r of reactions) { const l = byMsg.get(r.messageId) ?? []; l.push({ senderId: r.senderId, emoji: r.emoji }); byMsg.set(r.messageId, l); }
    return ordered.map((m) => ({ ...m, rawPayload: undefined, reactions: byMsg.get(m.waMessageId) ?? [] }));
  },
};
