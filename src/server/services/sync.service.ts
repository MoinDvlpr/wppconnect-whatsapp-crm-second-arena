import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chats, contacts, groupMembers, groups, waSessions } from "@/db/schema";
import { newId } from "@/lib/api";
import { logger, timed } from "@/lib/logger";
import { sessionManager } from "../wpp/session-manager";
import { normalizeChat, normalizeContact, normalizeGroup, normalizeMessage } from "../wpp/normalize";
import { messageRepo } from "./message.repo";
import { eventBus } from "@/lib/events";

/** Initial / periodic synchronization: WPPConnect is the source of truth; DB is the CRM cache. */
export async function syncSession(sessionId: string, opts: { messagesPerChat?: number; maxChats?: number } = {}) {
  const client = sessionManager.requireClient(sessionId);
  const stats = { contacts: 0, chats: 0, groups: 0, messages: 0 };
  // Contacts
  try {
    const list = await timed(sessionId, "getAllContacts", () => client.getAllContacts());
    for (const raw of list) {
      const c = normalizeContact(raw, sessionId); if (!c) continue;
      await db.insert(contacts).values({ id: newId(), sessionId, waId: c.waId, phone: c.phone, lid: c.lid, name: c.name, pushName: c.pushName, isBusiness: c.isBusiness, isMyContact: c.isMyContact, isWaContact: c.isWaContact, avatarUrl: c.avatarUrl })
        .onConflictDoUpdate({ target: [contacts.sessionId, contacts.waId], set: { name: c.name ?? undefined, pushName: c.pushName ?? undefined, phone: c.phone ?? undefined, lid: c.lid ?? undefined, isBusiness: c.isBusiness, isMyContact: c.isMyContact, avatarUrl: c.avatarUrl ?? undefined, updatedAt: new Date() } });
      stats.contacts++;
    }
  } catch (e) { logger.error("Session", "contact sync failed", e, {}, sessionId); }
  // Chats (current API: listChats)
  try {
    const list = await timed(sessionId, "listChats", () => client.listChats({ count: opts.maxChats ?? 200 }));
    for (const raw of list) {
      const c = normalizeChat(raw, sessionId); if (!c) continue;
      await db.insert(chats).values({ id: newId(), sessionId, waId: c.waId, kind: c.kind, name: c.name, unreadCount: c.unreadCount, lastMessageAt: c.lastMessageAt, isArchived: c.isArchived, isPinned: c.isPinned, isMuted: c.isMuted, isReadOnly: c.isReadOnly, avatarUrl: c.avatarUrl })
        .onConflictDoUpdate({ target: [chats.sessionId, chats.waId], set: { name: c.name, kind: c.kind, unreadCount: c.unreadCount, isArchived: c.isArchived, isPinned: c.isPinned, isMuted: c.isMuted, isReadOnly: c.isReadOnly, avatarUrl: c.avatarUrl ?? undefined, updatedAt: new Date() } });
      stats.chats++;
      if (c.kind === "group") { try { const g = normalizeGroup(raw, sessionId); if (g) { await upsertGroup(sessionId, g); stats.groups++; } } catch { /* ignore */ } }
    }
    // Recent messages for the most recent chats (paginated, deduplicated)
    const recent = list.slice(0, 30);
    for (const raw of recent) {
      const c = normalizeChat(raw, sessionId); if (!c) continue;
      try {
        const msgs = await client.getMessages(c.waId, { count: opts.messagesPerChat ?? 20 });
        const normalized = msgs.map((m) => normalizeMessage(m, sessionId)).filter((m): m is NonNullable<typeof m> => !!m);
        stats.messages += await messageRepo.bulkUpsert(normalized);
        const last = normalized.at(-1);
        if (last) await db.update(chats).set({ lastMessagePreview: (await import("../wpp/normalize")).messagePreview(last), lastMessageType: last.type, lastMessageFromMe: last.fromMe }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, c.waId)));
      } catch (e) { logger.warn("Session", `message sync failed for chat: ${(e as Error).message}`, {}, sessionId); }
    }
  } catch (e) { logger.error("Session", "chat sync failed", e, {}, sessionId); }
  await db.update(waSessions).set({ lastSyncAt: new Date() }).where(eq(waSessions.id, sessionId));
  eventBus.publish("chat.updated", { action: "sync", stats }, { sessionId });
  logger.info("Session", "sync completed", stats, sessionId);
  return stats;
}

export async function upsertGroup(sessionId: string, g: ReturnType<typeof normalizeGroup> & object) {
  const [row] = await db.insert(groups).values({ id: newId(), sessionId, waId: g.waId, subject: g.subject, description: g.description, ownerId: g.ownerId, participantCount: g.participantCount, isAnnounce: g.isAnnounce, isRestricted: g.isRestricted })
    .onConflictDoUpdate({ target: [groups.sessionId, groups.waId], set: { subject: g.subject, description: g.description, ownerId: g.ownerId, participantCount: g.participantCount, isAnnounce: g.isAnnounce, isRestricted: g.isRestricted, updatedAt: new Date() } }).returning();
  if (g.participants.length) {
    await db.delete(groupMembers).where(eq(groupMembers.groupId, row.id));
    await db.insert(groupMembers).values(g.participants.map((p) => ({ id: newId(), groupId: row.id, sessionId, waId: p.waId, isAdmin: p.isAdmin, isSuperAdmin: p.isSuperAdmin }))).onConflictDoNothing();
  }
  return row;
}

export async function syncGroup(sessionId: string, groupId: string) {
  const client = sessionManager.requireClient(sessionId);
  const raw = await client.getChatById(groupId);
  const g = normalizeGroup(raw, sessionId);
  if (!g) return null;
  if (!g.participants.length) {
    try {
      const members = await client.getGroupMembers(groupId);
      const admins = await client.getGroupAdmins(groupId).catch(() => []);
      const adminSet = new Set((admins as unknown as { _serialized?: string }[]).map((a) => a?._serialized ?? String(a)));
      g.participants = members.map((m) => { const id = (m.id as unknown as { _serialized?: string })?._serialized ?? String(m.id); return { waId: id, isAdmin: adminSet.has(id), isSuperAdmin: false }; });
      g.participantCount = g.participants.length;
    } catch { /* ignore */ }
  }
  return upsertGroup(sessionId, g);
}
