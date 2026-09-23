/** WhatsApp ID normalization. IDs are NOT always phone numbers (@lid, @g.us, @newsletter, status@broadcast). */
export type WaIdKind = "user" | "group" | "lid" | "broadcast" | "status" | "newsletter" | "unknown";

export interface NormalizedWaId {
  id: string;
  kind: WaIdKind;
  user: string;
  server: string;
  phone: string | null; // digits only, only for @c.us
}

const SERVER_KIND: Record<string, WaIdKind> = {
  "c.us": "user",
  "s.whatsapp.net": "user",
  "g.us": "group",
  "lid": "lid",
  "broadcast": "broadcast",
  "newsletter": "newsletter",
};

export function normalizePhoneNumber(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

export function normalizeWhatsAppId(raw: unknown): NormalizedWaId | null {
  let id: string | null = null;
  if (typeof raw === "string") id = raw;
  else if (raw && typeof raw === "object") {
    const o = raw as { _serialized?: string; user?: string; server?: string };
    if (o._serialized) id = o._serialized;
    else if (o.user && o.server) id = `${o.user}@${o.server}`;
  }
  if (!id) return null;
  id = id.trim();
  if (id === "status@broadcast") return { id, kind: "status", user: "status", server: "broadcast", phone: null };
  if (!id.includes("@")) {
    const phone = normalizePhoneNumber(id);
    if (!phone) return null;
    id = `${phone}@c.us`;
  }
  const [user, serverRaw] = id.split("@");
  let server = serverRaw;
  if (server === "s.whatsapp.net") { server = "c.us"; id = `${user}@c.us`; }
  const kind = SERVER_KIND[server] ?? "unknown";
  return { id, kind, user, server, phone: kind === "user" ? normalizePhoneNumber(user) : null };
}

export function toChatId(raw: string): string {
  const n = normalizeWhatsAppId(raw);
  if (!n) throw new Error(`Invalid WhatsApp ID: ${raw}`);
  return n.id;
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  return `+${phone}`;
}

export function isGroupId(id: string) { return id.endsWith("@g.us"); }
