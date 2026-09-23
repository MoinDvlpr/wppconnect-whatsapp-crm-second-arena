/**
 * Integration tests: run the real API router against the real database (SUPABASE_DB_URL from .env).
 * No WPPConnect session is started (sessions are created with start:false); WhatsApp-bound endpoints
 * must respond with SESSION_NOT_READY instead of faking success.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
process.env.WPP_AUTO_RESTORE = "false";
import { db } from "@/db";
import { apiKeys, campaignRecipients, campaigns, contacts, labels, templates, waSessions, webhookDeliveries, webhooks } from "@/db/schema";
import { generateApiKey } from "@/lib/auth";
import { dispatch } from "@/server/api/router";
import "@/server/api/routes";
import { messageRepo } from "@/server/services/message.repo";
import { resolveAudience } from "@/server/services/campaign.service";

const run = Date.now().toString(36);
const keys: Record<string, string> = {};
const created = { keys: [] as string[], sessions: [] as string[], templates: [] as string[], webhooks: [] as string[], labels: [] as string[], campaigns: [] as string[] };
async function call(role: keyof typeof keys, method: string, path: string, body?: unknown, allowed?: string) {
  const res = await dispatch(new Request(`http://test.local/api/v1${path}`, { method, headers: { "x-api-key": allowed ?? keys[role], "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), path.split("?")[0].split("/").filter(Boolean));
  const json = await res.json();
  return { status: res.status, ...json } as { status: number; success: boolean; data: never; error?: { code: string; message: string } };
}
async function makeKey(role: string, allowedSessions: string[] = []) { const k = generateApiKey(); const id = crypto.randomUUID(); await db.insert(apiKeys).values({ id, name: `it-${role}-${run}`, keyHash: k.hash, prefix: k.prefix, role, allowedSessions }); created.keys.push(id); return k.raw; }

beforeAll(async () => { keys.ADMIN = await makeKey("ADMIN"); keys.OPERATOR = await makeKey("OPERATOR"); keys.VIEWER = await makeKey("VIEWER"); });
afterAll(async () => {
  if (created.campaigns.length) { await db.delete(campaignRecipients).where(inArray(campaignRecipients.campaignId, created.campaigns)); await db.delete(campaigns).where(inArray(campaigns.id, created.campaigns)); }
  for (const s of created.sessions) await db.delete(contacts).where(eq(contacts.sessionId, s));
  if (created.sessions.length) await db.delete(waSessions).where(inArray(waSessions.id, created.sessions));
  if (created.templates.length) await db.delete(templates).where(inArray(templates.id, created.templates));
  if (created.webhooks.length) { await db.delete(webhookDeliveries).where(inArray(webhookDeliveries.webhookId, created.webhooks)); await db.delete(webhooks).where(inArray(webhooks.id, created.webhooks)); }
  if (created.labels.length) await db.delete(labels).where(inArray(labels.id, created.labels));
  if (created.keys.length) await db.delete(apiKeys).where(inArray(apiKeys.id, created.keys));
});

describe("API key authentication & RBAC", () => {
  it("rejects missing / invalid keys", async () => { const r = await call("VIEWER", "GET", "/sessions", undefined, "wacrm_invalid"); expect(r.status).toBe(401); expect(r.error?.code).toBe("UNAUTHORIZED"); });
  it("enforces roles", async () => { const r = await call("VIEWER", "POST", "/templates", { name: "x", body: "y" }); expect(r.status).toBe(403); expect(r.error?.code).toBe("FORBIDDEN"); const a = await call("VIEWER", "GET", "/api-keys"); expect(a.status).toBe(403); });
  it("returns the envelope on unknown routes", async () => { const r = await call("ADMIN", "GET", "/does-not-exist"); expect(r.status).toBe(404); expect(r.success).toBe(false); });
});

describe("sessions", () => {
  it("creates a session without starting a browser and reports status", async () => {
    const r = await call("ADMIN", "POST", "/sessions", { name: `IT ${run}`, start: false, autoStart: false }); expect(r.status).toBe(200);
    const s = r.data as unknown as { id: string; slug: string; status: string }; created.sessions.push(s.id); expect(s.slug).toContain("it-"); expect(s.status).toBe("STOPPED");
    const st = await call("VIEWER", "GET", `/sessions/${s.id}/status`); expect((st.data as unknown as { status: string }).status).toBe("STOPPED");
    const qr = await call("VIEWER", "GET", `/sessions/${s.id}/qr`); expect((qr.data as unknown as { qr: string | null }).qr).toBeNull();
  });
  it("restricts API keys to allowed sessions", async () => {
    const restricted = await makeKey("OPERATOR", ["some-other-session"]);
    const r = await call("OPERATOR", "GET", `/sessions/${created.sessions[0]}`, undefined, restricted); expect(r.status).toBe(403);
  });
  it("WhatsApp-bound endpoints fail honestly when the session is not ready", async () => {
    const r = await call("OPERATOR", "POST", `/messages?sessionId=${created.sessions[0]}`, { type: "text", chatId: "5511999999999@c.us", text: "hi" });
    expect(r.status).toBe(409); expect(r.error?.code).toBe("SESSION_NOT_READY");
  });
});

describe("templates CRUD + rendering", () => {
  it("creates, renders, updates, duplicates and deletes", async () => {
    const c = await call("OPERATOR", "POST", "/templates", { name: `it-${run}`, body: "Hello {{first_name}}, order {{order_id}}" }); expect(c.status).toBe(200);
    const t = c.data as unknown as { id: string; variables: string[] }; created.templates.push(t.id); expect(t.variables).toEqual(["first_name", "order_id"]);
    const bad = await call("OPERATOR", "POST", "/templates", { name: "bad", body: "{{a}" }); expect(bad.status).toBe(422);
    const r = await call("VIEWER", "POST", "/templates/render", { body: "Hi {{first_name}} {{order_id}}", variables: { order_id: "X1" } }); expect((r.data as unknown as { missing: string[] }).missing).toEqual(["first_name"]);
    const u = await call("OPERATOR", "PATCH", `/templates/${t.id}`, { footer: "Thanks {{company}}" }); expect((u.data as unknown as { variables: string[] }).variables).toContain("company");
    const d = await call("OPERATOR", "POST", `/templates/${t.id}/duplicate`); created.templates.push((d.data as unknown as { id: string }).id); expect((d.data as unknown as { name: string }).name).toContain("(copy)");
    const del = await call("OPERATOR", "DELETE", `/templates/${t.id}`); expect(del.status).toBe(200);
  });
});

describe("contacts, labels and campaign audience", () => {
  it("imports CSV rows with validation and resolves the campaign audience", async () => {
    const sid = created.sessions[0];
    const l = await call("OPERATOR", "POST", "/labels", { name: `it-label-${run}`, color: "#ef4444" }); created.labels.push((l.data as unknown as { id: string }).id);
    const preview = await call("OPERATOR", "POST", `/contacts/import?sessionId=${sid}`, { mode: "preview", rows: [{ name: "A", phone: "+55 11 99999-0001" }, { name: "B", phone: "5511999990001" }, { name: "C", phone: "12" }] });
    const p = preview.data as unknown as { valid: number; invalid: number; duplicate: number }; expect(p.valid).toBe(1); expect(p.duplicate).toBe(1); expect(p.invalid).toBe(1);
    const imp = await call("OPERATOR", "POST", `/contacts/import?sessionId=${sid}`, { mode: "import", rows: [{ name: "A", phone: "+55 11 99999-0001", tags: `it-label-${run}` }, { name: "B", phone: "5511999990002" }] });
    expect((imp.data as unknown as { imported: number }).imported).toBe(2);
    const list = await call("VIEWER", "GET", `/contacts?sessionId=${sid}`); const items = (list.data as unknown as { items: { id: string; waId: string; labels: { id: string }[] }[] }).items; expect(items.length).toBe(2);
    const a = items.find((c) => c.waId === "5511999990001@c.us")!; expect(a.labels.length).toBe(1);
    await call("OPERATOR", "PATCH", `/contacts/${items.find((c) => c.waId === "5511999990002@c.us")!.id}`, { optedOut: true });
    const aud = await resolveAudience(sid, { all: true }); expect(aud.total).toBe(2); expect(aud.optedOut).toBe(1);
    const byLabel = await resolveAudience(sid, { labelIds: created.labels }); expect(byLabel.total).toBe(1);
    const excl = await resolveAudience(sid, { all: true, excludeLabelIds: created.labels }); expect(excl.total).toBe(1);
  });
  it("creates a DRAFT campaign and refuses to start without a ready session", async () => {
    const c = await call("OPERATOR", "POST", "/campaigns", { name: `it-camp-${run}`, sessionId: created.sessions[0], messageType: "text", body: "Hi {{first_name}}", audience: { all: true } }); expect(c.status).toBe(200);
    const id = (c.data as unknown as { id: string }).id; created.campaigns.push(id);
    const s = await call("OPERATOR", "POST", `/campaigns/${id}/start`); expect(s.status).toBe(409); expect(s.error?.code).toBe("SESSION_NOT_READY");
    const pv = await call("VIEWER", "POST", "/campaigns/audience/preview", { sessionId: created.sessions[0], audience: { all: true } }); expect((pv.data as unknown as { total: number }).total).toBe(2);
    const bad = await call("OPERATOR", "POST", `/campaigns/${id}/resume`); expect(bad.error?.code).toBe("INVALID_TRANSITION");
  });
});

describe("message persistence", () => {
  it("is idempotent on (sessionId, waMessageId) and moves status forward only", async () => {
    const sid = created.sessions[0]; const n = { id: `true_5511999990001@c.us_IT${run}`, sessionId: sid, chatId: "5511999990001@c.us", senderId: "me", recipientId: "5511999990001@c.us", timestamp: Math.floor(Date.now() / 1000), type: "chat", body: "x", caption: null, fromMe: true, status: "SENT" as const, ack: 1, quotedMessageId: null, mentionedIds: [], isForwarded: false, isStarred: false, edited: false, revoked: false, hasMedia: false, mediaMimeType: null, mediaFilename: null, mediaSize: null, location: null, vcard: null, senderName: null, metadata: {} };
    const a = await messageRepo.upsertIncoming(n); const b = await messageRepo.upsertIncoming(n); expect(a.inserted).toBe(true); expect(b.inserted).toBe(false);
    expect((await messageRepo.updateStatus(sid, n.id, "READ", 3))?.status).toBe("READ"); expect(await messageRepo.updateStatus(sid, n.id, "DELIVERED", 2)).toBeNull();
    const rows = await messageRepo.listByChat(sid, n.chatId, { limit: 10 }); expect(rows.length).toBe(1); expect(rows[0].status).toBe("READ");
    const { messages } = await import("@/db/schema"); await db.delete(messages).where(eq(messages.sessionId, sid));
  });
});

describe("webhooks CRUD", () => {
  it("validates URLs (SSRF) and stores hooks", async () => {
    const bad = await call("ADMIN", "POST", "/webhooks", { name: "x", url: "http://127.0.0.1:9/hook" }); expect(bad.status).toBe(422); expect(bad.error?.code).toBe("SSRF_BLOCKED");
    const ok = await call("ADMIN", "POST", "/webhooks", { name: `it-${run}`, url: "https://example.com/hook", events: ["message.received"], secret: "s" }); expect(ok.status).toBe(200);
    const id = (ok.data as unknown as { id: string }).id; created.webhooks.push(id);
    const list = await call("VIEWER", "GET", "/webhooks"); expect((list.data as unknown as { id: string; secret: string }[]).find((w) => w.id === id)?.secret).toBe("••••••");
    const upd = await call("ADMIN", "PATCH", `/webhooks/${id}`, { enabled: false }); expect((upd.data as unknown as { enabled: boolean }).enabled).toBe(false);
    const forbidden = await call("OPERATOR", "DELETE", `/webhooks/${id}`); expect(forbidden.status).toBe(403);
  });
});

describe("developer platform", () => {
  it("serves the capability registry, audit and OpenAPI", async () => {
    const c = await call("VIEWER", "GET", "/developer/capabilities"); const d = c.data as unknown as { audit: { version: string; unmapped: number }; capabilities: { method: string }[] }; expect(d.audit.version).toBe("2.3.3"); expect(d.audit.unmapped).toBe(0); expect(d.capabilities.some((x) => x.method === "getMessages")).toBe(true);
    const o = await call("VIEWER", "GET", "/openapi.json"); expect((o.data as unknown as { openapi: string }).openapi).toBe("3.0.3");
    const inv = await call("OPERATOR", "POST", "/developer/capabilities/invoke", { sessionId: created.sessions[0], method: "evaluate", args: [] }); expect(inv.status).toBe(403);
  });
});
