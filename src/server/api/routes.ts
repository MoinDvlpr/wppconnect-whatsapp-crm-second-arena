import { z } from "zod";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, auditLogs, automationRules, campaignRecipients, campaigns, capabilityTests, chats, contactCustomFields, contactLabels, contacts, customFieldDefinitions, eventLog, groupMembers, groups, labels, messages, systemLogs, templates, users, waSessions, webhookDeliveries, webhooks, campaignJobs } from "@/db/schema";
import { ApiError, newId, notFound, pageParams } from "@/lib/api";
import { assertSessionAccess, audit, generateApiKey, hashPassword, verifyPassword } from "@/lib/auth";
import { normalizePhoneNumber, normalizeWhatsAppId } from "@/lib/ids";
import { extractVariables, renderTemplate, validateTemplateBody, contactToVariables } from "@/lib/template";
import { MAX_UPLOAD_BYTES, storage } from "@/lib/storage";
import { sessionManager } from "../wpp/session-manager";
import { CAPABILITIES, LISTENERS, getCapability, runCapabilityAudit } from "../wpp/capability-registry";
import { CatalogService, ChannelService, ChatService, ContactService, GroupService, MediaService, MessageService, NativeLabelService, PresenceService, ProfileService, SessionService, StatusService, invokeCapability } from "../services/whatsapp.service";
import { syncGroup, syncSession } from "../services/sync.service";
import { campaignService, resolveAudience } from "../services/campaign.service";
import { WEBHOOK_EVENTS, assertSafeUrl, webhookService } from "../services/webhook.service";
import { getAllSettings, setSettings } from "../services/settings.service";
import { route, type Ctx } from "./router";
import { openApiDocument } from "./openapi";

const S = (ctx: Ctx, id: string) => { assertSessionAccess(ctx.principal, id); return id; };
const sessionFromCtx = (ctx: Ctx) => { const id = ctx.url.searchParams.get("sessionId") || ctx.params.sessionId; if (!id) throw new ApiError("VALIDATION_ERROR", "sessionId is required", 422); return S(ctx, id); };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "session";

// ================= Health / stats =================
route("GET", "/health", "VIEWER", async () => {
  let dbOk = false; try { await db.execute(sql`select 1`); dbOk = true; } catch { dbOk = false; }
  const sessions = await db.select().from(waSessions);
  const queue = await db.select({ status: campaignJobs.status, n: sql<number>`count(*)::int` }).from(campaignJobs).groupBy(campaignJobs.status);
  const pendingWebhooks = await db.select({ n: sql<number>`count(*)::int` }).from(webhookDeliveries).where(eq(webhookDeliveries.status, "PENDING"));
  let storageOk = false; try { const f = await storage.put(Buffer.from("ok"), { mimeType: "text/plain", filename: "health.txt", folder: "health" }); await storage.delete(f.key); storageOk = true; } catch { storageOk = false; }
  let wppOk = true; let wppVersion = "unknown"; try { wppVersion = runCapabilityAudit().version; } catch { wppOk = false; }
  return { ok: dbOk, checks: { database: dbOk, wppconnect: wppOk, storage: storageOk, websocket: true, queue: true }, wppVersion, node: process.version, uptime: process.uptime(), sessions: sessions.map((s) => ({ id: s.id, name: s.name, status: sessionManager.getStatus(s.id), dbStatus: s.status, lastHeartbeatAt: s.lastHeartbeatAt, lastError: s.lastError, reconnectCount: s.reconnectCount })), runtime: sessionManager.list(), queue: Object.fromEntries(queue.map((q) => [q.status, q.n])), pendingWebhooks: pendingWebhooks[0]?.n ?? 0, memory: process.memoryUsage().rss };
}, { summary: "Health and diagnostics", tag: "System" });

route("GET", "/stats", "VIEWER", async (ctx) => {
  const sessionId = ctx.url.searchParams.get("sessionId");
  const sf = (col: AnyPgColumn) => sessionId ? eq(col, sessionId) : sql`true`;
  const dayStart = Math.floor(new Date(new Date().toDateString()).getTime() / 1000);
  const [[totals], [today], [sent], [received], [contactsN], [chatsN], [unread], camps, [failed], series, statusDist] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(waSessions),
    db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(sf(messages.sessionId), gte(messages.timestamp, dayStart))),
    db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(sf(messages.sessionId), eq(messages.fromMe, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(sf(messages.sessionId), eq(messages.fromMe, false))),
    db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(sf(contacts.sessionId)),
    db.select({ n: sql<number>`count(*)::int` }).from(chats).where(sf(chats.sessionId)),
    db.select({ n: sql<number>`count(*)::int` }).from(chats).where(and(sf(chats.sessionId), sql`${chats.unreadCount} > 0`)),
    db.select({ status: campaigns.status, n: sql<number>`count(*)::int`, sent: sql<number>`coalesce(sum(${campaigns.sentCount}),0)::int`, failed: sql<number>`coalesce(sum(${campaigns.failedCount}),0)::int`, total: sql<number>`coalesce(sum(${campaigns.totalRecipients}),0)::int` }).from(campaigns).where(sf(campaigns.sessionId)).groupBy(campaigns.status),
    db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(sf(messages.sessionId), eq(messages.status, "FAILED"))),
    db.select({ day: sql<string>`to_char(to_timestamp(${messages.timestamp}), 'YYYY-MM-DD')`, sent: sql<number>`sum(case when ${messages.fromMe} then 1 else 0 end)::int`, received: sql<number>`sum(case when ${messages.fromMe} then 0 else 1 end)::int` }).from(messages).where(and(sf(messages.sessionId), gte(messages.timestamp, dayStart - 13 * 86400))).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ status: messages.status, n: sql<number>`count(*)::int` }).from(messages).where(and(sf(messages.sessionId), eq(messages.fromMe, true))).groupBy(messages.status),
  ]);
  const connected = sessionManager.list().filter((s) => s.status === "READY").length;
  const campSent = camps.reduce((a, c) => a + c.sent, 0); const campTotal = camps.reduce((a, c) => a + c.total, 0);
  return { totalSessions: totals.n, connectedSessions: connected, totalContacts: contactsN.n, totalChats: chatsN.n, unreadChats: unread.n, messagesToday: today.n, messagesSent: sent.n, messagesReceived: received.n, campaignsRunning: camps.filter((c) => ["RUNNING", "QUEUED"].includes(c.status)).reduce((a, c) => a + c.n, 0), campaignSuccessRate: campTotal ? Math.round((campSent / campTotal) * 100) : null, failedMessages: failed.n, campaigns: camps, series, statusDistribution: statusDist };
}, { summary: "Dashboard statistics", tag: "System" });

// ================= Sessions =================
const sessionOut = (s: typeof waSessions.$inferSelect) => ({ ...s, qrCode: undefined, runtimeStatus: sessionManager.getStatus(s.id), status: sessionManager.getStatus(s.id) === "STOPPED" && s.status !== "STOPPED" && !sessionManager.getRuntime(s.id).client ? "STOPPED" : sessionManager.getStatus(s.id), lastError: sessionManager.getRuntime(s.id).lastError ?? s.lastError, loading: sessionManager.getRuntime(s.id).loading });
route("GET", "/sessions", "VIEWER", async (ctx) => {
  const rows = await db.select().from(waSessions).orderBy(asc(waSessions.createdAt));
  return rows.filter((s) => !ctx.principal.allowedSessions.length || ctx.principal.allowedSessions.includes(s.id)).map(sessionOut);
}, { summary: "List WhatsApp sessions", tag: "Sessions" });
route("POST", "/sessions", "ADMIN", async (ctx) => {
  const b = await ctx.body(z.object({ name: z.string().min(1).max(60), autoStart: z.boolean().optional(), start: z.boolean().optional() }));
  const id = newId(); let slug = slugify(b.name);
  const existing = await db.select({ id: waSessions.id }).from(waSessions).where(eq(waSessions.slug, slug)); if (existing.length) slug = `${slug}-${id.slice(0, 6)}`;
  const [row] = await db.insert(waSessions).values({ id, name: b.name, slug, autoStart: b.autoStart ?? true }).returning();
  await audit(ctx.principal, "session.created", { resource: "session", resourceId: id, sessionId: id, ip: ctx.ip });
  if (b.start !== false) sessionManager.start(id).catch(() => { });
  return sessionOut(row);
}, { summary: "Create a session", tag: "Sessions", body: { name: "Sales", autoStart: true } });
route("GET", "/sessions/:id", "VIEWER", async (ctx) => { const [s] = await db.select().from(waSessions).where(eq(waSessions.id, S(ctx, ctx.params.id))); if (!s) throw notFound("Session"); return sessionOut(s); }, { summary: "Get session", tag: "Sessions" });
route("PATCH", "/sessions/:id", "ADMIN", async (ctx) => {
  const b = await ctx.body(z.object({ name: z.string().min(1).max(60).optional(), autoStart: z.boolean().optional(), settings: z.record(z.string(), z.unknown()).optional() }));
  const [s] = await db.update(waSessions).set({ ...b, updatedAt: new Date() }).where(eq(waSessions.id, S(ctx, ctx.params.id))).returning(); if (!s) throw notFound("Session");
  return sessionOut(s);
}, { summary: "Update session", tag: "Sessions" });
route("DELETE", "/sessions/:id", "ADMIN", async (ctx) => {
  const id = S(ctx, ctx.params.id); await sessionManager.destroy(id);
  for (const t of [messages, chats, contacts, groups, groupMembers]) await db.delete(t).where(eq(t.sessionId, id));
  await db.delete(waSessions).where(eq(waSessions.id, id));
  await audit(ctx.principal, "session.deleted", { resource: "session", resourceId: id, sessionId: id, ip: ctx.ip });
  return { deleted: true };
}, { summary: "Delete session and its cached data", tag: "Sessions" });
route("GET", "/sessions/:id/status", "VIEWER", async (ctx) => { const id = S(ctx, ctx.params.id); const rt = sessionManager.getRuntime(id); return { status: rt.status, lastError: rt.lastError, qrAttempt: rt.qrAttempt, loading: rt.loading }; }, { summary: "Session status", tag: "Sessions" });
route("GET", "/sessions/:id/qr", "VIEWER", async (ctx) => { const id = S(ctx, ctx.params.id); const rt = sessionManager.getRuntime(id); const [row] = await db.select({ qr: waSessions.qrCode, at: waSessions.qrUpdatedAt }).from(waSessions).where(eq(waSessions.id, id)); return { status: rt.status, qr: rt.qr ?? row?.qr ?? null, attempt: rt.qrAttempt, updatedAt: rt.qrUpdatedAt ?? row?.at ?? null, expired: rt.qrUpdatedAt ? Date.now() - rt.qrUpdatedAt > 60_000 : false }; }, { summary: "Current QR code (base64 data URL)", tag: "Sessions" });
route("POST", "/sessions/:id/qr/refresh", "OPERATOR", async (ctx) => ({ qr: await sessionManager.refreshQr(S(ctx, ctx.params.id)) }), { summary: "Refresh QR", tag: "Sessions" });
for (const action of ["start", "stop", "restart", "logout"] as const) {
  route("POST", `/sessions/:id/${action}`, "OPERATOR", async (ctx) => {
    const id = S(ctx, ctx.params.id);
    if (action === "start") sessionManager.start(id).catch(() => { }); else await sessionManager[action](id);
    await audit(ctx.principal, `session.${action}`, { resource: "session", resourceId: id, sessionId: id, ip: ctx.ip });
    return { status: sessionManager.getStatus(id) };
  }, { summary: `${action} session`, tag: "Sessions" });
}
route("POST", "/sessions/:id/sync", "OPERATOR", async (ctx) => syncSession(S(ctx, ctx.params.id)), { summary: "Force resync contacts/chats/groups", tag: "Sessions" });
route("GET", "/sessions/:id/diagnostics", "VIEWER", async (ctx) => SessionService.diagnostics(S(ctx, ctx.params.id)), { summary: "Session diagnostics", tag: "Sessions" });
route("GET", "/sessions/:id/screenshot", "ADMIN", async (ctx) => ({ image: await SessionService.screenshot(S(ctx, ctx.params.id)) }), { summary: "Browser screenshot (debug)", tag: "Sessions" });
route("POST", "/sessions/:id/use-here", "OPERATOR", async (ctx) => ({ ok: await SessionService.useHere(S(ctx, ctx.params.id)) }), { summary: "Take over WhatsApp Web session", tag: "Sessions" });
route("POST", "/sessions/:id/presence", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ online: z.boolean() })); return { ok: await SessionService.setOnlinePresence(S(ctx, ctx.params.id), b.online) }; }, { summary: "Set online presence", tag: "Sessions" });
route("GET", "/sessions/:id/logs", "VIEWER", async (ctx) => { const { limit, offset } = pageParams(ctx.url); return db.select().from(systemLogs).where(eq(systemLogs.sessionId, S(ctx, ctx.params.id))).orderBy(desc(systemLogs.id)).limit(limit).offset(offset); }, { summary: "Session logs", tag: "Sessions" });

// ================= Chats =================
route("GET", "/chats", "VIEWER", async (ctx) => {
  const sessionId = sessionFromCtx(ctx); const { limit, offset } = pageParams(ctx.url);
  const filter = ctx.url.searchParams.get("filter") ?? "all"; const q = ctx.url.searchParams.get("q"); const labelId = ctx.url.searchParams.get("labelId");
  const conds = [eq(chats.sessionId, sessionId)];
  if (filter === "unread") conds.push(sql`${chats.unreadCount} > 0`);
  if (filter === "groups") conds.push(eq(chats.kind, "group"));
  if (filter === "contacts") conds.push(eq(chats.kind, "user"));
  if (filter === "archived") conds.push(eq(chats.isArchived, true)); else if (filter !== "all" || !ctx.url.searchParams.get("includeArchived")) conds.push(eq(chats.isArchived, false));
  if (filter === "pinned") conds.push(eq(chats.isPinned, true));
  if (q) conds.push(or(ilike(chats.name, `%${q}%`), ilike(chats.waId, `%${q.replace(/\D/g, "") || q}%`))!);
  if (labelId) { const ids = await db.select({ waId: contacts.waId }).from(contactLabels).innerJoin(contacts, eq(contacts.id, contactLabels.contactId)).where(and(eq(contactLabels.labelId, labelId), eq(contacts.sessionId, sessionId))); conds.push(ids.length ? inArray(chats.waId, ids.map((i) => i.waId)) : sql`false`); }
  const rows = await db.select().from(chats).where(and(...conds)).orderBy(desc(chats.isPinned), desc(sql`coalesce(${chats.lastMessageAt}, ${chats.createdAt})`)).limit(limit).offset(offset);
  const waIds = rows.map((r) => r.waId);
  const cts = waIds.length ? await db.select({ id: contacts.id, waId: contacts.waId, name: contacts.name, pushName: contacts.pushName, avatarUrl: contacts.avatarUrl, phone: contacts.phone }).from(contacts).where(and(eq(contacts.sessionId, sessionId), inArray(contacts.waId, waIds))) : [];
  const cmap = new Map(cts.map((c) => [c.waId, c]));
  const labelRows = cts.length ? await db.select({ contactId: contactLabels.contactId, id: labels.id, name: labels.name, color: labels.color }).from(contactLabels).innerJoin(labels, eq(labels.id, contactLabels.labelId)).where(inArray(contactLabels.contactId, cts.map((c) => c.id))) : [];
  const lmap = new Map<string, { id: string; name: string; color: string }[]>(); for (const l of labelRows) { const a = lmap.get(l.contactId) ?? []; a.push({ id: l.id, name: l.name, color: l.color }); lmap.set(l.contactId, a); }
  return rows.map((r) => { const c = cmap.get(r.waId); return { ...r, rawPayload: undefined, displayName: r.name || c?.name || c?.pushName || (normalizeWhatsAppId(r.waId)?.phone ? `+${normalizeWhatsAppId(r.waId)!.phone}` : r.waId), avatarUrl: r.avatarUrl || c?.avatarUrl || null, phone: c?.phone ?? normalizeWhatsAppId(r.waId)?.phone ?? null, contactId: c?.id ?? null, labels: c ? lmap.get(c.id) ?? [] : [] }; });
}, { summary: "List chats (cached, paginated)", tag: "Chats", query: { sessionId: "required", filter: "all|unread|groups|contacts|archived|pinned", q: "search", page: "1", limit: "50" } });
route("POST", "/chats/refresh", "OPERATOR", async (ctx) => syncSession(sessionFromCtx(ctx), { messagesPerChat: 10 }), { summary: "Refresh chats from WhatsApp", tag: "Chats" });
route("GET", "/chats/:id", "VIEWER", async (ctx) => {
  const sessionId = sessionFromCtx(ctx); const waId = ctx.params.id;
  const [chat] = await db.select().from(chats).where(and(eq(chats.sessionId, sessionId), eq(chats.waId, waId)));
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, waId)));
  const [group] = waId.endsWith("@g.us") ? await db.select().from(groups).where(and(eq(groups.sessionId, sessionId), eq(groups.waId, waId))) : [];
  let live: unknown = null; if (ctx.url.searchParams.get("live") === "1" && sessionManager.isReady(sessionId)) { try { live = await ChatService.getById(sessionId, waId); } catch { live = null; } }
  return { chat: chat ? { ...chat, rawPayload: undefined } : null, contact: contact ? { ...contact, rawPayload: undefined } : null, group: group ? { ...group, rawPayload: undefined } : null, live };
}, { summary: "Chat details", tag: "Chats" });
route("GET", "/chats/:id/messages", "VIEWER", async (ctx) => {
  const sessionId = sessionFromCtx(ctx); const q = ctx.url.searchParams;
  const rows = await MessageService.list(sessionId, ctx.params.id, { limit: Number(q.get("limit") || 40), before: q.get("before") ? Number(q.get("before")) : undefined, after: q.get("after") ? Number(q.get("after")) : undefined, beforeId: q.get("beforeId") ?? undefined, refresh: q.get("refresh") === "1" });
  return { messages: rows, hasMore: rows.length >= Number(q.get("limit") || 40) };
}, { summary: "Chat messages (paginated: before/after timestamp, beforeId for WhatsApp cursor)", tag: "Messages", query: { sessionId: "required", limit: "40", before: "unix ts", after: "unix ts", beforeId: "wa message id", refresh: "1" } });
route("GET", "/chats/:id/presence", "VIEWER", async (ctx) => PresenceService.get(sessionFromCtx(ctx), ctx.params.id), { summary: "Online / last seen", tag: "Chats" });
route("POST", "/chats/:id/presence/subscribe", "OPERATOR", async (ctx) => ({ ok: await PresenceService.subscribe(sessionFromCtx(ctx), ctx.params.id) }), { summary: "Subscribe presence updates", tag: "Chats" });
route("POST", "/chats/:id/seen", "OPERATOR", async (ctx) => ChatService.sendSeen(sessionFromCtx(ctx), ctx.params.id), { summary: "Mark chat as seen", tag: "Chats" });
route("POST", "/chats/:id/unseen", "OPERATOR", async (ctx) => ChatService.markUnseen(sessionFromCtx(ctx), ctx.params.id), { summary: "Mark chat unread", tag: "Chats" });
route("POST", "/chats/:id/typing", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ state: z.enum(["typing", "recording", "stop"]), duration: z.number().optional() })); const s = sessionFromCtx(ctx); if (b.state === "typing") await PresenceService.startTyping(s, ctx.params.id, b.duration); else if (b.state === "recording") await PresenceService.startRecording(s, ctx.params.id, b.duration); else { await PresenceService.stopTyping(s, ctx.params.id).catch(() => { }); await PresenceService.stopRecording(s, ctx.params.id).catch(() => { }); } return { ok: true }; }, { summary: "Typing / recording state", tag: "Chats", body: { state: "typing" } });
route("POST", "/chats/:id/archive", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ value: z.boolean().default(true) })); return ChatService.archive(sessionFromCtx(ctx), ctx.params.id, b.value); }, { summary: "Archive/unarchive", tag: "Chats" });
route("POST", "/chats/:id/pin", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ value: z.boolean().default(true) })); return ChatService.pin(sessionFromCtx(ctx), ctx.params.id, b.value); }, { summary: "Pin/unpin", tag: "Chats" });
route("POST", "/chats/:id/mute", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ time: z.number().default(8), type: z.enum(["hours", "days", "week", "year"]).default("hours") })); return ChatService.mute(sessionFromCtx(ctx), ctx.params.id, b.time, b.type); }, { summary: "Mute chat", tag: "Chats" });
route("POST", "/chats/:id/clear", "ADMIN", async (ctx) => ({ ok: await ChatService.clear(sessionFromCtx(ctx), ctx.params.id) }), { summary: "Clear chat", tag: "Chats" });
route("DELETE", "/chats/:id", "ADMIN", async (ctx) => ({ ok: await ChatService.delete(sessionFromCtx(ctx), ctx.params.id) }), { summary: "Delete chat", tag: "Chats" });
route("PATCH", "/chats/:id/assign", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ userId: z.string().nullable() })); const s = sessionFromCtx(ctx); await db.update(chats).set({ assignedUserId: b.userId }).where(and(eq(chats.sessionId, s), eq(chats.waId, ctx.params.id))); return { ok: true }; }, { summary: "Assign chat to user", tag: "Chats" });

// ================= Messages =================
const sendSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), chatId: z.string(), text: z.string().min(1).max(65536), quotedMessageId: z.string().optional(), mentionedList: z.array(z.string()).optional(), linkPreview: z.boolean().optional() }),
  z.object({ type: z.literal("media"), chatId: z.string(), base64: z.string().optional(), storageKey: z.string().optional(), mimeType: z.string(), filename: z.string(), caption: z.string().optional(), quotedMessageId: z.string().optional(), kind: z.enum(["image", "video", "audio", "document", "sticker", "ptt", "gif"]).optional() }),
  z.object({ type: z.literal("location"), chatId: z.string(), lat: z.number(), lng: z.number(), name: z.string().optional(), address: z.string().optional() }),
  z.object({ type: z.literal("contact"), chatId: z.string(), contactId: z.string(), name: z.string().optional() }),
  z.object({ type: z.literal("poll"), chatId: z.string(), name: z.string(), choices: z.array(z.string()).min(2).max(12), selectableCount: z.number().optional() }),
  z.object({ type: z.literal("list"), chatId: z.string(), buttonText: z.string(), description: z.string(), sections: z.array(z.object({ title: z.string(), rows: z.array(z.object({ rowId: z.string(), title: z.string(), description: z.string().optional() })) })) }),
  z.object({ type: z.literal("template"), chatId: z.string(), templateId: z.string(), variables: z.record(z.string(), z.string()).optional() }),
]);
route("POST", "/messages", "OPERATOR", async (ctx) => {
  const sessionId = sessionFromCtx(ctx); const b = await ctx.body(sendSchema);
  let result: unknown;
  switch (b.type) {
    case "text": result = await MessageService.sendText(sessionId, b); break;
    case "media": { let base64 = b.base64; if (!base64 && b.storageKey) base64 = (await storage.get(b.storageKey)).toString("base64"); if (!base64) throw new ApiError("VALIDATION_ERROR", "base64 or storageKey is required", 422); MediaService.validateUpload(b.mimeType, Buffer.byteLength(base64, "base64"), MAX_UPLOAD_BYTES); result = await MessageService.sendMedia(sessionId, { ...b, base64 }); break; }
    case "location": result = await MessageService.sendLocation(sessionId, b); break;
    case "contact": result = await MessageService.sendContact(sessionId, b); break;
    case "poll": result = await MessageService.sendPoll(sessionId, b); break;
    case "list": result = await MessageService.sendList(sessionId, b); break;
    case "template": {
      const [t] = await db.select().from(templates).where(eq(templates.id, b.templateId)); if (!t) throw notFound("Template");
      const [c] = await db.select().from(contacts).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, normalizeWhatsAppId(b.chatId)?.id ?? b.chatId)));
      const custom = c ? await db.select().from(contactCustomFields).where(eq(contactCustomFields.contactId, c.id)) : [];
      const body = [t.header, t.body, t.footer].filter(Boolean).join("\n\n");
      const r = renderTemplate(body, { contact: c ? { ...contactToVariables(c), ...Object.fromEntries(custom.map((f) => [f.key, f.value])) } : {}, campaign: b.variables });
      if (r.missing.length) throw new ApiError("TEMPLATE_MISSING_VARIABLES", `Missing variables: ${r.missing.join(", ")}`, 422, { missing: r.missing });
      if (t.mediaPath) { const buf = await storage.get(t.mediaPath); result = await MessageService.sendMedia(sessionId, { chatId: b.chatId, base64: buf.toString("base64"), mimeType: t.mediaMimeType ?? "application/octet-stream", filename: t.mediaFilename ?? "file", caption: r.text }); }
      else result = await MessageService.sendText(sessionId, { chatId: b.chatId, text: r.text });
      await db.update(templates).set({ timesUsed: sql`${templates.timesUsed} + 1`, lastUsedAt: new Date() }).where(eq(templates.id, t.id));
      break;
    }
  }
  await audit(ctx.principal, "message.sent", { resource: "chat", resourceId: b.chatId, sessionId, ip: ctx.ip, metadata: { type: b.type } });
  return result;
}, { summary: "Send a message (text/media/location/contact/poll/list/template)", tag: "Messages", body: { type: "text", chatId: "5511999999999@c.us", text: "Hello" }, query: { sessionId: "required" } });
route("GET", "/messages/search", "VIEWER", async (ctx) => {
  const sessionId = sessionFromCtx(ctx); const q = ctx.url.searchParams.get("q") ?? ""; const chatId = ctx.url.searchParams.get("chatId"); const type = ctx.url.searchParams.get("type"); const { limit, offset } = pageParams(ctx.url);
  const conds = [eq(messages.sessionId, sessionId), or(ilike(messages.body, `%${q}%`), ilike(messages.caption, `%${q}%`), ilike(messages.mediaFilename, `%${q}%`))!];
  if (chatId) conds.push(eq(messages.chatId, chatId)); if (type) conds.push(eq(messages.type, type));
  if (ctx.url.searchParams.get("from")) conds.push(gte(messages.timestamp, Number(ctx.url.searchParams.get("from"))));
  return db.select().from(messages).where(and(...conds)).orderBy(desc(messages.timestamp)).limit(limit).offset(offset);
}, { summary: "Search messages", tag: "Messages", query: { sessionId: "required", q: "text", chatId: "optional", type: "optional" } });
route("GET", "/messages/:id", "VIEWER", async (ctx) => MessageService.getById(sessionFromCtx(ctx), ctx.params.id), { summary: "Get live message by id", tag: "Messages" });
route("GET", "/messages/:id/media", "VIEWER", async (ctx) => {
  const { buffer, mimeType, filename } = await MediaService.download(sessionFromCtx(ctx), ctx.params.id);
  return new Response(new Uint8Array(buffer), { headers: { "content-type": mimeType, "content-length": String(buffer.length), "content-disposition": `${ctx.url.searchParams.get("download") ? "attachment" : "inline"}; filename="${encodeURIComponent(filename)}"`, "cache-control": "private, max-age=3600" } });
}, { summary: "Download message media", tag: "Messages" });
route("POST", "/messages/:id/react", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ emoji: z.string().max(8).or(z.literal(false)) })); return MessageService.react(sessionFromCtx(ctx), ctx.params.id, b.emoji); }, { summary: "React to message (emoji or false to remove)", tag: "Messages", body: { emoji: "👍" } });
route("PATCH", "/messages/:id", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ text: z.string().min(1) })); return MessageService.edit(sessionFromCtx(ctx), ctx.params.id, b.text); }, { summary: "Edit message", tag: "Messages" });
route("DELETE", "/messages/:id", "OPERATOR", async (ctx) => ({ ok: await MessageService.delete(sessionFromCtx(ctx), ctx.params.id, ctx.url.searchParams.get("onlyLocal") === "1") }), { summary: "Delete message (?onlyLocal=1 for delete-for-me)", tag: "Messages" });
route("POST", "/messages/:id/star", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ star: z.boolean().default(true) })); return MessageService.star(sessionFromCtx(ctx), ctx.params.id, b.star); }, { summary: "Star message", tag: "Messages" });
route("POST", "/messages/:id/forward", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ to: z.array(z.string()).min(1).max(20) })); return MessageService.forward(sessionFromCtx(ctx), ctx.params.id, b.to); }, { summary: "Forward message", tag: "Messages" });
route("GET", "/messages/:id/reactions", "VIEWER", async (ctx) => MessageService.getReactions(sessionFromCtx(ctx), ctx.params.id), { summary: "Reactions of message", tag: "Messages" });
route("GET", "/messages/:id/votes", "VIEWER", async (ctx) => MessageService.getVotes(sessionFromCtx(ctx), ctx.params.id), { summary: "Poll votes", tag: "Messages" });
route("POST", "/messages/:id/played", "OPERATOR", async (ctx) => MessageService.markPlayed(sessionFromCtx(ctx), ctx.params.id), { summary: "Mark audio played", tag: "Messages" });

// ================= Contacts (CRM + WhatsApp) =================
const contactSchema = z.object({ phone: z.string().optional(), waId: z.string().optional(), name: z.string().optional(), firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().email().or(z.literal("")).optional(), company: z.string().optional(), notes: z.string().optional(), optedIn: z.boolean().optional(), optedOut: z.boolean().optional(), ownerUserId: z.string().nullable().optional(), labelIds: z.array(z.string()).optional(), customFields: z.record(z.string(), z.string()).optional() });
async function withLabels<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return rows.map((r) => ({ ...r, labels: [] as { id: string; name: string; color: string }[], customFields: {} as Record<string, string | null> }));
  const ids = rows.map((r) => r.id);
  const [lr, cf] = await Promise.all([
    db.select({ contactId: contactLabels.contactId, id: labels.id, name: labels.name, color: labels.color }).from(contactLabels).innerJoin(labels, eq(labels.id, contactLabels.labelId)).where(inArray(contactLabels.contactId, ids)),
    db.select().from(contactCustomFields).where(inArray(contactCustomFields.contactId, ids)),
  ]);
  return rows.map((r) => ({ ...r, labels: lr.filter((l) => l.contactId === r.id).map((l) => ({ id: l.id, name: l.name, color: l.color })), customFields: Object.fromEntries(cf.filter((f) => f.contactId === r.id).map((f) => [f.key, f.value])) }));
}
route("GET", "/contacts", "VIEWER", async (ctx) => {
  const sessionId = ctx.url.searchParams.get("sessionId"); const { limit, offset, page } = pageParams(ctx.url); const q = ctx.url.searchParams.get("q"); const labelId = ctx.url.searchParams.get("labelId"); const type = ctx.url.searchParams.get("type");
  const conds = [sessionId ? eq(contacts.sessionId, S(ctx, sessionId)) : sql`true`];
  if (q) conds.push(or(ilike(contacts.name, `%${q}%`), ilike(contacts.pushName, `%${q}%`), ilike(contacts.phone, `%${q.replace(/\D/g, "") || q}%`), ilike(contacts.email, `%${q}%`), ilike(contacts.company, `%${q}%`))!);
  if (labelId) { const ids = await db.select({ contactId: contactLabels.contactId }).from(contactLabels).where(eq(contactLabels.labelId, labelId)); conds.push(ids.length ? inArray(contacts.id, ids.map((i) => i.contactId)) : sql`false`); }
  if (type === "business") conds.push(eq(contacts.isBusiness, true)); if (type === "saved") conds.push(eq(contacts.isMyContact, true)); if (type === "opted_out") conds.push(eq(contacts.optedOut, true)); if (type === "opted_in") conds.push(eq(contacts.optedIn, true));
  const [rows, [{ n }]] = await Promise.all([db.select().from(contacts).where(and(...conds)).orderBy(desc(contacts.lastInteractionAt), asc(contacts.name)).limit(limit).offset(offset), db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(...conds))]);
  return { items: await withLabels(rows.map((r) => ({ ...r, rawPayload: undefined }))), total: n, page, limit };
}, { summary: "List CRM contacts", tag: "Contacts", query: { sessionId: "optional", q: "search", labelId: "filter", type: "business|saved|opted_out|opted_in" } });
route("POST", "/contacts", "OPERATOR", async (ctx) => {
  const sessionId = sessionFromCtx(ctx); const b = await ctx.body(contactSchema);
  const waId = b.waId ? normalizeWhatsAppId(b.waId)?.id : b.phone ? normalizeWhatsAppId(b.phone)?.id : null;
  if (!waId) throw new ApiError("VALIDATION_ERROR", "Valid phone or waId is required", 422);
  const n = normalizeWhatsAppId(waId)!;
  const [row] = await db.insert(contacts).values({ id: newId(), sessionId, waId, phone: n.phone, name: b.name || [b.firstName, b.lastName].filter(Boolean).join(" ") || null, firstName: b.firstName, lastName: b.lastName, email: b.email || null, company: b.company, notes: b.notes, optedIn: b.optedIn ?? false, optedOut: b.optedOut ?? false, ownerUserId: b.ownerUserId ?? null, source: "manual", isMyContact: false })
    .onConflictDoUpdate({ target: [contacts.sessionId, contacts.waId], set: { name: b.name, firstName: b.firstName, lastName: b.lastName, email: b.email || null, company: b.company, notes: b.notes, updatedAt: new Date() } }).returning();
  if (b.labelIds) { await db.delete(contactLabels).where(eq(contactLabels.contactId, row.id)); if (b.labelIds.length) await db.insert(contactLabels).values(b.labelIds.map((l) => ({ id: newId(), contactId: row.id, labelId: l }))).onConflictDoNothing(); }
  if (b.customFields) for (const [k, v] of Object.entries(b.customFields)) await db.insert(contactCustomFields).values({ id: newId(), contactId: row.id, key: k, value: v }).onConflictDoUpdate({ target: [contactCustomFields.contactId, contactCustomFields.key], set: { value: v } });
  return (await withLabels([row]))[0];
}, { summary: "Create/upsert CRM contact", tag: "Contacts", body: { phone: "5511999999999", name: "Jane", email: "jane@acme.com", company: "ACME" } });
route("POST", "/contacts/import", "OPERATOR", async (ctx) => {
  const sessionId = sessionFromCtx(ctx);
  const b = await ctx.body(z.object({ rows: z.array(z.object({ name: z.string().optional(), phone: z.string(), email: z.string().optional(), company: z.string().optional(), tags: z.string().optional() })).max(10000), mode: z.enum(["preview", "import"]).default("preview"), skipDuplicates: z.boolean().default(true), updateExisting: z.boolean().default(false) }));
  const seen = new Set<string>(); const report = { valid: 0, invalid: 0, duplicate: 0, existing: 0, imported: 0, updated: 0, rows: [] as { phone: string; status: string; reason?: string }[] };
  const existing = new Set((await db.select({ waId: contacts.waId }).from(contacts).where(eq(contacts.sessionId, sessionId))).map((c) => c.waId));
  const labelCache = new Map((await db.select().from(labels)).map((l) => [l.name.toLowerCase(), l.id]));
  for (const r of b.rows) {
    const phone = normalizePhoneNumber(r.phone); if (!phone) { report.invalid++; report.rows.push({ phone: r.phone, status: "invalid", reason: "Invalid phone" }); continue; }
    const waId = `${phone}@c.us`;
    if (seen.has(waId)) { report.duplicate++; report.rows.push({ phone: r.phone, status: "duplicate" }); continue; } seen.add(waId);
    const exists = existing.has(waId);
    if (exists && !b.updateExisting) { report.existing++; report.rows.push({ phone: r.phone, status: "exists" }); if (b.skipDuplicates) continue; }
    report.valid++; if (!exists) report.rows.push({ phone: r.phone, status: "valid" });
    if (b.mode === "import") {
      const [row] = await db.insert(contacts).values({ id: newId(), sessionId, waId, phone, name: r.name || null, email: r.email || null, company: r.company || null, source: "csv", isMyContact: false, optedIn: true })
        .onConflictDoUpdate({ target: [contacts.sessionId, contacts.waId], set: b.updateExisting ? { name: r.name || undefined, email: r.email || undefined, company: r.company || undefined, updatedAt: new Date() } : { updatedAt: new Date() } }).returning();
      if (exists) report.updated++; else report.imported++;
      for (const tag of (r.tags ?? "").split(/[;,|]/).map((t) => t.trim()).filter(Boolean)) {
        let lid = labelCache.get(tag.toLowerCase()); if (!lid) { lid = newId(); await db.insert(labels).values({ id: lid, name: tag, color: "#64748b" }).onConflictDoNothing(); labelCache.set(tag.toLowerCase(), lid); }
        await db.insert(contactLabels).values({ id: newId(), contactId: row.id, labelId: lid }).onConflictDoNothing();
      }
    }
  }
  if (b.mode === "import") await audit(ctx.principal, "contacts.imported", { sessionId, ip: ctx.ip, metadata: { imported: report.imported, updated: report.updated } });
  return report;
}, { summary: "CSV import (preview or import)", tag: "Contacts", body: { mode: "preview", rows: [{ name: "Jane", phone: "+55 11 99999-9999", tags: "Lead;VIP" }] } });
route("GET", "/contacts/export", "VIEWER", async (ctx) => {
  const sessionId = sessionFromCtx(ctx);
  const rows = await withLabels(await db.select().from(contacts).where(eq(contacts.sessionId, sessionId)).orderBy(asc(contacts.name)).limit(50000));
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["name,phone,wa_id,email,company,tags,opted_in,opted_out,last_interaction", ...rows.map((r) => [r.name ?? r.pushName, r.phone, r.waId, r.email, r.company, r.labels.map((l) => l.name).join(";"), r.optedIn, r.optedOut, r.lastInteractionAt?.toISOString()].map(esc).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="contacts-${sessionId.slice(0, 8)}.csv"` } });
}, { summary: "Export contacts CSV", tag: "Contacts" });
route("POST", "/contacts/check", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ phone: z.string() })); return ContactService.checkNumber(sessionFromCtx(ctx), b.phone); }, { summary: "Check if a number is on WhatsApp", tag: "Contacts", body: { phone: "5511999999999" } });
route("GET", "/contacts/blocklist", "VIEWER", async (ctx) => ContactService.blockList(sessionFromCtx(ctx)), { summary: "Blocked contacts", tag: "Contacts" });
route("POST", "/contacts/bulk-labels", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ contactIds: z.array(z.string()).min(1), labelId: z.string(), action: z.enum(["add", "remove"]) })); if (b.action === "add") await db.insert(contactLabels).values(b.contactIds.map((c) => ({ id: newId(), contactId: c, labelId: b.labelId }))).onConflictDoNothing(); else await db.delete(contactLabels).where(and(inArray(contactLabels.contactId, b.contactIds), eq(contactLabels.labelId, b.labelId))); return { ok: true }; }, { summary: "Bulk assign/remove label", tag: "Contacts" });
route("GET", "/contacts/:id", "VIEWER", async (ctx) => {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, ctx.params.id)); if (!c) throw notFound("Contact"); S(ctx, c.sessionId);
  const [withL] = await withLabels([{ ...c, rawPayload: undefined }]);
  const [camps, [stats], [owner]] = await Promise.all([
    db.select({ id: campaigns.id, name: campaigns.name, status: campaignRecipients.status, sentAt: campaignRecipients.sentAt, error: campaignRecipients.errorMessage }).from(campaignRecipients).innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId)).where(eq(campaignRecipients.contactId, c.id)).orderBy(desc(campaignRecipients.createdAt)).limit(20),
    db.select({ total: sql<number>`count(*)::int`, sent: sql<number>`sum(case when ${messages.fromMe} then 1 else 0 end)::int`, received: sql<number>`sum(case when ${messages.fromMe} then 0 else 1 end)::int`, last: sql<number>`max(${messages.timestamp})` }).from(messages).where(and(eq(messages.sessionId, c.sessionId), eq(messages.chatId, c.waId))),
    c.ownerUserId ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, c.ownerUserId)) : Promise.resolve([null]),
  ]);
  return { ...withL, campaigns: camps, stats, owner };
}, { summary: "Contact profile (CRM + stats)", tag: "Contacts" });
route("PATCH", "/contacts/:id", "OPERATOR", async (ctx) => {
  const b = await ctx.body(contactSchema.partial()); const [c] = await db.select().from(contacts).where(eq(contacts.id, ctx.params.id)); if (!c) throw notFound("Contact"); S(ctx, c.sessionId);
  const { labelIds, customFields, phone: _p, waId: _w, ...rest } = b; void _p; void _w;
  await db.update(contacts).set({ ...rest, email: rest.email === "" ? null : rest.email, optOutAt: rest.optedOut ? new Date() : rest.optedOut === false ? null : undefined, updatedAt: new Date() }).where(eq(contacts.id, c.id));
  if (labelIds) { await db.delete(contactLabels).where(eq(contactLabels.contactId, c.id)); if (labelIds.length) await db.insert(contactLabels).values(labelIds.map((l) => ({ id: newId(), contactId: c.id, labelId: l }))).onConflictDoNothing(); }
  if (customFields) for (const [k, v] of Object.entries(customFields)) await db.insert(contactCustomFields).values({ id: newId(), contactId: c.id, key: k, value: v }).onConflictDoUpdate({ target: [contactCustomFields.contactId, contactCustomFields.key], set: { value: v } });
  const [row] = await db.select().from(contacts).where(eq(contacts.id, c.id));
  return (await withLabels([{ ...row, rawPayload: undefined }]))[0];
}, { summary: "Update CRM contact", tag: "Contacts" });
route("DELETE", "/contacts/:id", "OPERATOR", async (ctx) => { const [c] = await db.select().from(contacts).where(eq(contacts.id, ctx.params.id)); if (!c) throw notFound("Contact"); S(ctx, c.sessionId); await db.delete(contactLabels).where(eq(contactLabels.contactId, c.id)); await db.delete(contactCustomFields).where(eq(contactCustomFields.contactId, c.id)); await db.delete(contacts).where(eq(contacts.id, c.id)); return { deleted: true }; }, { summary: "Delete local CRM contact", tag: "Contacts" });
route("GET", "/contacts/:id/whatsapp", "VIEWER", async (ctx) => {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, ctx.params.id)); if (!c) throw notFound("Contact"); S(ctx, c.sessionId);
  const [about, picture, presence, live] = await Promise.all([ContactService.getAbout(c.sessionId, c.waId).catch(() => null), ContactService.getPicture(c.sessionId, c.waId).catch(() => null), PresenceService.get(c.sessionId, c.waId).catch(() => null), ContactService.getLive(c.sessionId, c.waId).catch(() => null)]);
  return { about, picture, presence, live };
}, { summary: "Live WhatsApp-side info (about, picture, presence)", tag: "Contacts" });
route("GET", "/contacts/:id/common-groups", "VIEWER", async (ctx) => { const [c] = await db.select().from(contacts).where(eq(contacts.id, ctx.params.id)); if (!c) throw notFound("Contact"); return ContactService.commonGroups(S(ctx, c.sessionId), c.waId); }, { summary: "Common groups", tag: "Contacts" });
route("POST", "/contacts/:id/block", "OPERATOR", async (ctx) => { const [c] = await db.select().from(contacts).where(eq(contacts.id, ctx.params.id)); if (!c) throw notFound("Contact"); return { ok: await ContactService.block(S(ctx, c.sessionId), c.waId, true) }; }, { summary: "Block contact", tag: "Contacts" });
route("POST", "/contacts/:id/unblock", "OPERATOR", async (ctx) => { const [c] = await db.select().from(contacts).where(eq(contacts.id, ctx.params.id)); if (!c) throw notFound("Contact"); return { ok: await ContactService.block(S(ctx, c.sessionId), c.waId, false) }; }, { summary: "Unblock contact", tag: "Contacts" });
route("GET", "/custom-fields", "VIEWER", async () => db.select().from(customFieldDefinitions).orderBy(asc(customFieldDefinitions.label)), { summary: "Custom field definitions", tag: "Contacts" });
route("POST", "/custom-fields", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/), label: z.string().min(1), type: z.enum(["text", "number", "date", "boolean"]).default("text") })); const [r] = await db.insert(customFieldDefinitions).values({ id: newId(), ...b }).onConflictDoUpdate({ target: customFieldDefinitions.key, set: { label: b.label, type: b.type } }).returning(); return r; }, { summary: "Create custom field", tag: "Contacts" });
route("DELETE", "/custom-fields/:id", "ADMIN", async (ctx) => { await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, ctx.params.id)); return { deleted: true }; }, { summary: "Delete custom field", tag: "Contacts" });

// ================= Groups =================
route("GET", "/groups", "VIEWER", async (ctx) => { const sessionId = sessionFromCtx(ctx); const q = ctx.url.searchParams.get("q"); const { limit, offset } = pageParams(ctx.url); const conds = [eq(groups.sessionId, sessionId)]; if (q) conds.push(ilike(groups.subject, `%${q}%`)); return (await db.select().from(groups).where(and(...conds)).orderBy(asc(groups.subject)).limit(limit).offset(offset)).map((g) => ({ ...g, rawPayload: undefined })); }, { summary: "List groups", tag: "Groups", query: { sessionId: "required" } });
route("POST", "/groups", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string().min(1), participants: z.array(z.string()).min(1) })); const s = sessionFromCtx(ctx); const r = await GroupService.create(s, b.name, b.participants); const gid = (r as { gid?: { _serialized?: string } })?.gid?._serialized; if (gid) await syncGroup(s, gid).catch(() => { }); return r; }, { summary: "Create group", tag: "Groups", body: { name: "Team", participants: ["5511999999999@c.us"] } });
route("POST", "/groups/join", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ inviteCode: z.string() })); return GroupService.join(sessionFromCtx(ctx), b.inviteCode.replace(/.*\//, "")); }, { summary: "Join group by invite code", tag: "Groups" });
route("GET", "/groups/:id", "VIEWER", async (ctx) => {
  const s = sessionFromCtx(ctx); const [g] = await db.select().from(groups).where(and(eq(groups.sessionId, s), eq(groups.waId, ctx.params.id))); if (!g) throw notFound("Group");
  let members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, g.id));
  if ((!members.length || ctx.url.searchParams.get("refresh") === "1") && sessionManager.isReady(s)) { await syncGroup(s, g.waId).catch(() => { }); members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, g.id)); }
  const cts = members.length ? await db.select({ waId: contacts.waId, name: contacts.name, pushName: contacts.pushName, phone: contacts.phone, avatarUrl: contacts.avatarUrl }).from(contacts).where(and(eq(contacts.sessionId, s), inArray(contacts.waId, members.map((m) => m.waId)))) : [];
  const cm = new Map(cts.map((c) => [c.waId, c]));
  const [fresh] = await db.select().from(groups).where(eq(groups.id, g.id));
  return { ...fresh, rawPayload: undefined, members: members.map((m) => ({ ...m, contact: cm.get(m.waId) ?? null })) };
}, { summary: "Group details + members", tag: "Groups" });
route("PATCH", "/groups/:id", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ subject: z.string().optional(), description: z.string().optional() })); const s = sessionFromCtx(ctx); if (b.subject) await GroupService.setSubject(s, ctx.params.id, b.subject); if (b.description !== undefined) await GroupService.setDescription(s, ctx.params.id, b.description); await db.update(groups).set({ subject: b.subject, description: b.description, updatedAt: new Date() }).where(and(eq(groups.sessionId, s), eq(groups.waId, ctx.params.id))); return { ok: true }; }, { summary: "Update subject/description", tag: "Groups" });
route("PATCH", "/groups/:id/settings", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ announcement: z.boolean().optional(), restrict: z.boolean().optional(), ephemeral: z.boolean().optional() })); const s = sessionFromCtx(ctx); for (const k of ["announcement", "restrict", "ephemeral"] as const) if (b[k] !== undefined) await GroupService.setProperty(s, ctx.params.id, k, b[k]!); await db.update(groups).set({ isAnnounce: b.announcement, isRestricted: b.restrict }).where(and(eq(groups.sessionId, s), eq(groups.waId, ctx.params.id))); return { ok: true }; }, { summary: "Group permissions", tag: "Groups" });
route("GET", "/groups/:id/invite-link", "VIEWER", async (ctx) => { const s = sessionFromCtx(ctx); const link = await GroupService.inviteLink(s, ctx.params.id); await db.update(groups).set({ inviteLink: link }).where(and(eq(groups.sessionId, s), eq(groups.waId, ctx.params.id))); return { link }; }, { summary: "Invite link", tag: "Groups" });
route("POST", "/groups/:id/invite-link/revoke", "OPERATOR", async (ctx) => ({ link: await GroupService.revokeInviteLink(sessionFromCtx(ctx), ctx.params.id) }), { summary: "Revoke invite link", tag: "Groups" });
route("POST", "/groups/:id/participants", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ participants: z.array(z.string()).min(1) })); const s = sessionFromCtx(ctx); const r = await GroupService.addParticipants(s, ctx.params.id, b.participants); await syncGroup(s, ctx.params.id).catch(() => { }); return r; }, { summary: "Add participants", tag: "Groups" });
route("DELETE", "/groups/:id/participants", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ participants: z.array(z.string()).min(1) })); const s = sessionFromCtx(ctx); await GroupService.removeParticipants(s, ctx.params.id, b.participants); await syncGroup(s, ctx.params.id).catch(() => { }); return { ok: true }; }, { summary: "Remove participants", tag: "Groups" });
route("POST", "/groups/:id/promote", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ participants: z.array(z.string()).min(1) })); const s = sessionFromCtx(ctx); await GroupService.promote(s, ctx.params.id, b.participants); await syncGroup(s, ctx.params.id).catch(() => { }); return { ok: true }; }, { summary: "Promote to admin", tag: "Groups" });
route("POST", "/groups/:id/demote", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ participants: z.array(z.string()).min(1) })); const s = sessionFromCtx(ctx); await GroupService.demote(s, ctx.params.id, b.participants); await syncGroup(s, ctx.params.id).catch(() => { }); return { ok: true }; }, { summary: "Demote admin", tag: "Groups" });
route("POST", "/groups/:id/leave", "OPERATOR", async (ctx) => { const s = sessionFromCtx(ctx); await GroupService.leave(s, ctx.params.id); await db.delete(groups).where(and(eq(groups.sessionId, s), eq(groups.waId, ctx.params.id))); return { ok: true }; }, { summary: "Leave group", tag: "Groups" });
route("POST", "/groups/:id/icon", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ base64: z.string() })); return GroupService.setIcon(sessionFromCtx(ctx), ctx.params.id, b.base64); }, { summary: "Set group icon", tag: "Groups" });
route("GET", "/groups/:id/requests", "VIEWER", async (ctx) => GroupService.membershipRequests(sessionFromCtx(ctx), ctx.params.id), { summary: "Membership requests", tag: "Groups" });
route("POST", "/groups/:id/requests/approve", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ ids: z.array(z.string()) })); return GroupService.approve(sessionFromCtx(ctx), ctx.params.id, b.ids); }, { summary: "Approve requests", tag: "Groups" });
route("POST", "/groups/:id/requests/reject", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ ids: z.array(z.string()) })); return GroupService.reject(sessionFromCtx(ctx), ctx.params.id, b.ids); }, { summary: "Reject requests", tag: "Groups" });

// ================= Labels =================
route("GET", "/labels", "VIEWER", async () => { const rows = await db.select({ id: labels.id, name: labels.name, color: labels.color, createdAt: labels.createdAt, count: sql<number>`(select count(*)::int from ${contactLabels} where ${contactLabels.labelId} = ${labels.id})` }).from(labels).orderBy(asc(labels.name)); return rows; }, { summary: "CRM labels", tag: "Labels" });
route("POST", "/labels", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#22c55e") })); const [r] = await db.insert(labels).values({ id: newId(), ...b }).returning(); return r; }, { summary: "Create label", tag: "Labels", body: { name: "Hot Lead", color: "#ef4444" } });
route("PATCH", "/labels/:id", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string().min(1).max(40).optional(), color: z.string().optional() })); const [r] = await db.update(labels).set(b).where(eq(labels.id, ctx.params.id)).returning(); if (!r) throw notFound("Label"); return r; }, { summary: "Rename/recolor label", tag: "Labels" });
route("DELETE", "/labels/:id", "OPERATOR", async (ctx) => { await db.delete(contactLabels).where(eq(contactLabels.labelId, ctx.params.id)); await db.delete(labels).where(eq(labels.id, ctx.params.id)); return { deleted: true }; }, { summary: "Delete label", tag: "Labels" });
route("GET", "/labels/native", "VIEWER", async (ctx) => NativeLabelService.list(sessionFromCtx(ctx)), { summary: "Native WhatsApp labels (Business)", tag: "Labels" });
route("POST", "/labels/native", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string(), color: z.number().optional() })); return { ok: await NativeLabelService.create(sessionFromCtx(ctx), b.name, b.color) }; }, { summary: "Create native label", tag: "Labels" });
route("DELETE", "/labels/native/:id", "OPERATOR", async (ctx) => ({ ok: await NativeLabelService.remove(sessionFromCtx(ctx), ctx.params.id) }), { summary: "Delete native label", tag: "Labels" });
route("POST", "/labels/native/assign", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ chatId: z.string(), labelId: z.string(), type: z.enum(["add", "remove"]) })); return { ok: await NativeLabelService.assign(sessionFromCtx(ctx), b.chatId, b.labelId, b.type) }; }, { summary: "Assign native label to chat", tag: "Labels" });

// ================= Templates =================
const templateSchema = z.object({ name: z.string().min(1).max(80), category: z.string().default("MARKETING"), language: z.string().default("en"), header: z.string().nullable().optional(), body: z.string().min(1), footer: z.string().nullable().optional(), mediaPath: z.string().nullable().optional(), mediaMimeType: z.string().nullable().optional(), mediaFilename: z.string().nullable().optional(), buttons: z.array(z.object({ text: z.string(), id: z.string().optional() })).default([]) });
route("GET", "/templates", "VIEWER", async (ctx) => { const q = ctx.url.searchParams.get("q"); const cat = ctx.url.searchParams.get("category"); const conds = []; if (q) conds.push(or(ilike(templates.name, `%${q}%`), ilike(templates.body, `%${q}%`))!); if (cat) conds.push(eq(templates.category, cat)); return db.select().from(templates).where(conds.length ? and(...conds) : undefined).orderBy(desc(templates.updatedAt)); }, { summary: "List templates", tag: "Templates" });
route("POST", "/templates", "OPERATOR", async (ctx) => { const b = await ctx.body(templateSchema); const errs = validateTemplateBody(b.body); if (errs.length) throw new ApiError("TEMPLATE_INVALID", errs.join("; "), 422); const [r] = await db.insert(templates).values({ id: newId(), ...b, variables: extractVariables([b.header, b.body, b.footer].filter(Boolean).join(" ")), createdBy: ctx.principal.id }).returning(); await audit(ctx.principal, "template.created", { resource: "template", resourceId: r.id, ip: ctx.ip }); return r; }, { summary: "Create template", tag: "Templates", body: { name: "welcome", body: "Hello {{first_name}}, welcome to {{company}}!" } });
route("POST", "/templates/render", "VIEWER", async (ctx) => { const b = await ctx.body(z.object({ body: z.string(), contactId: z.string().optional(), variables: z.record(z.string(), z.string()).optional() })); let vars = {}; if (b.contactId) { const [c] = await db.select().from(contacts).where(eq(contacts.id, b.contactId)); if (c) { const cf = await db.select().from(contactCustomFields).where(eq(contactCustomFields.contactId, c.id)); vars = { ...contactToVariables(c), ...Object.fromEntries(cf.map((f) => [f.key, f.value])) }; } } return { ...renderTemplate(b.body, { contact: vars, campaign: b.variables }, { fallback: "" }), errors: validateTemplateBody(b.body), variables: extractVariables(b.body) }; }, { summary: "Render/validate template preview", tag: "Templates" });
route("GET", "/templates/:id", "VIEWER", async (ctx) => { const [t] = await db.select().from(templates).where(eq(templates.id, ctx.params.id)); if (!t) throw notFound("Template"); const camps = await db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, sent: campaigns.sentCount, failed: campaigns.failedCount, total: campaigns.totalRecipients }).from(campaigns).where(eq(campaigns.templateId, t.id)).orderBy(desc(campaigns.createdAt)).limit(20); const sent = camps.reduce((a, c) => a + c.sent, 0); const total = camps.reduce((a, c) => a + c.total, 0); return { ...t, campaigns: camps, successRate: total ? Math.round((sent / total) * 100) : null }; }, { summary: "Template details + usage stats", tag: "Templates" });
route("PATCH", "/templates/:id", "OPERATOR", async (ctx) => { const b = await ctx.body(templateSchema.partial()); if (b.body) { const errs = validateTemplateBody(b.body); if (errs.length) throw new ApiError("TEMPLATE_INVALID", errs.join("; "), 422); } const [old] = await db.select().from(templates).where(eq(templates.id, ctx.params.id)); if (!old) throw notFound("Template"); const merged = { ...old, ...b }; const [r] = await db.update(templates).set({ ...b, variables: extractVariables([merged.header, merged.body, merged.footer].filter(Boolean).join(" ")), updatedAt: new Date() }).where(eq(templates.id, ctx.params.id)).returning(); await audit(ctx.principal, "template.edited", { resource: "template", resourceId: r.id, ip: ctx.ip }); return r; }, { summary: "Update template", tag: "Templates" });
route("POST", "/templates/:id/duplicate", "OPERATOR", async (ctx) => { const [t] = await db.select().from(templates).where(eq(templates.id, ctx.params.id)); if (!t) throw notFound("Template"); const { id: _i, createdAt: _c, updatedAt: _u, timesUsed: _t, lastUsedAt: _l, ...rest } = t; void _i; void _c; void _u; void _t; void _l; const [r] = await db.insert(templates).values({ ...rest, id: newId(), name: `${t.name} (copy)` }).returning(); return r; }, { summary: "Duplicate template", tag: "Templates" });
route("DELETE", "/templates/:id", "OPERATOR", async (ctx) => { await db.delete(templates).where(eq(templates.id, ctx.params.id)); await audit(ctx.principal, "template.deleted", { resource: "template", resourceId: ctx.params.id, ip: ctx.ip }); return { deleted: true }; }, { summary: "Delete template", tag: "Templates" });

// ================= Campaigns =================
const audienceSchema = z.object({ contactIds: z.array(z.string()).optional(), labelIds: z.array(z.string()).optional(), excludeLabelIds: z.array(z.string()).optional(), groupIds: z.array(z.string()).optional(), waIds: z.array(z.string()).optional(), all: z.boolean().optional() });
const campaignSchema = z.object({ name: z.string().min(1).max(100), sessionId: z.string(), messageType: z.enum(["text", "template", "image", "video", "audio", "document", "location", "contact"]).default("text"), templateId: z.string().nullable().optional(), body: z.string().nullable().optional(), mediaPath: z.string().nullable().optional(), mediaMimeType: z.string().nullable().optional(), mediaFilename: z.string().nullable().optional(), payload: z.record(z.string(), z.unknown()).default({}), variables: z.record(z.string(), z.string()).default({}), audience: audienceSchema.default({}), settings: z.object({ messagesPerMinute: z.number().min(1).max(60).optional(), minDelayMs: z.number().min(500).optional(), maxDelayMs: z.number().min(500).optional(), retryCount: z.number().min(0).max(5).optional(), retryDelayMs: z.number().optional(), skipOptedOut: z.boolean().optional() }).default({}), scheduledAt: z.string().datetime().nullable().optional() });
route("GET", "/campaigns", "VIEWER", async (ctx) => { const sessionId = ctx.url.searchParams.get("sessionId"); const status = ctx.url.searchParams.get("status"); const conds = []; if (sessionId) conds.push(eq(campaigns.sessionId, S(ctx, sessionId))); if (status) conds.push(eq(campaigns.status, status)); return db.select().from(campaigns).where(conds.length ? and(...conds) : undefined).orderBy(desc(campaigns.createdAt)).limit(200); }, { summary: "List campaigns", tag: "Campaigns" });
route("POST", "/campaigns", "OPERATOR", async (ctx) => { const b = await ctx.body(campaignSchema); S(ctx, b.sessionId); if (b.messageType === "template" && !b.templateId) throw new ApiError("VALIDATION_ERROR", "templateId required", 422); if (b.messageType === "text" && !b.body) throw new ApiError("VALIDATION_ERROR", "body required", 422); if (["image", "video", "audio", "document"].includes(b.messageType) && !b.mediaPath) throw new ApiError("VALIDATION_ERROR", "media required", 422); const [r] = await db.insert(campaigns).values({ id: newId(), ...b, scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null, createdBy: ctx.principal.id }).returning(); await audit(ctx.principal, "campaign.created", { resource: "campaign", resourceId: r.id, sessionId: b.sessionId, ip: ctx.ip }); return r; }, { summary: "Create campaign (DRAFT)", tag: "Campaigns", body: { name: "Promo", sessionId: "<sessionId>", messageType: "text", body: "Hi {{first_name}}", audience: { labelIds: ["<labelId>"] } } });
route("POST", "/campaigns/audience/preview", "VIEWER", async (ctx) => { const b = await ctx.body(z.object({ sessionId: z.string(), audience: audienceSchema })); const r = await resolveAudience(S(ctx, b.sessionId), b.audience); return { total: r.total, optedOut: r.optedOut, sample: r.recipients.slice(0, 200) }; }, { summary: "Preview audience size & opt-outs", tag: "Campaigns" });
route("GET", "/campaigns/:id", "VIEWER", async (ctx) => { const c = await campaignService.get(ctx.params.id); S(ctx, c.sessionId); const [t] = c.templateId ? await db.select().from(templates).where(eq(templates.id, c.templateId)) : []; return { ...c, template: t ?? null }; }, { summary: "Campaign details", tag: "Campaigns" });
route("PATCH", "/campaigns/:id", "OPERATOR", async (ctx) => { const c = await campaignService.get(ctx.params.id); if (!["DRAFT", "PAUSED"].includes(c.status)) throw new ApiError("INVALID_STATE", "Only DRAFT/PAUSED campaigns can be edited", 409); const b = await ctx.body(campaignSchema.partial()); const [r] = await db.update(campaigns).set({ ...b, scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : undefined, updatedAt: new Date() }).where(eq(campaigns.id, c.id)).returning(); return r; }, { summary: "Update draft campaign", tag: "Campaigns" });
route("DELETE", "/campaigns/:id", "OPERATOR", async (ctx) => { const c = await campaignService.get(ctx.params.id); if (["RUNNING", "QUEUED"].includes(c.status)) throw new ApiError("INVALID_STATE", "Stop the campaign before deleting", 409); await db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, c.id)); await db.delete(campaignJobs).where(eq(campaignJobs.campaignId, c.id)); await db.delete(campaigns).where(eq(campaigns.id, c.id)); return { deleted: true }; }, { summary: "Delete campaign", tag: "Campaigns" });
for (const a of ["start", "pause", "resume", "cancel"] as const) route("POST", `/campaigns/:id/${a}`, "OPERATOR", async (ctx) => { const c = await campaignService.get(ctx.params.id); S(ctx, c.sessionId); await campaignService[a](c.id); await audit(ctx.principal, `campaign.${a}`, { resource: "campaign", resourceId: c.id, sessionId: c.sessionId, ip: ctx.ip }); return campaignService.get(c.id); }, { summary: `${a} campaign`, tag: "Campaigns" });
route("POST", "/campaigns/:id/retry", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ recipientIds: z.array(z.string()).optional() }).default({})); return { requeued: await campaignService.retryFailed(ctx.params.id, b.recipientIds) }; }, { summary: "Retry failed recipients", tag: "Campaigns" });
route("GET", "/campaigns/:id/recipients", "VIEWER", async (ctx) => { const { limit, offset } = pageParams(ctx.url); const status = ctx.url.searchParams.get("status"); const conds = [eq(campaignRecipients.campaignId, ctx.params.id)]; if (status) conds.push(eq(campaignRecipients.status, status)); const [rows, [{ n }]] = await Promise.all([db.select().from(campaignRecipients).where(and(...conds)).orderBy(asc(campaignRecipients.createdAt)).limit(limit).offset(offset), db.select({ n: sql<number>`count(*)::int` }).from(campaignRecipients).where(and(...conds))]); return { items: rows, total: n }; }, { summary: "Campaign recipients (paginated)", tag: "Campaigns" });
route("GET", "/campaigns/:id/analytics", "VIEWER", async (ctx) => { const c = await campaignService.get(ctx.params.id); const byStatus = await db.select({ status: campaignRecipients.status, n: sql<number>`count(*)::int` }).from(campaignRecipients).where(eq(campaignRecipients.campaignId, c.id)).groupBy(campaignRecipients.status); const replies = await db.select({ n: sql<number>`count(distinct ${messages.chatId})::int` }).from(messages).innerJoin(campaignRecipients, and(eq(campaignRecipients.recipientWaId, messages.chatId), eq(campaignRecipients.campaignId, c.id))).where(and(eq(messages.sessionId, c.sessionId), eq(messages.fromMe, false), c.startedAt ? gte(messages.timestamp, Math.floor(c.startedAt.getTime() / 1000)) : sql`false`)); const timeline = await db.select({ minute: sql<string>`to_char(date_trunc('minute', ${campaignRecipients.sentAt}), 'YYYY-MM-DD HH24:MI')`, n: sql<number>`count(*)::int` }).from(campaignRecipients).where(and(eq(campaignRecipients.campaignId, c.id), sql`${campaignRecipients.sentAt} is not null`)).groupBy(sql`1`).orderBy(sql`1`); return { byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s.n])), responses: replies[0]?.n ?? 0, timeline, durationMs: c.startedAt && c.completedAt ? c.completedAt.getTime() - c.startedAt.getTime() : null, note: "Delivered/read counts depend on WhatsApp ACK events received by this session." }; }, { summary: "Campaign analytics", tag: "Campaigns" });

// ================= Webhooks =================
const webhookSchema = z.object({ name: z.string().min(1), url: z.string().url(), secret: z.string().nullable().optional(), events: z.array(z.enum(WEBHOOK_EVENTS)).default([]), sessionIds: z.array(z.string()).default([]), headers: z.record(z.string(), z.string()).default({}), enabled: z.boolean().default(true), retryCount: z.number().min(0).max(10).default(3), timeoutMs: z.number().min(1000).max(60000).default(10000) });
route("GET", "/webhooks", "VIEWER", async () => { const rows = await db.select().from(webhooks).orderBy(asc(webhooks.createdAt)); return Promise.all(rows.map(async (w) => ({ ...w, secret: w.secret ? "••••••" : null, stats: await webhookService.stats(w.id) }))); }, { summary: "List webhooks", tag: "Webhooks" });
route("POST", "/webhooks", "ADMIN", async (ctx) => { const b = await ctx.body(webhookSchema); await assertSafeUrl(b.url); const [r] = await db.insert(webhooks).values({ id: newId(), ...b }).returning(); await audit(ctx.principal, "webhook.created", { resource: "webhook", resourceId: r.id, ip: ctx.ip }); return r; }, { summary: "Create webhook", tag: "Webhooks", body: { name: "CRM sync", url: "https://example.com/hook", events: ["message.received"], secret: "s3cret" } });
route("PATCH", "/webhooks/:id", "ADMIN", async (ctx) => { const b = await ctx.body(webhookSchema.partial()); if (b.url) await assertSafeUrl(b.url); const [r] = await db.update(webhooks).set(b).where(eq(webhooks.id, ctx.params.id)).returning(); if (!r) throw notFound("Webhook"); return r; }, { summary: "Update webhook", tag: "Webhooks" });
route("DELETE", "/webhooks/:id", "ADMIN", async (ctx) => { await db.delete(webhookDeliveries).where(eq(webhookDeliveries.webhookId, ctx.params.id)); await db.delete(webhooks).where(eq(webhooks.id, ctx.params.id)); return { deleted: true }; }, { summary: "Delete webhook", tag: "Webhooks" });
route("POST", "/webhooks/:id/test", "ADMIN", async (ctx) => webhookService.test(ctx.params.id), { summary: "Send test delivery", tag: "Webhooks" });
route("GET", "/webhooks/:id/deliveries", "VIEWER", async (ctx) => { const { limit, offset } = pageParams(ctx.url); const status = ctx.url.searchParams.get("status"); const conds = [eq(webhookDeliveries.webhookId, ctx.params.id)]; if (status) conds.push(eq(webhookDeliveries.status, status)); return db.select().from(webhookDeliveries).where(and(...conds)).orderBy(desc(webhookDeliveries.createdAt)).limit(limit).offset(offset); }, { summary: "Delivery log", tag: "Webhooks" });
route("POST", "/webhooks/deliveries/:id/retry", "ADMIN", async (ctx) => { await webhookService.retry(ctx.params.id); const [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, ctx.params.id)); return d; }, { summary: "Retry delivery", tag: "Webhooks" });

// ================= Automation =================
const ruleSchema = z.object({ name: z.string().min(1), enabled: z.boolean().default(true), sessionId: z.string().nullable().optional(), trigger: z.string().default("message.received"), conditions: z.array(z.object({ type: z.string(), value: z.string().optional(), labelId: z.string().optional(), start: z.string().optional(), end: z.string().optional(), days: z.array(z.number()).optional() })).default([]), actions: z.array(z.object({ type: z.string(), text: z.string().optional(), templateId: z.string().optional(), labelId: z.string().optional(), userId: z.string().optional() })).min(1), cooldownSeconds: z.number().min(0).default(60) });
route("GET", "/automation/rules", "VIEWER", async () => db.select().from(automationRules).orderBy(asc(automationRules.createdAt)), { summary: "List automation rules", tag: "Automation" });
route("POST", "/automation/rules", "OPERATOR", async (ctx) => { const b = await ctx.body(ruleSchema); const [r] = await db.insert(automationRules).values({ id: newId(), ...b }).returning(); return r; }, { summary: "Create rule", tag: "Automation", body: { name: "Welcome", conditions: [{ type: "contains", value: "hello" }], actions: [{ type: "send_text", text: "Hi {{first_name}}!" }] } });
route("PATCH", "/automation/rules/:id", "OPERATOR", async (ctx) => { const b = await ctx.body(ruleSchema.partial()); const [r] = await db.update(automationRules).set(b).where(eq(automationRules.id, ctx.params.id)).returning(); if (!r) throw notFound("Rule"); return r; }, { summary: "Update rule", tag: "Automation" });
route("DELETE", "/automation/rules/:id", "OPERATOR", async (ctx) => { await db.delete(automationRules).where(eq(automationRules.id, ctx.params.id)); return { deleted: true }; }, { summary: "Delete rule", tag: "Automation" });

// ================= Profile / Catalog / Status / Channels =================
route("GET", "/profile", "VIEWER", async (ctx) => ProfileService.get(sessionFromCtx(ctx)), { summary: "My profile + business profile", tag: "Profile" });
route("PATCH", "/profile", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string().optional(), about: z.string().optional() })); const s = sessionFromCtx(ctx); if (b.name) await ProfileService.setName(s, b.name); if (b.about !== undefined) await ProfileService.setAbout(s, b.about); await db.update(waSessions).set({ profileName: b.name }).where(eq(waSessions.id, s)); return { ok: true }; }, { summary: "Update name/about", tag: "Profile" });
route("POST", "/profile/picture", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ base64: z.string() })); return { ok: await ProfileService.setPicture(sessionFromCtx(ctx), b.base64) }; }, { summary: "Set profile picture", tag: "Profile" });
route("DELETE", "/profile/picture", "OPERATOR", async (ctx) => ({ ok: await ProfileService.removePicture(sessionFromCtx(ctx)) }), { summary: "Remove profile picture", tag: "Profile" });
route("PATCH", "/profile/business", "OPERATOR", async (ctx) => { const b = await ctx.body(z.record(z.string(), z.unknown())); return ProfileService.editBusiness(sessionFromCtx(ctx), b); }, { summary: "Edit business profile", tag: "Profile" });
route("GET", "/profile/business/:id", "VIEWER", async (ctx) => ProfileService.getBusiness(sessionFromCtx(ctx), ctx.params.id), { summary: "Business profile of a contact", tag: "Profile" });
route("GET", "/catalog", "VIEWER", async (ctx) => CatalogService.products(sessionFromCtx(ctx), ctx.url.searchParams.get("contactId") ?? undefined), { summary: "Catalog products (own or a business contact)", tag: "Catalog" });
route("GET", "/catalog/collections", "VIEWER", async (ctx) => CatalogService.collections(sessionFromCtx(ctx), ctx.url.searchParams.get("contactId") ?? undefined), { summary: "Catalog collections", tag: "Catalog" });
route("POST", "/catalog/products", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string(), image: z.string(), description: z.string().default(""), price: z.number(), isHidden: z.boolean().default(false), url: z.string().default(""), retailerId: z.string().default(""), currency: z.string().default("USD") })); return CatalogService.create(sessionFromCtx(ctx), b); }, { summary: "Create product", tag: "Catalog" });
route("PATCH", "/catalog/products/:id", "OPERATOR", async (ctx) => { const b = await ctx.body(z.record(z.string(), z.unknown())); return CatalogService.edit(sessionFromCtx(ctx), ctx.params.id, b); }, { summary: "Edit product", tag: "Catalog" });
route("DELETE", "/catalog/products/:id", "OPERATOR", async (ctx) => CatalogService.remove(sessionFromCtx(ctx), [ctx.params.id]), { summary: "Delete product", tag: "Catalog" });
route("POST", "/catalog/send", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ to: z.string(), base64: z.string(), caption: z.string().default(""), businessId: z.string(), productId: z.string() })); return CatalogService.sendProduct(sessionFromCtx(ctx), b.to, b.base64, b.caption, b.businessId, b.productId); }, { summary: "Send product message", tag: "Catalog" });
route("GET", "/status", "VIEWER", async (ctx) => StatusService.list(sessionFromCtx(ctx)), { summary: "Status/stories feed (status@broadcast)", tag: "Status" });
route("POST", "/status/text", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ text: z.string().min(1), backgroundColor: z.string().optional(), font: z.number().optional() })); return StatusService.sendText(sessionFromCtx(ctx), b.text, { backgroundColor: b.backgroundColor, font: b.font }); }, { summary: "Post text status", tag: "Status" });
route("POST", "/status/media", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ base64: z.string(), kind: z.enum(["image", "video"]), caption: z.string().optional() })); return b.kind === "image" ? StatusService.sendImage(sessionFromCtx(ctx), b.base64, b.caption) : StatusService.sendVideo(sessionFromCtx(ctx), b.base64, b.caption); }, { summary: "Post media status", tag: "Status" });
route("POST", "/status/read", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ chatId: z.string(), statusId: z.string() })); await StatusService.markRead(sessionFromCtx(ctx), b.chatId, b.statusId); return { ok: true }; }, { summary: "Mark status viewed", tag: "Status" });
route("GET", "/channels", "VIEWER", async (ctx) => ChannelService.list(sessionFromCtx(ctx)), { summary: "List channels/newsletters", tag: "Channels" });
route("POST", "/channels", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string(), description: z.string().optional(), picture: z.string().optional() })); return ChannelService.create(sessionFromCtx(ctx), b.name, b); }, { summary: "Create channel", tag: "Channels" });
route("GET", "/channels/:id/messages", "VIEWER", async (ctx) => ChannelService.messages(sessionFromCtx(ctx), ctx.params.id), { summary: "Channel messages", tag: "Channels" });
route("PATCH", "/channels/:id", "OPERATOR", async (ctx) => { const b = await ctx.body(z.object({ name: z.string().optional(), description: z.string().optional(), picture: z.string().nullable().optional() })); return ChannelService.edit(sessionFromCtx(ctx), ctx.params.id, b); }, { summary: "Edit channel", tag: "Channels" });
route("DELETE", "/channels/:id", "ADMIN", async (ctx) => ({ ok: await ChannelService.destroy(sessionFromCtx(ctx), ctx.params.id) }), { summary: "Delete channel", tag: "Channels" });
route("POST", "/channels/:id/mute", "OPERATOR", async (ctx) => ChannelService.mute(sessionFromCtx(ctx), ctx.params.id), { summary: "Mute channel", tag: "Channels" });

// ================= Developer =================
route("GET", "/developer/capabilities", "VIEWER", async () => { const tests = await db.select().from(capabilityTests); const tm = new Map(tests.map((t) => [t.method, t])); const audit = runCapabilityAudit(); const runtime = new Set(audit.unsupportedMethods); return { audit, listeners: LISTENERS, capabilities: CAPABILITIES.map((c) => ({ ...c, availableInVersion: !runtime.has(c.method), test: tm.get(c.method) ?? null })) }; }, { summary: "WPPConnect capability registry + audit", tag: "Developer" });
route("POST", "/developer/capabilities/invoke", "OPERATOR", async (ctx) => {
  const b = await ctx.body(z.object({ sessionId: z.string(), method: z.string(), args: z.array(z.unknown()).default([]) })); S(ctx, b.sessionId);
  const c = getCapability(b.method); if (!c) throw new ApiError("METHOD_NOT_ALLOWED", "Unknown capability", 403);
  if (c.dangerous && ctx.principal.role !== "ADMIN") throw new ApiError("FORBIDDEN", "This capability requires ADMIN", 403);
  const started = Date.now();
  try { const r = await invokeCapability(b.sessionId, b.method, b.args); await db.insert(capabilityTests).values({ method: b.method, status: "SUPPORTED", durationMs: r.durationMs, error: null }).onConflictDoUpdate({ target: capabilityTests.method, set: { status: "SUPPORTED", durationMs: r.durationMs, error: null, lastTestedAt: new Date() } }); return { ok: true, method: b.method, durationMs: r.durationMs, raw: r.result }; }
  catch (e) { const msg = (e as Error).message; await db.insert(capabilityTests).values({ method: b.method, status: "ERROR", durationMs: Date.now() - started, error: msg }).onConflictDoUpdate({ target: capabilityTests.method, set: { status: "ERROR", error: msg, durationMs: Date.now() - started, lastTestedAt: new Date() } }); throw e; }
}, { summary: "Invoke a whitelisted WPPConnect method (explorer)", tag: "Developer", body: { sessionId: "<id>", method: "getConnectionState", args: [] } });
route("GET", "/developer/events", "VIEWER", async (ctx) => { const { limit } = pageParams(ctx.url); const ev = ctx.url.searchParams.get("event"); return db.select().from(eventLog).where(ev ? eq(eventLog.event, ev) : undefined).orderBy(desc(eventLog.id)).limit(limit); }, { summary: "Recent internal events (event monitor)", tag: "Developer" });
route("GET", "/developer/queue", "VIEWER", async () => ({ jobs: await db.select().from(campaignJobs).orderBy(desc(campaignJobs.createdAt)).limit(100), pendingWebhooks: await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.status, "PENDING")).limit(50) }), { summary: "Queue monitor", tag: "Developer" });
route("GET", "/developer/database", "ADMIN", async () => { const r = await db.execute(sql`select relname as table, n_live_tup::int as rows from pg_stat_user_tables order by relname`); return r.rows; }, { summary: "Database inspector (table row counts)", tag: "Developer" });
route("GET", "/developer/routes", "VIEWER", async () => (await import("./router")).listRoutes(), { summary: "List API routes", tag: "Developer" });
route("GET", "/openapi.json", "VIEWER", async () => openApiDocument(), { summary: "OpenAPI document", tag: "Developer" });

// ================= API keys / users / settings / logs =================
route("GET", "/api-keys", "ADMIN", async () => (await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt))).map((k) => ({ ...k, keyHash: undefined })), { summary: "List API keys", tag: "Auth" });
route("POST", "/api-keys", "ADMIN", async (ctx) => { const b = await ctx.body(z.object({ name: z.string().min(1), role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).default("OPERATOR"), allowedSessions: z.array(z.string()).default([]), expiresAt: z.string().datetime().nullable().optional() })); const k = generateApiKey(); const [r] = await db.insert(apiKeys).values({ id: newId(), name: b.name, role: b.role, allowedSessions: b.allowedSessions, keyHash: k.hash, prefix: k.prefix, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, createdBy: ctx.principal.id }).returning(); await audit(ctx.principal, "apikey.created", { resource: "api_key", resourceId: r.id, ip: ctx.ip }); return { ...r, keyHash: undefined, key: k.raw }; }, { summary: "Create API key (plaintext returned once)", tag: "Auth" });
route("DELETE", "/api-keys/:id", "ADMIN", async (ctx) => { await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, ctx.params.id)); await audit(ctx.principal, "apikey.revoked", { resource: "api_key", resourceId: ctx.params.id, ip: ctx.ip }); return { revoked: true }; }, { summary: "Revoke API key", tag: "Auth" });
route("GET", "/users", "VIEWER", async () => db.select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt }).from(users).orderBy(asc(users.name)), { summary: "List users", tag: "Auth" });
route("POST", "/users", "ADMIN", async (ctx) => { const b = await ctx.body(z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(1), role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]) })); const [r] = await db.insert(users).values({ id: newId(), email: b.email.toLowerCase(), passwordHash: await hashPassword(b.password), name: b.name, role: b.role }).returning({ id: users.id, email: users.email, name: users.name, role: users.role }); return r; }, { summary: "Create user", tag: "Auth" });
route("PATCH", "/users/:id", "ADMIN", async (ctx) => { const b = await ctx.body(z.object({ name: z.string().optional(), role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(), password: z.string().min(8).optional() })); const [r] = await db.update(users).set({ name: b.name, role: b.role, passwordHash: b.password ? await hashPassword(b.password) : undefined }).where(eq(users.id, ctx.params.id)).returning({ id: users.id, email: users.email, name: users.name, role: users.role }); return r; }, { summary: "Update user", tag: "Auth" });
route("DELETE", "/users/:id", "ADMIN", async (ctx) => { if (ctx.params.id === ctx.principal.id) throw new ApiError("INVALID", "Cannot delete yourself", 409); await db.delete(users).where(eq(users.id, ctx.params.id)); return { deleted: true }; }, { summary: "Delete user", tag: "Auth" });
route("POST", "/me/password", "VIEWER", async (ctx) => { if (ctx.principal.kind !== "user") throw new ApiError("FORBIDDEN", "Only browser users", 403); const b = await ctx.body(z.object({ current: z.string(), next: z.string().min(8) })); const [u] = await db.select().from(users).where(eq(users.id, ctx.principal.id)); if (!u || !(await verifyPassword(b.current, u.passwordHash))) throw new ApiError("INVALID_CREDENTIALS", "Current password is incorrect", 401); await db.update(users).set({ passwordHash: await hashPassword(b.next) }).where(eq(users.id, u.id)); return { ok: true }; }, { summary: "Change my password", tag: "Auth" });
route("GET", "/settings", "VIEWER", async () => getAllSettings(), { summary: "Get settings", tag: "Settings" });
route("PATCH", "/settings", "ADMIN", async (ctx) => { const b = await ctx.body(z.record(z.string(), z.unknown())); await setSettings(b); await audit(ctx.principal, "settings.changed", { ip: ctx.ip, metadata: { keys: Object.keys(b) } }); return getAllSettings(); }, { summary: "Update settings", tag: "Settings" });
route("GET", "/logs/system", "VIEWER", async (ctx) => { const { limit, offset } = pageParams(ctx.url); const level = ctx.url.searchParams.get("level"); const source = ctx.url.searchParams.get("source"); const q = ctx.url.searchParams.get("q"); const sessionId = ctx.url.searchParams.get("sessionId"); const conds = []; if (level) conds.push(eq(systemLogs.level, level)); if (source) conds.push(eq(systemLogs.source, source)); if (q) conds.push(ilike(systemLogs.message, `%${q}%`)); if (sessionId) conds.push(eq(systemLogs.sessionId, sessionId)); return db.select().from(systemLogs).where(conds.length ? and(...conds) : undefined).orderBy(desc(systemLogs.id)).limit(limit).offset(offset); }, { summary: "System logs", tag: "Logs" });
route("GET", "/logs/audit", "VIEWER", async (ctx) => { const { limit, offset } = pageParams(ctx.url); const q = ctx.url.searchParams.get("q"); return db.select().from(auditLogs).where(q ? or(ilike(auditLogs.action, `%${q}%`), ilike(auditLogs.userName, `%${q}%`)) : undefined).orderBy(desc(auditLogs.id)).limit(limit).offset(offset); }, { summary: "Audit logs", tag: "Logs" });
route("GET", "/search", "VIEWER", async (ctx) => {
  const q = ctx.url.searchParams.get("q") ?? ""; if (q.length < 2) return { contacts: [], chats: [], messages: [], campaigns: [], templates: [], groups: [] }; const like = `%${q}%`;
  const [c, ch, m, ca, t, g] = await Promise.all([
    db.select({ id: contacts.id, sessionId: contacts.sessionId, name: contacts.name, phone: contacts.phone, waId: contacts.waId }).from(contacts).where(or(ilike(contacts.name, like), ilike(contacts.phone, like), ilike(contacts.email, like), ilike(contacts.company, like))).limit(8),
    db.select({ waId: chats.waId, sessionId: chats.sessionId, name: chats.name }).from(chats).where(ilike(chats.name, like)).limit(8),
    db.select({ waMessageId: messages.waMessageId, sessionId: messages.sessionId, chatId: messages.chatId, body: messages.body, timestamp: messages.timestamp }).from(messages).where(ilike(messages.body, like)).orderBy(desc(messages.timestamp)).limit(8),
    db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status }).from(campaigns).where(ilike(campaigns.name, like)).limit(5),
    db.select({ id: templates.id, name: templates.name }).from(templates).where(or(ilike(templates.name, like), ilike(templates.body, like))).limit(5),
    db.select({ waId: groups.waId, sessionId: groups.sessionId, subject: groups.subject }).from(groups).where(ilike(groups.subject, like)).limit(5),
  ]);
  return { contacts: c, chats: ch, messages: m, campaigns: ca, templates: t, groups: g };
}, { summary: "Global search", tag: "System" });
route("POST", "/uploads", "OPERATOR", async (ctx) => {
  const form = await ctx.req.formData(); const file = form.get("file"); if (!(file instanceof File)) throw new ApiError("VALIDATION_ERROR", "file is required", 422);
  MediaService.validateUpload(file.type || "application/octet-stream", file.size, MAX_UPLOAD_BYTES);
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await storage.put(buf, { mimeType: file.type, filename: file.name.replace(/[^\w.\- ()]/g, "_"), folder: String(form.get("folder") || "uploads").replace(/[^a-z0-9_-]/gi, "") });
  return { ...stored, url: `/api/v1/uploads/${encodeURIComponent(stored.key)}` };
}, { summary: "Upload a file (multipart)", tag: "Media" });
route("GET", "/uploads/:key", "VIEWER", async (ctx) => { const key = ctx.params.key; if (!(await storage.exists(key))) throw notFound("File"); const buf = await storage.get(key); const ext = key.split(".").pop()?.toLowerCase(); const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : ext === "mp4" ? "video/mp4" : ext === "pdf" ? "application/pdf" : ext === "mp3" ? "audio/mpeg" : ext === "ogg" ? "audio/ogg" : "application/octet-stream"; return new Response(new Uint8Array(buf), { headers: { "content-type": mime, "cache-control": "private, max-age=86400" } }); }, { summary: "Serve uploaded file", tag: "Media" });
route("GET", "/admin/backup", "ADMIN", async (ctx) => {
  const tables = { users: users, wa_sessions: waSessions, contacts, contact_custom_fields: contactCustomFields, labels, contact_labels: contactLabels, templates, campaigns, campaign_recipients: campaignRecipients, webhooks, automation_rules: automationRules, settings: (await import("@/db/schema")).settings, chats, groups, group_members: groupMembers, messages };
  const out: Record<string, unknown[]> = {}; for (const [k, t] of Object.entries(tables)) out[k] = await db.select().from(t).limit(200000);
  await audit(ctx.principal, "backup.exported", { ip: ctx.ip });
  return new Response(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tables: out }), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="wacrm-backup-${Date.now()}.json"` } });
}, { summary: "Export application data (JSON backup)", tag: "Admin" });
route("POST", "/admin/restore", "ADMIN", async (ctx) => {
  const b = await ctx.body(z.object({ confirm: z.literal("RESTORE"), tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }));
  const map: Record<string, unknown> = { users, wa_sessions: waSessions, contacts, contact_custom_fields: contactCustomFields, labels, contact_labels: contactLabels, templates, campaigns, campaign_recipients: campaignRecipients, webhooks, automation_rules: automationRules, chats, groups, group_members: groupMembers, messages };
  const report: Record<string, number> = {};
  for (const [name, rows] of Object.entries(b.tables)) { const t = map[name]; if (!t || !rows.length) continue; const fixed = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && /At$|^timestamp$/.test(k) ? new Date(v) : v]))); const res = await db.insert(t as typeof users).values(fixed as never).onConflictDoNothing().returning(); report[name] = res.length; }
  await audit(ctx.principal, "backup.restored", { ip: ctx.ip, metadata: report });
  return report;
}, { summary: "Restore JSON backup (insert-only, conflicts skipped)", tag: "Admin" });
route("GET", "/dev/routes-count", "VIEWER", async () => ({ ok: true }));
void isNull;
