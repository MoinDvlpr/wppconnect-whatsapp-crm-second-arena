/**
 * WhatsApp domain services. Every WPPConnect call in the app passes through here (or campaign/sync services).
 * Method names verified against installed @wppconnect-team/wppconnect 2.3.3 typings.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chats, contacts, messageMedia, waSessions } from "@/db/schema";
import { ApiError, newId, unsupported } from "@/lib/api";
import { toChatId } from "@/lib/ids";
import { logger, timed } from "@/lib/logger";
import { eventBus } from "@/lib/events";
import { ALLOWED_MIME, mediaKind, storage } from "@/lib/storage";
import { sessionManager } from "../wpp/session-manager";
import { normalizeMessage, type NormalizedMessage } from "../wpp/normalize";
import { messageRepo } from "./message.repo";

type AnyClient = Record<string, (...args: unknown[]) => Promise<unknown>>;
const raw = (sessionId: string) => sessionManager.requireClient(sessionId) as unknown as AnyClient;
const has = (sessionId: string, m: string) => typeof raw(sessionId)[m] === "function";
const call = <T = unknown>(sessionId: string, method: string, ...args: unknown[]): Promise<T> => {
  const c = raw(sessionId);
  if (typeof c[method] !== "function") throw unsupported(`${method} is not available in the installed WPPConnect version.`);
  return timed(sessionId, method, () => c[method](...args) as Promise<T>, { chatId: typeof args[0] === "string" ? args[0] : undefined });
};

// ---------------- SessionService ----------------
export const SessionService = {
  async diagnostics(sessionId: string) {
    const rt = sessionManager.getRuntime(sessionId);
    const client = sessionManager.getClient(sessionId);
    const out: Record<string, unknown> = { status: rt.status, hasClient: !!client, qrAttempt: rt.qrAttempt, lastError: rt.lastError, reconnectCount: rt.reconnectCount, lastHeartbeat: rt.lastHeartbeat, loading: rt.loading, browserConnected: false };
    if (client) {
      try { out.browserConnected = client.page && !client.page.isClosed(); } catch { out.browserConnected = false; }
      try { out.browserPid = (client as unknown as { getPID: () => number }).getPID(); } catch { out.browserPid = null; }
      const probe = async (m: string) => { try { return await (client as unknown as AnyClient)[m](); } catch (e) { return { error: (e as Error).message }; } };
      const [connState, connected, authenticated, loggedIn, online, waVersion, wajs, battery, multiDevice] = await Promise.all([
        probe("getConnectionState"), probe("isConnected"), probe("isAuthenticated"), probe("isLoggedIn"), probe("isOnline"), probe("getWAVersion"), probe("getWAJSVersion"), probe("getBatteryLevel"), probe("isMultiDevice"),
      ]);
      Object.assign(out, { connectionState: connState, whatsappConnected: connected, authenticated, loggedIn, online, waVersion, waJsVersion: wajs, battery, multiDevice });
    }
    return out;
  },
  screenshot: (sessionId: string) => call<string>(sessionId, "takeScreenshot"),
  useHere: (sessionId: string) => call<boolean>(sessionId, "useHere"),
  setOnlinePresence: (sessionId: string, online: boolean) => call<boolean>(sessionId, "setOnlinePresence", online),
};

// ---------------- ChatService ----------------
export const ChatService = {
  async listLive(sessionId: string, opts: { onlyGroups?: boolean; onlyUsers?: boolean; onlyWithUnreadMessage?: boolean; count?: number } = {}) { return call(sessionId, "listChats", opts); },
  getById: (sessionId: string, chatId: string) => call(sessionId, "getChatById", toChatId(chatId)),
  async sendSeen(sessionId: string, chatId: string) {
    const r = await call(sessionId, "sendSeen", toChatId(chatId));
    await db.update(chats).set({ unreadCount: 0 }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, toChatId(chatId))));
    eventBus.publish("chat.updated", { chatId: toChatId(chatId), unreadCount: 0 }, { sessionId, chatId: toChatId(chatId) });
    return r;
  },
  async markUnseen(sessionId: string, chatId: string) { const r = await call(sessionId, "markUnseenMessage", toChatId(chatId)); await db.update(chats).set({ unreadCount: 1 }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, toChatId(chatId)))); return r; },
  async archive(sessionId: string, chatId: string, value: boolean) { const r = await call(sessionId, "archiveChat", toChatId(chatId), value); await db.update(chats).set({ isArchived: value }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, toChatId(chatId)))); return r; },
  async pin(sessionId: string, chatId: string, value: boolean) { const r = await call(sessionId, "pinChat", toChatId(chatId), value); await db.update(chats).set({ isPinned: value }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, toChatId(chatId)))); return r; },
  async mute(sessionId: string, chatId: string, time: number, type: "hours" | "days" | "week" | "year") { const r = await call(sessionId, "sendMute", toChatId(chatId), time, type); await db.update(chats).set({ isMuted: true }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, toChatId(chatId)))); return r; },
  clear: (sessionId: string, chatId: string) => call(sessionId, "clearChat", toChatId(chatId)),
  async delete(sessionId: string, chatId: string) { const r = await call(sessionId, "deleteChat", toChatId(chatId)); await db.delete(chats).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, toChatId(chatId)))); return r; },
  setTemporary: (sessionId: string, chatId: string, value: boolean) => call(sessionId, "setTemporaryMessages", toChatId(chatId), value),
};

// ---------------- PresenceService ----------------
export const PresenceService = {
  async get(sessionId: string, chatId: string) {
    const id = toChatId(chatId);
    const [isOnline, lastSeen] = await Promise.all([call<boolean>(sessionId, "getChatIsOnline", id).catch(() => null), call<number | boolean>(sessionId, "getLastSeen", id).catch(() => null)]);
    return { isOnline, lastSeen };
  },
  subscribe: (sessionId: string, chatId: string) => call(sessionId, "subscribePresence", toChatId(chatId)),
  startTyping: (sessionId: string, chatId: string, duration?: number) => call(sessionId, "startTyping", toChatId(chatId), duration),
  stopTyping: (sessionId: string, chatId: string) => call(sessionId, "stopTyping", toChatId(chatId)),
  startRecording: (sessionId: string, chatId: string, duration?: number) => call(sessionId, "startRecording", toChatId(chatId), duration),
  stopRecording: (sessionId: string, chatId: string) => call(sessionId, "stopRecording", toChatId(chatId)),
};

// ---------------- MessageService ----------------
export interface SendTextInput { chatId: string; text: string; quotedMessageId?: string; mentionedList?: string[]; linkPreview?: boolean; }
export interface SendMediaInput { chatId: string; base64: string; mimeType: string; filename: string; caption?: string; quotedMessageId?: string; kind?: "image" | "video" | "audio" | "document" | "sticker" | "ptt" | "gif"; }

async function persistSent(sessionId: string, result: unknown, fallback: { chatId: string; type: string; body?: string | null; caption?: string | null; mediaMimeType?: string | null; mediaFilename?: string | null; location?: NormalizedMessage["location"]; metadata?: Record<string, unknown> }) {
  const r = result as Record<string, unknown> | null;
  const waId = (r?.id as { _serialized?: string } | string | undefined);
  const id = typeof waId === "string" ? waId : waId?._serialized ?? (r?.messageSendResult ? String(r?.id) : null);
  let normalized: NormalizedMessage | null = null;
  if (r && (r.t || r.type)) normalized = normalizeMessage(result as never, sessionId);
  if (!normalized) {
    normalized = { id: id ?? `local_${newId()}`, sessionId, chatId: fallback.chatId, senderId: "me", recipientId: fallback.chatId, timestamp: Math.floor(Date.now() / 1000), type: fallback.type, body: fallback.body ?? null, caption: fallback.caption ?? null, fromMe: true, status: "SENT", ack: 1, quotedMessageId: null, mentionedIds: [], isForwarded: false, isStarred: false, edited: false, revoked: false, hasMedia: !!fallback.mediaMimeType, mediaMimeType: fallback.mediaMimeType ?? null, mediaFilename: fallback.mediaFilename ?? null, mediaSize: null, location: fallback.location ?? null, vcard: null, senderName: null, metadata: fallback.metadata ?? {} };
  } else {
    normalized.fromMe = true;
    if (normalized.status === "READ" && normalized.ack <= 1) normalized.status = "SENT";
    // Merge fallback metadata fields that are missing in the normalized result (e.g. pollOptions for polls sent from CRM)
    if (fallback.metadata) {
      normalized.metadata = { ...fallback.metadata, ...normalized.metadata };
    }
  }
  const { message } = await messageRepo.upsertIncoming(normalized);
  eventBus.publish("message.sent", message, { sessionId, chatId: normalized.chatId });
  return message;
}

export const MessageService = {
  /** Paginated retrieval via current getMessages API; persists into SQL cache. */
  async fetchFromWhatsApp(sessionId: string, chatId: string, params: { count?: number; direction?: "before" | "after"; id?: string }) {
    const id = toChatId(chatId);
    const list = await call<unknown[]>(sessionId, "getMessages", id, { count: params.count ?? 30, direction: params.direction, id: params.id });
    const normalized = list.map((m) => normalizeMessage(m as never, sessionId)).filter((m): m is NormalizedMessage => !!m);
    await messageRepo.bulkUpsert(normalized);
    return normalized;
  },
  async list(sessionId: string, chatId: string, opts: { limit?: number; before?: number; after?: number; refresh?: boolean; beforeId?: string }) {
    const id = toChatId(chatId);
    const limit = Math.min(100, opts.limit ?? 40);
    let rows = await messageRepo.listByChat(sessionId, id, { limit, before: opts.before, after: opts.after });
    if ((rows.length < limit || opts.refresh) && sessionManager.isReady(sessionId)) {
      try {
        if (opts.before && opts.beforeId) await this.fetchFromWhatsApp(sessionId, id, { count: limit, direction: "before", id: opts.beforeId });
        else if (!opts.after) await this.fetchFromWhatsApp(sessionId, id, { count: limit });
        rows = await messageRepo.listByChat(sessionId, id, { limit, before: opts.before, after: opts.after });
      } catch (e) { logger.warn("WPPConnect", "live message fetch failed: " + (e as Error).message, {}, sessionId); }
    }
    return rows;
  },
  getById: (sessionId: string, messageId: string) => call(sessionId, "getMessageById", messageId),
  async sendText(sessionId: string, input: SendTextInput) {
    const chatId = toChatId(input.chatId);
    const options: Record<string, unknown> = {};
    if (input.quotedMessageId) options.quotedMsg = input.quotedMessageId;
    if (input.mentionedList?.length) options.mentionedList = input.mentionedList;
    if (input.linkPreview === false) options.linkPreview = false;
    const result = await call(sessionId, "sendText", chatId, input.text, options);
    return persistSent(sessionId, result, { chatId, type: "chat", body: input.text });
  },
  async sendMedia(sessionId: string, input: SendMediaInput) {
    const chatId = toChatId(input.chatId);
    const dataUrl = input.base64.startsWith("data:") ? input.base64 : `data:${input.mimeType};base64,${input.base64}`;
    const kind = input.kind ?? mediaKind(input.mimeType);
    let result: unknown;
    if (kind === "sticker") result = await call(sessionId, "sendImageAsSticker", chatId, dataUrl);
    else if (kind === "ptt") result = await call(sessionId, "sendPttFromBase64", chatId, dataUrl, input.filename, input.caption, input.quotedMessageId);
    else if (kind === "gif") result = await call(sessionId, "sendVideoAsGifFromBase64", chatId, dataUrl, input.filename, input.caption, input.quotedMessageId);
    else result = await call(sessionId, "sendFile", chatId, dataUrl, { type: kind === "audio" ? "audio" : kind, filename: input.filename, caption: input.caption, mimetype: input.mimeType, quotedMsg: input.quotedMessageId });
    const type = kind === "ptt" ? "ptt" : kind === "gif" ? "video" : kind;
    return persistSent(sessionId, result, { chatId, type, caption: input.caption, mediaMimeType: input.mimeType, mediaFilename: input.filename });
  },
  async sendLocation(sessionId: string, input: { chatId: string; lat: number; lng: number; name?: string; address?: string }) {
    const chatId = toChatId(input.chatId);
    const result = await call(sessionId, "sendLocation", chatId, { lat: input.lat, lng: input.lng, name: input.name, address: input.address, title: input.name });
    return persistSent(sessionId, result, { chatId, type: "location", location: { lat: input.lat, lng: input.lng, name: input.name } });
  },
  async sendContact(sessionId: string, input: { chatId: string; contactId: string; name?: string }) {
    const chatId = toChatId(input.chatId);
    const result = await call(sessionId, "sendContactVcard", chatId, toChatId(input.contactId), input.name);
    return persistSent(sessionId, result, { chatId, type: "vcard", body: input.name ?? input.contactId });
  },
  async sendPoll(sessionId: string, input: { chatId: string; name: string; choices: string[]; selectableCount?: number }) {
    const chatId = toChatId(input.chatId);
    const result = await call(sessionId, "sendPollMessage", chatId, input.name, input.choices, { selectableCount: input.selectableCount ?? 1 });
    // Always store pollName + pollOptions in metadata so that onPollResponse index resolution works
    // regardless of whether the poll was received (normalizeMessage handles it) or sent from CRM.
    const pollOptions = input.choices.map((name, localId) => ({ name, localId }));
    return persistSent(sessionId, result, {
      chatId,
      type: "poll_creation",
      body: input.name,
      metadata: { pollName: input.name, pollOptions },
    });
  },
  async sendList(sessionId: string, input: { chatId: string; buttonText: string; description: string; sections: { title: string; rows: { rowId: string; title: string; description?: string }[] }[] }) {
    const chatId = toChatId(input.chatId);
    const result = await call(sessionId, "sendListMessage", chatId, { buttonText: input.buttonText, description: input.description, sections: input.sections });
    return persistSent(sessionId, result, { chatId, type: "list", body: input.description });
  },
  async react(sessionId: string, messageId: string, emoji: string | false) {
    const r = await call(sessionId, "sendReactionToMessage", messageId, emoji);
    const [s] = await db.select({ wid: waSessions.wid }).from(waSessions).where(eq(waSessions.id, sessionId));
    await messageRepo.upsertReaction(sessionId, messageId, s?.wid ?? "me", emoji || "", Date.now());
    const m = await messageRepo.findByWaId(sessionId, messageId);
    eventBus.publish("reaction.received", { waMessageId: messageId, senderId: s?.wid ?? "me", emoji: emoji || "", chatId: m?.chatId }, { sessionId, chatId: m?.chatId ?? null });
    return r;
  },
  async edit(sessionId: string, messageId: string, newText: string) {
    const r = await call(sessionId, "editMessage", messageId, newText);
    await messageRepo.markEdited(sessionId, messageId, newText);
    const m = await messageRepo.findByWaId(sessionId, messageId);
    eventBus.publish("message.edited", { waMessageId: messageId, body: newText, chatId: m?.chatId }, { sessionId, chatId: m?.chatId ?? null });
    return r;
  },
  async delete(sessionId: string, messageId: string, onlyLocal: boolean) {
    const m = await messageRepo.findByWaId(sessionId, messageId);
    if (!m) throw new ApiError("NOT_FOUND", "Message not found in cache", 404);
    const r = await call(sessionId, "deleteMessage", m.chatId, messageId, onlyLocal);
    await messageRepo.markRevokedByStanza(sessionId, messageId, m.chatId);
    eventBus.publish("message.deleted", { waMessageId: messageId, chatId: m.chatId, onlyLocal }, { sessionId, chatId: m.chatId });
    return r;
  },
  async star(sessionId: string, messageId: string, star: boolean) {
    const r = await call(sessionId, "starMessage", messageId, star);
    const m = await messageRepo.findByWaId(sessionId, messageId);
    if (m) await db.update((await import("@/db/schema")).messages).set({ isStarred: star }).where(eq((await import("@/db/schema")).messages.id, m.id));
    return r;
  },
  async forward(sessionId: string, messageId: string, toChatIds: string[]) {
    const results: Record<string, unknown> = {};
    for (const to of toChatIds) {
      const dest = toChatId(to);
      results[dest] = await call(sessionId, "forwardMessagesV2", dest, [messageId]);
    }
    return results;
  },
  getReactions: (sessionId: string, messageId: string) => call(sessionId, "getReactions", messageId),
  getVotes: (sessionId: string, messageId: string) => call(sessionId, "getVotes", messageId),
  markPlayed: (sessionId: string, messageId: string) => call(sessionId, "markPlayed", messageId),
};

// ---------------- MediaService ----------------
export const MediaService = {
  /** Downloads media via WPPConnect; caches to storage if MEDIA_CACHE=true. */
  async download(sessionId: string, messageId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const m = await messageRepo.findByWaId(sessionId, messageId);
    if (m) {
      const [cached] = await db.select().from(messageMedia).where(eq(messageMedia.messageId, m.id)).limit(1);
      if (cached && (await storage.exists(cached.storagePath))) return { buffer: await storage.get(cached.storagePath), mimeType: cached.mimeType, filename: cached.filename ?? "file" };
    }
    const dataUrl = await call<string>(sessionId, "downloadMedia", messageId);
    if (!dataUrl || typeof dataUrl !== "string") throw new ApiError("MEDIA_UNAVAILABLE", "Media could not be downloaded (may have expired on WhatsApp servers)", 410);
    const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
    const mimeType = match?.[1] ?? m?.mediaMimeType ?? "application/octet-stream";
    const buffer = Buffer.from(match?.[2] ?? dataUrl, "base64");
    const filename = m?.mediaFilename ?? `${messageId.split("_").pop()}.${mimeType.split("/")[1]?.split(";")[0] ?? "bin"}`;
    if (m && process.env.MEDIA_CACHE !== "false") {
      try {
        const stored = await storage.put(buffer, { mimeType, filename, folder: "media" });
        await db.insert(messageMedia).values({ id: newId(), messageId: m.id, sessionId, chatId: m.chatId, mimeType, filename, size: buffer.length, storagePath: stored.key });
      } catch (e) { logger.warn("System", "media cache write failed: " + (e as Error).message, {}, sessionId); }
    }
    return { buffer, mimeType, filename };
  },
  validateUpload(mimeType: string, size: number, max: number) {
    if (!ALLOWED_MIME.has(mimeType) && !mimeType.startsWith("image/") && !mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) throw new ApiError("INVALID_FILE_TYPE", `File type ${mimeType} is not allowed`, 415);
    if (size > max) throw new ApiError("FILE_TOO_LARGE", `File exceeds ${Math.round(max / 1024 / 1024)}MB limit`, 413);
  },
};

// ---------------- ContactService ----------------
export const ContactService = {
  async checkNumber(sessionId: string, phoneOrId: string) {
    const id = toChatId(phoneOrId);
    const r = await call<Record<string, unknown>>(sessionId, "checkNumberStatus", id);
    const exists = Boolean(r?.numberExists ?? r?.canReceiveMessage);

    // WPPConnect may return a @lid serialized ID for newer WhatsApp accounts.
    // Resolve it to the canonical @c.us phone-based ID.
    let rawWaId = (r?.id as { _serialized?: string })?._serialized ?? id;
    if (rawWaId.endsWith("@lid")) {
      try {
        const entry = await this.getPnLidEntry(sessionId, rawWaId);
        const phone = (entry?.phoneNumber as { _serialized?: string })?._serialized;
        if (phone) rawWaId = phone;
      } catch {
        // getPnLidEntry may fail on older sessions; keep rawWaId as-is
      }
    }

    // Extract a clean phone-number string for the response
    const waId = rawWaId;
    const phone = rawWaId.endsWith("@c.us") || rawWaId.endsWith("@s.whatsapp.net")
      ? rawWaId.split("@")[0]
      : null;

    return { exists, waId, phone, raw: r };
  },
  getPnLidEntry: (sessionId: string, phoneOrLid: string) => call<Record<string, unknown> | null>(sessionId, "getPnLidEntry", phoneOrLid),
  async resolveAndLinkWaId(sessionId: string, waId: string) {
    if (!waId || (!waId.endsWith("@c.us") && !waId.endsWith("@lid"))) return null;
    try {
      const [existing] = await db.select({ linkedWaId: contacts.linkedWaId }).from(contacts).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, waId))).limit(1);
      if (existing?.linkedWaId) return existing.linkedWaId;
      const entry = await this.getPnLidEntry(sessionId, waId);
      if (!entry) return null;
      const lid = (entry.lid as { _serialized?: string })?._serialized;
      const phone = (entry.phoneNumber as { _serialized?: string })?._serialized;
      if (!lid || !phone) return null;
      const linkedWaId = waId === lid ? phone : lid;
      await db.update(contacts).set({ linkedWaId, lid, phone: (entry.phoneNumber as { id?: string })?.id ?? phone.split("@")[0] }).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, waId)));
      await db.update(chats).set({ linkedWaId }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, waId)));
      await db.update(contacts).set({ linkedWaId: waId, lid, phone: (entry.phoneNumber as { id?: string })?.id ?? phone.split("@")[0] }).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, linkedWaId)));
      await db.update(chats).set({ linkedWaId: waId }).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, linkedWaId)));
      return linkedWaId;
    } catch (e) {
      logger.warn("WPPConnect", "Failed to resolve PnLidEntry", { waId, error: (e as Error).message }, sessionId);
      return null;
    }
  },
  getLive: (sessionId: string, contactId: string) => call(sessionId, "getContact", toChatId(contactId)),
  async getAbout(sessionId: string, contactId: string) { const r = await call<{ status?: string }>(sessionId, "getStatus", toChatId(contactId)); return r?.status ?? null; },
  async getPicture(sessionId: string, contactId: string) {
    const r = await call<{ eurl?: string; imgFull?: string; img?: string }>(sessionId, "getProfilePicFromServer", toChatId(contactId));
    const url = r?.imgFull ?? r?.eurl ?? r?.img ?? null;
    if (url) await db.update(contacts).set({ avatarUrl: url }).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, toChatId(contactId))));
    return url;
  },
  async block(sessionId: string, contactId: string, block: boolean) {
    const r = await call(sessionId, block ? "blockContact" : "unblockContact", toChatId(contactId));
    await db.update(contacts).set({ isBlocked: block }).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, toChatId(contactId))));
    return r;
  },
  blockList: (sessionId: string) => call<string[]>(sessionId, "getBlockList"),
  commonGroups: (sessionId: string, contactId: string) => call(sessionId, "getCommonGroups", toChatId(contactId)),
};

// ---------------- GroupService ----------------
export const GroupService = {
  async create(sessionId: string, name: string, participants: string[]) { const r = await call(sessionId, "createGroup", name, participants.map(toChatId)); return r; },
  members: (s: string, g: string) => call(s, "getGroupMembers", toChatId(g)),
  admins: (s: string, g: string) => call(s, "getGroupAdmins", toChatId(g)),
  inviteLink: (s: string, g: string) => call<string>(s, "getGroupInviteLink", toChatId(g)),
  revokeInviteLink: (s: string, g: string) => call<string>(s, "revokeGroupInviteLink", toChatId(g)),
  join: (s: string, code: string) => call(s, "joinGroup", code),
  inviteInfo: (s: string, code: string) => call(s, "getGroupInfoFromInviteLink", code),
  addParticipants: (s: string, g: string, ids: string[]) => call(s, "addParticipant", toChatId(g), ids.map(toChatId)),
  removeParticipants: (s: string, g: string, ids: string[]) => call(s, "removeParticipant", toChatId(g), ids.map(toChatId)),
  promote: (s: string, g: string, ids: string[]) => call(s, "promoteParticipant", toChatId(g), ids.map(toChatId)),
  demote: (s: string, g: string, ids: string[]) => call(s, "demoteParticipant", toChatId(g), ids.map(toChatId)),
  setSubject: (s: string, g: string, v: string) => call(s, "setGroupSubject", toChatId(g), v),
  setDescription: (s: string, g: string, v: string) => call(s, "setGroupDescription", toChatId(g), v),
  setProperty: (s: string, g: string, property: "announcement" | "restrict" | "ephemeral", value: boolean) => call(s, "setGroupProperty", toChatId(g), property, value),
  setAdminsOnly: (s: string, g: string, v: boolean) => call(s, "setMessagesAdminsOnly", toChatId(g), v),
  setIcon: (s: string, g: string, base64: string) => call(s, "setGroupIcon", toChatId(g), base64),
  removeIcon: (s: string, g: string) => call(s, "removeGroupIcon", toChatId(g)),
  leave: (s: string, g: string) => call(s, "leaveGroup", toChatId(g)),
  membershipRequests: (s: string, g: string) => call(s, "getGroupMembershipRequests", toChatId(g)),
  approve: (s: string, g: string, ids: string[]) => call(s, "approveGroupMembershipRequest", toChatId(g), ids),
  reject: (s: string, g: string, ids: string[]) => call(s, "rejectGroupMembershipRequest", toChatId(g), ids),
  sizeLimit: (s: string) => call<number>(s, "getGroupSizeLimit"),
};

// ---------------- ProfileService ----------------
export const ProfileService = {
  async get(sessionId: string) {
    const client = sessionManager.requireClient(sessionId);
    const [name, status, host, wid] = await Promise.all([client.getProfileName().catch(() => null), client.getProfileStatus().catch(() => null), client.getHostDevice().catch(() => null), client.getWid().catch(() => null)]);
    let business: unknown = null;
    if (wid && has(sessionId, "getBusinessProfile")) { try { business = await call(sessionId, "getBusinessProfile", wid); } catch (e) { business = { error: (e as Error).message }; } }
    return { name, about: status, wid, host, business };
  },
  setName: (s: string, name: string) => call(s, "setProfileName", name),
  setAbout: (s: string, about: string) => call(s, "setProfileStatus", about),
  setPicture: (s: string, base64: string) => call(s, "setProfilePic", base64),
  removePicture: (s: string) => call(s, "removeMyProfilePicture"),
  editBusiness: (s: string, opts: Record<string, unknown>) => call(s, "editBusinessProfile", opts),
  getBusiness: (s: string, id: string) => call(s, "getBusinessProfile", toChatId(id)),
};

// ---------------- CatalogService ----------------
export const CatalogService = {
  async products(sessionId: string, contactId?: string, qty = 50) {
    const client = sessionManager.requireClient(sessionId);
    const id = contactId ? toChatId(contactId) : await client.getWid();
    return call(sessionId, "getProducts", id, qty);
  },
  product: (s: string, ownerId: string, productId: string) => call(s, "getProductById", toChatId(ownerId), productId),
  create: (s: string, p: { name: string; image: string; description: string; price: number; isHidden: boolean; url: string; retailerId: string; currency: string }) => call(s, "createProduct", p.name, p.image, p.description, p.price, p.isHidden, p.url, p.retailerId, p.currency),
  edit: (s: string, productId: string, options: Record<string, unknown>) => call(s, "editProduct", productId, options),
  remove: (s: string, ids: string[]) => call(s, "delProducts", ids),
  setVisibility: (s: string, id: string, v: boolean) => call(s, "setProductVisibility", id, v),
  async collections(sessionId: string, contactId?: string) { const client = sessionManager.requireClient(sessionId); const id = contactId ? toChatId(contactId) : await client.getWid(); return call(sessionId, "getCollections", id, "50", "20"); },
  sendProduct: (s: string, to: string, base64: string, caption: string, businessId: string, productId: string) => call(s, "sendImageWithProduct", toChatId(to), base64, caption, businessId, productId),
  businessProducts: (s: string, id: string) => call(s, "getBusinessProfilesProducts", toChatId(id)),
};

// ---------------- StatusService ----------------
export const StatusService = {
  /** Status/stories: WPPConnect 2.3.3 exposes send + read functions; listing others' statuses = messages of status@broadcast chat. */
  async list(sessionId: string, count = 50) {
    try { const list = await call<unknown[]>(sessionId, "getMessages", "status@broadcast", { count }); return list.map((m) => normalizeMessage(m as never, sessionId)).filter(Boolean); }
    catch (e) { logger.warn("WPPConnect", "status list failed: " + (e as Error).message, {}, sessionId); return []; }
  },
  sendText: (s: string, text: string, opts: { backgroundColor?: string; font?: number }) => call(s, "sendTextStatus", text, opts),
  sendImage: (s: string, base64: string, caption?: string) => call(s, "sendImageStatus", base64, { caption }),
  sendVideo: (s: string, base64: string, caption?: string) => call(s, "sendVideoStatus", base64, { caption }),
  markRead: (s: string, chatId: string, statusId: string) => call(s, "sendReadStatus", toChatId(chatId), statusId),
};

// ---------------- ChannelService ----------------
export const ChannelService = {
  /** Lists newsletter chats through listChats and filters by @newsletter server (no dedicated list function in 2.3.3). */
  async list(sessionId: string) {
    const all = await call<{ id: { _serialized?: string; server?: string }; name?: string; formattedTitle?: string; unreadCount?: number; t?: number; isReadOnly?: boolean }[]>(sessionId, "listChats", {});
    return all.filter((c) => c.id?.server === "newsletter" || c.id?._serialized?.endsWith("@newsletter")).map((c) => ({ id: c.id._serialized, name: c.name ?? c.formattedTitle ?? c.id._serialized, unreadCount: c.unreadCount ?? 0, lastActivity: c.t ? new Date(c.t * 1000).toISOString() : null, isReadOnly: !!c.isReadOnly }));
  },
  create: (s: string, name: string, opts: { description?: string; picture?: string }) => call(s, "createNewsletter", name, opts),
  edit: (s: string, id: string, opts: { name?: string; description?: string; picture?: string | null }) => call(s, "editNewsletter", id, opts),
  destroy: (s: string, id: string) => call(s, "destroyNewsletter", id),
  mute: (s: string, id: string) => call(s, "muteNesletter", id),
  messages: (s: string, id: string, count = 30) => MessageService.list(s, id, { limit: count }),
};

// ---------------- Native LabelService ----------------
export const NativeLabelService = {
  list: (s: string) => call<unknown[]>(s, "getAllLabels"),
  create: (s: string, name: string, color?: number) => call(s, "addNewLabel", name, color !== undefined ? { labelColor: color } : undefined),
  remove: (s: string, id: string) => call(s, "deleteLabel", id),
  assign: (s: string, chatId: string, labelId: string, type: "add" | "remove") => call(s, "addOrRemoveLabels", toChatId(chatId), [{ labelId, type }]),
};

/** Generic whitelisted invoker for the Developer capability explorer. */
export async function invokeCapability(sessionId: string, method: string, args: unknown[]) {
  const { getCapability } = await import("../wpp/capability-registry");
  const c = getCapability(method);
  if (!c || !c.explorer) throw new ApiError("METHOD_NOT_ALLOWED", "Method is not whitelisted for the explorer", 403);
  const start = Date.now();
  const result = await call(sessionId, method, ...args);
  return { result, durationMs: Date.now() - start };
}
