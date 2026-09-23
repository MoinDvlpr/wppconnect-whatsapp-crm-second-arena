import type { Chat, Contact, Message } from "@wppconnect-team/wppconnect";
import { normalizeWhatsAppId, type WaIdKind } from "@/lib/ids";

export interface NormalizedMessage {
  id: string; sessionId: string; chatId: string; senderId: string | null; recipientId: string | null; timestamp: number;
  type: string; body: string | null; caption: string | null; fromMe: boolean; status: MessageStatus; ack: number;
  quotedMessageId: string | null; mentionedIds: string[]; isForwarded: boolean; isStarred: boolean; edited: boolean; revoked: boolean;
  hasMedia: boolean; mediaMimeType: string | null; mediaFilename: string | null; mediaSize: number | null;
  location: { lat: number; lng: number; name?: string } | null; vcard: string | null; senderName: string | null;
  metadata: Record<string, unknown>; rawPayload?: unknown;
}
export type MessageStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "PLAYED" | "FAILED";
export interface NormalizedChat {
  waId: string; sessionId: string; kind: WaIdKind; name: string; unreadCount: number; lastMessageAt: Date | null;
  isArchived: boolean; isPinned: boolean; isMuted: boolean; isReadOnly: boolean; avatarUrl: string | null; rawPayload?: unknown;
}
export interface NormalizedContact {
  waId: string; sessionId: string; phone: string | null; lid: string | null; name: string | null; pushName: string | null;
  isBusiness: boolean; isMyContact: boolean; isWaContact: boolean; avatarUrl: string | null; rawPayload?: unknown;
}
export interface NormalizedGroup {
  waId: string; sessionId: string; subject: string; description: string | null; ownerId: string | null; participantCount: number;
  isAnnounce: boolean; isRestricted: boolean; participants: { waId: string; isAdmin: boolean; isSuperAdmin: boolean }[]; rawPayload?: unknown;
}

const g = (o: unknown, k: string): unknown => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);
const idOf = (v: unknown): string | null => normalizeWhatsAppId(v)?.id ?? null;
const str = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);

/**
 * Normalises the raw WhatsApp `pollOptions` field into a stable
 * `{ name: string; localId: number }[]` shape.
 *
 * WhatsApp / wa-js may return:
 *  - `{ name: string; localId?: number }[]`  (most common)
 *  - `string[]`  (plain text options, older firmwares)
 *  - anything else → treated as empty
 *
 * The `localId` (0-based index) is what `onPollResponse` uses in
 * `selectedOptions: number[]` to identify which option was picked.
 */
function normalizePollOptions(raw: unknown): { name: string; localId: number }[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item: unknown, i: number) => {
    if (typeof item === "string") return { name: item, localId: i };
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : String(o.name ?? i);
      const localId = typeof o.localId === "number" ? o.localId : i;
      return { name, localId };
    }
    return { name: String(item ?? i), localId: i };
  });
}

export function ackToStatus(ack: number | undefined | null, fromMe: boolean): MessageStatus {
  if (!fromMe) return "READ";
  switch (ack) { case -1: return "FAILED"; case 0: return "PENDING"; case 1: return "SENT"; case 2: return "DELIVERED"; case 3: return "READ"; case 4: return "PLAYED"; default: return "PENDING"; }
}

export function normalizeMessage(raw: Message, sessionId: string, keepRaw = false): NormalizedMessage | null {
  const m = raw as unknown as Record<string, unknown>;
  const idObj = m.id as { _serialized?: string; remote?: unknown; fromMe?: boolean } | string;
  const id = typeof idObj === "string" ? idObj : idObj?._serialized;
  if (!id) return null;
  const fromMe = Boolean(m.fromMe ?? (typeof idObj === "object" ? idObj.fromMe : false));
  const chatId = idOf(m.chatId) ?? idOf(typeof idObj === "object" ? idObj.remote : null) ?? (fromMe ? idOf(m.to) : idOf(m.from));
  if (!chatId) return null;
  const type = String(m.type || "chat");
  const author = idOf(m.author);
  const from = idOf(m.from);
  const isGroup = chatId.endsWith("@g.us");
  const senderId = fromMe ? idOf(m.to && (m.self === "in" ? m.from : null)) ?? "me" : isGroup ? author ?? from : from;
  const mediaTypes = new Set(["image", "video", "audio", "ptt", "document", "sticker"]);
  const hasMedia = mediaTypes.has(type) || Boolean(m.mimetype && m.mediaKey);
  const quoted = m.quotedMsgId ?? (m.quotedStanzaID ? `${fromMe}_${chatId}_${m.quotedStanzaID}` : null) ?? g(m.quotedMsg, "id");
  const quotedId = typeof quoted === "string" ? quoted : (quoted && typeof quoted === "object" ? (quoted as { _serialized?: string })._serialized ?? null : null);
  const loc = type === "location" || type === "live_location" ? { lat: Number(m.lat), lng: Number(m.lng), name: str(m.loc) ?? undefined } : null;
  const ts = Number(m.t ?? m.timestamp ?? Math.floor(Date.now() / 1000));
  return {
    id, sessionId, chatId, senderId, recipientId: fromMe ? chatId : "me", timestamp: ts > 1e12 ? Math.floor(ts / 1000) : ts,
    type, body: mediaTypes.has(type) ? null : str(m.body) ?? str(m.content), caption: mediaTypes.has(type) ? str(m.caption) ?? str(m.body) : null,
    fromMe, status: ackToStatus(Number(m.ack ?? 0), fromMe), ack: Number(m.ack ?? 0), quotedMessageId: quotedId,
    mentionedIds: Array.isArray(m.mentionedJidList) ? (m.mentionedJidList as unknown[]).map(idOf).filter((x): x is string => !!x) : [],
    isForwarded: Boolean(m.isForwarded), isStarred: Boolean(m.star), edited: Boolean(m.latestEditMsgKey || m.isEdited), revoked: type === "revoked",
    hasMedia, mediaMimeType: str(m.mimetype), mediaFilename: str(m.filename), mediaSize: typeof m.size === "number" ? m.size : null,
    location: loc, vcard: type === "vcard" ? str(m.body) : null, senderName: str(m.notifyName) ?? str(g(m.sender, "pushname")) ?? str(g(m.sender, "name")),
    metadata: { subtype: m.subtype, isViewOnce: m.isViewOnce, duration: m.duration, pollName: g(m, "pollName"), pollOptions: normalizePollOptions(g(m, "pollOptions")), width: m.width, height: m.height, title: m.title, description: m.description, thumbnail: typeof m.thumbnail === "string" ? undefined : undefined },
    rawPayload: keepRaw ? raw : undefined,
  };
}

export function normalizeChat(raw: Chat, sessionId: string): NormalizedChat | null {
  const c = raw as unknown as Record<string, unknown>;
  const n = normalizeWhatsAppId(c.id);
  if (!n) return null;
  const contact = c.contact as Record<string, unknown> | undefined;
  const name = str(c.name) ?? str(c.formattedTitle) ?? str(contact?.name) ?? str(contact?.pushname) ?? str(contact?.formattedName) ?? n.user;
  const t = Number(c.t ?? 0);
  const pic = g(contact?.profilePicThumbObj, "eurl") ?? g(contact?.profilePicThumbObj, "img");
  return {
    waId: n.id, sessionId, kind: c.isGroup ? "group" : n.kind, name, unreadCount: Number(c.unreadCount ?? 0),
    lastMessageAt: t ? new Date(t * 1000) : null, isArchived: Boolean(c.archive), isPinned: Boolean(c.pin), isMuted: Number(c.muteExpiration ?? 0) > 0,
    isReadOnly: Boolean(c.isReadOnly), avatarUrl: typeof pic === "string" ? pic : null,
  };
}

export function normalizeContact(raw: Contact, sessionId: string): NormalizedContact | null {
  const c = raw as unknown as Record<string, unknown>;
  const n = normalizeWhatsAppId(c.id);
  if (!n || (n.kind !== "user" && n.kind !== "lid")) return null;
  const pic = g(c.profilePicThumbObj, "eurl") ?? g(c.profilePicThumbObj, "img");
  return {
    waId: n.id, sessionId, phone: n.phone, lid: idOf(c.lid) ?? (n.kind === "lid" ? n.id : null), name: str(c.name) ?? str(c.formattedName) ?? str(c.shortName),
    pushName: str(c.pushname), isBusiness: Boolean(c.isBusiness), isMyContact: Boolean(c.isMyContact), isWaContact: c.isWAContact !== false,
    avatarUrl: typeof pic === "string" ? pic : null,
  };
}

export function normalizeGroup(raw: Chat, sessionId: string): NormalizedGroup | null {
  const c = raw as unknown as Record<string, unknown>;
  const n = normalizeWhatsAppId(c.id);
  if (!n || n.kind !== "group") return null;
  const meta = (c.groupMetadata ?? {}) as Record<string, unknown>;
  const parts = Array.isArray(meta.participants) ? (meta.participants as Record<string, unknown>[]) : [];
  return {
    waId: n.id, sessionId, subject: str(meta.subject) ?? str(c.name) ?? str(c.formattedTitle) ?? n.user, description: str(meta.desc), ownerId: idOf(meta.owner),
    participantCount: parts.length || Number(meta.size ?? 0), isAnnounce: Boolean(meta.announce), isRestricted: Boolean(meta.restrict),
    participants: parts.map((p) => ({ waId: idOf(p.id) ?? "", isAdmin: Boolean(p.isAdmin), isSuperAdmin: Boolean(p.isSuperAdmin) })).filter((p) => p.waId),
  };
}

export function messagePreview(m: NormalizedMessage): string {
  if (m.revoked) return "🚫 Message deleted";
  switch (m.type) {
    case "chat": return m.body ?? "";
    case "image": return m.caption ? `📷 ${m.caption}` : "📷 Photo";
    case "video": return m.caption ? `🎥 ${m.caption}` : "🎥 Video";
    case "audio": case "ptt": return "🎤 Audio";
    case "document": return `📄 ${m.mediaFilename ?? "Document"}`;
    case "sticker": return "🧩 Sticker";
    case "location": case "live_location": return "📍 Location";
    case "vcard": case "multi_vcard": return "👤 Contact";
    case "poll_creation": return "📊 Poll";
    default: return m.body ?? m.type;
  }
}
