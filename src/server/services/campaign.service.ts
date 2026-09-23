import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignJobs, campaignRecipients, campaigns, contactLabels, contacts, groups, messageDeliveries, templates, contactCustomFields } from "@/db/schema";
import { ApiError, newId } from "@/lib/api";
import { eventBus } from "@/lib/events";
import { logger } from "@/lib/logger";
import { contactToVariables, renderTemplate } from "@/lib/template";
import { storage } from "@/lib/storage";
import { sessionManager } from "../wpp/session-manager";
import { MessageService } from "./whatsapp.service";
import { getSetting } from "./settings.service";

export type CampaignStatus = "DRAFT" | "VALIDATING" | "QUEUED" | "RUNNING" | "PAUSED" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export type RecipientStatus = "PENDING" | "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED" | "CANCELLED";

/** Allowed campaign state transitions (state machine). */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["VALIDATING", "QUEUED", "CANCELLED"], VALIDATING: ["QUEUED", "DRAFT", "FAILED"], QUEUED: ["RUNNING", "PAUSED", "CANCELLED"],
  RUNNING: ["PAUSED", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"], PAUSED: ["QUEUED", "RUNNING", "CANCELLED"],
  COMPLETED: [], PARTIAL: ["QUEUED"], FAILED: ["QUEUED"], CANCELLED: [],
};
export function canTransition(from: CampaignStatus, to: CampaignStatus) { return CAMPAIGN_TRANSITIONS[from]?.includes(to) ?? false; }

export interface AudienceSpec { contactIds?: string[]; labelIds?: string[]; excludeLabelIds?: string[]; groupIds?: string[]; waIds?: string[]; all?: boolean; search?: string; }

/** Resolves an audience spec against CRM contacts of a session (never requires typing phone numbers). */
export async function resolveAudience(sessionId: string, spec: AudienceSpec) {
  const rows = new Map<string, { contactId: string | null; waId: string; name: string | null; optedOut: boolean }>();
  const push = (c: { id: string | null; waId: string; name: string | null; pushName?: string | null; optedOut?: boolean }) => rows.set(c.waId, { contactId: c.id, waId: c.waId, name: c.name ?? c.pushName ?? null, optedOut: !!c.optedOut });
  if (spec.all) (await db.select().from(contacts).where(and(eq(contacts.sessionId, sessionId), eq(contacts.isWaContact, true)))).forEach(push);
  if (spec.contactIds?.length) (await db.select().from(contacts).where(and(eq(contacts.sessionId, sessionId), inArray(contacts.id, spec.contactIds)))).forEach(push);
  if (spec.labelIds?.length) {
    const r = await db.select({ c: contacts }).from(contactLabels).innerJoin(contacts, eq(contacts.id, contactLabels.contactId)).where(and(eq(contacts.sessionId, sessionId), inArray(contactLabels.labelId, spec.labelIds)));
    r.forEach((x) => push(x.c));
  }
  if (spec.groupIds?.length) (await db.select().from(groups).where(and(eq(groups.sessionId, sessionId), inArray(groups.id, spec.groupIds)))).forEach((g) => rows.set(g.waId, { contactId: null, waId: g.waId, name: g.subject, optedOut: false }));
  if (spec.waIds?.length) for (const w of spec.waIds) if (!rows.has(w)) rows.set(w, { contactId: null, waId: w, name: null, optedOut: false });
  if (spec.excludeLabelIds?.length) {
    const ex = await db.select({ contactId: contactLabels.contactId }).from(contactLabels).where(inArray(contactLabels.labelId, spec.excludeLabelIds));
    const exSet = new Set(ex.map((e) => e.contactId));
    for (const [k, v] of rows) if (v.contactId && exSet.has(v.contactId)) rows.delete(k);
  }
  const list = [...rows.values()];
  return { recipients: list, total: list.length, optedOut: list.filter((r) => r.optedOut).length };
}

class CampaignService {
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<string>();
  private workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  ensureStarted() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => logger.error("Queue", "tick failed", e)), 3000); this.timer.unref?.();
    logger.info("Queue", "campaign worker started", { workerId: this.workerId });
  }

  async get(id: string) { const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)); if (!c) throw new ApiError("NOT_FOUND", "Campaign not found", 404); return c; }

  private async setStatus(id: string, to: CampaignStatus, extra: Partial<typeof campaigns.$inferInsert> = {}) {
    const c = await this.get(id);
    if (!canTransition(c.status as CampaignStatus, to)) throw new ApiError("INVALID_TRANSITION", `Cannot move campaign from ${c.status} to ${to}`, 409);
    await db.update(campaigns).set({ status: to, updatedAt: new Date(), ...extra }).where(eq(campaigns.id, id));
    eventBus.publish("campaign.status", { campaignId: id, status: to, previous: c.status, name: c.name }, { sessionId: c.sessionId });
    return to;
  }

  /** Materialise audience into campaign_recipients (idempotent via unique (campaignId, waId)). */
  async buildRecipients(campaignId: string) {
    const c = await this.get(campaignId);
    const { recipients } = await resolveAudience(c.sessionId, c.audience as AudienceSpec);
    if (!recipients.length) throw new ApiError("EMPTY_AUDIENCE", "Campaign audience is empty", 422);
    const max = Number(await getSetting("campaign.maxSize", 5000));
    if (recipients.length > max) throw new ApiError("AUDIENCE_TOO_LARGE", `Audience exceeds maximum campaign size (${max})`, 422);
    const skipOptedOut = c.settings.skipOptedOut !== false;
    await db.insert(campaignRecipients).values(recipients.map((r) => ({
      id: newId(), campaignId, contactId: r.contactId, recipientWaId: r.waId, displayName: r.name,
      status: (r.optedOut && skipOptedOut ? "SKIPPED" : "PENDING") as RecipientStatus, errorMessage: r.optedOut && skipOptedOut ? "Contact opted out" : null,
    }))).onConflictDoNothing();
    await this.refreshCounters(campaignId);
  }

  async start(campaignId: string) {
    const c = await this.get(campaignId);
    if (!sessionManager.isReady(c.sessionId)) throw new ApiError("SESSION_NOT_READY", "Selected WhatsApp session is not ready", 409);
    if (c.status === "DRAFT") { await this.setStatus(campaignId, "VALIDATING"); try { await this.buildRecipients(campaignId); } catch (e) { await db.update(campaigns).set({ status: "DRAFT" }).where(eq(campaigns.id, campaignId)); throw e; } }
    await db.update(campaignRecipients).set({ status: "QUEUED" }).where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "PENDING")));
    await db.update(campaigns).set({ status: "QUEUED", startedAt: c.startedAt ?? new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    eventBus.publish("campaign.status", { campaignId, status: "QUEUED", name: c.name }, { sessionId: c.sessionId });
    await db.insert(campaignJobs).values({ id: newId(), campaignId, type: "SEND", runAt: c.scheduledAt ?? new Date() });
    this.ensureStarted();
  }
  async pause(id: string) { await this.setStatus(id, "PAUSED"); }
  async resume(id: string) {
    const c = await this.get(id);
    if (c.status !== "PAUSED") throw new ApiError("INVALID_TRANSITION", `Only PAUSED campaigns can be resumed (current: ${c.status})`, 409);
    await this.setStatus(id, "QUEUED"); await db.insert(campaignJobs).values({ id: newId(), campaignId: id, type: "SEND" }); this.ensureStarted(); }
  async cancel(id: string) {
    await this.setStatus(id, "CANCELLED", { completedAt: new Date() });
    await db.update(campaignRecipients).set({ status: "CANCELLED" }).where(and(eq(campaignRecipients.campaignId, id), inArray(campaignRecipients.status, ["PENDING", "QUEUED"])));
    await db.update(campaignJobs).set({ status: "CANCELLED" }).where(and(eq(campaignJobs.campaignId, id), eq(campaignJobs.status, "QUEUED")));
    await this.refreshCounters(id);
  }
  async retryFailed(id: string, recipientIds?: string[]) {
    const conds = [eq(campaignRecipients.campaignId, id), eq(campaignRecipients.status, "FAILED")];
    if (recipientIds?.length) conds.push(inArray(campaignRecipients.id, recipientIds));
    const r = await db.update(campaignRecipients).set({ status: "QUEUED", errorMessage: null, nextAttemptAt: null }).where(and(...conds)).returning({ id: campaignRecipients.id });
    if (!r.length) return 0;
    const c = await this.get(id);
    if (["COMPLETED", "PARTIAL", "FAILED"].includes(c.status)) await db.update(campaigns).set({ status: "QUEUED", completedAt: null }).where(eq(campaigns.id, id));
    await db.insert(campaignJobs).values({ id: newId(), campaignId: id, type: "SEND" });
    await this.refreshCounters(id);
    this.ensureStarted();
    return r.length;
  }

  async refreshCounters(id: string) {
    const rows = await db.select({ status: campaignRecipients.status, n: sql<number>`count(*)::int` }).from(campaignRecipients).where(eq(campaignRecipients.campaignId, id)).groupBy(campaignRecipients.status);
    const m: Record<string, number> = {}; let total = 0;
    for (const r of rows) { m[r.status] = r.n; total += r.n; }
    const sent = (m.SENT ?? 0) + (m.DELIVERED ?? 0) + (m.READ ?? 0);
    await db.update(campaigns).set({ totalRecipients: total, sentCount: sent, deliveredCount: (m.DELIVERED ?? 0) + (m.READ ?? 0), readCount: m.READ ?? 0, failedCount: m.FAILED ?? 0, skippedCount: m.SKIPPED ?? 0, updatedAt: new Date() }).where(eq(campaigns.id, id));
    const [c] = await db.select({ sessionId: campaigns.sessionId, status: campaigns.status }).from(campaigns).where(eq(campaigns.id, id));
    eventBus.publish("campaign.progress", { campaignId: id, total, sent, delivered: (m.DELIVERED ?? 0) + (m.READ ?? 0), read: m.READ ?? 0, failed: m.FAILED ?? 0, skipped: m.SKIPPED ?? 0, queued: (m.QUEUED ?? 0) + (m.PENDING ?? 0) + (m.SENDING ?? 0), status: c?.status }, { sessionId: c?.sessionId });
    return { total, ...m } as { total: number } & Record<string, number>;
  }

  /** Worker tick: claim due jobs (one per campaign) and process a batch of recipients with throttling. */
  private async tick() {
    const due = await db.select().from(campaignJobs).where(and(eq(campaignJobs.status, "QUEUED"), lte(campaignJobs.runAt, new Date()))).orderBy(asc(campaignJobs.runAt)).limit(5);
    for (const job of due) {
      if (this.running.has(job.campaignId)) continue;
      const claimed = await db.update(campaignJobs).set({ status: "RUNNING", lockedAt: new Date(), lockedBy: this.workerId, attempts: sql`${campaignJobs.attempts} + 1` }).where(and(eq(campaignJobs.id, job.id), eq(campaignJobs.status, "QUEUED"))).returning();
      if (!claimed.length) continue;
      this.running.add(job.campaignId);
      this.runCampaign(job.campaignId, job.id).catch((e) => logger.error("Campaign", "run failed", e, { campaignId: job.campaignId })).finally(() => this.running.delete(job.campaignId));
    }
  }

  private async runCampaign(campaignId: string, jobId: string) {
    let c = await this.get(campaignId);
    if (c.status !== "QUEUED") { await db.update(campaignJobs).set({ status: "DONE" }).where(eq(campaignJobs.id, jobId)); return; }
    await db.update(campaigns).set({ status: "RUNNING", updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    eventBus.publish("campaign.status", { campaignId, status: "RUNNING", name: c.name }, { sessionId: c.sessionId });
    const defaults = { messagesPerMinute: Number(await getSetting("campaign.messagesPerMinute", 20)), minDelayMs: Number(await getSetting("campaign.minDelayMs", 2000)), maxDelayMs: Number(await getSetting("campaign.maxDelayMs", 6000)), retryCount: Number(await getSetting("campaign.retryCount", 2)), retryDelayMs: Number(await getSetting("campaign.retryDelayMs", 30000)) };
    const s = { ...defaults, ...Object.fromEntries(Object.entries(c.settings).filter(([, v]) => v !== undefined && v !== null)) } as typeof defaults;
    const minInterval = Math.max(60000 / Math.max(1, s.messagesPerMinute), s.minDelayMs);
    const template = c.templateId ? (await db.select().from(templates).where(eq(templates.id, c.templateId)))[0] : null;
    let mediaBase64: string | null = null; const mediaPath = c.mediaPath ?? template?.mediaPath; const mediaMime = c.mediaMimeType ?? template?.mediaMimeType; const mediaName = c.mediaFilename ?? template?.mediaFilename;
    if (mediaPath) { try { mediaBase64 = (await storage.get(mediaPath)).toString("base64"); } catch (e) { logger.error("Campaign", "media load failed", e, { campaignId }); } }
    const bodyTemplate = template ? [template.header, template.body, template.footer].filter(Boolean).join("\n\n") : c.body ?? "";
    if (template) await db.update(templates).set({ timesUsed: sql`${templates.timesUsed} + 1`, lastUsedAt: new Date() }).where(eq(templates.id, template.id));

    let finished = false;
    while (!finished) {
      c = await this.get(campaignId);
      if (c.status !== "RUNNING") break; // paused / cancelled externally
      if (!sessionManager.isReady(c.sessionId)) { logger.warn("Campaign", "session not ready, pausing", { campaignId }); await db.update(campaigns).set({ status: "PAUSED", lastError: "Session disconnected" }).where(eq(campaigns.id, campaignId)); eventBus.publish("campaign.status", { campaignId, status: "PAUSED", reason: "Session disconnected" }, { sessionId: c.sessionId }); break; }
      const [rec] = await db.select().from(campaignRecipients).where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "QUEUED"), or(isNull(campaignRecipients.nextAttemptAt), lte(campaignRecipients.nextAttemptAt, new Date())))).orderBy(asc(campaignRecipients.createdAt)).limit(1);
      if (!rec) {
        const [pending] = await db.select({ n: sql<number>`count(*)::int` }).from(campaignRecipients).where(and(eq(campaignRecipients.campaignId, campaignId), inArray(campaignRecipients.status, ["QUEUED", "SENDING"])));
        if (pending.n > 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        finished = true; break;
      }
      // Claim: QUEUED -> SENDING (idempotent, row-level state transition)
      const claimed = await db.update(campaignRecipients).set({ status: "SENDING", attempts: sql`${campaignRecipients.attempts} + 1`, updatedAt: new Date() }).where(and(eq(campaignRecipients.id, rec.id), eq(campaignRecipients.status, "QUEUED"))).returning();
      if (!claimed.length) continue;
      const started = Date.now();
      try {
        let vars: Record<string, string | null | undefined> = {};
        if (rec.contactId) {
          const [contact] = await db.select().from(contacts).where(eq(contacts.id, rec.contactId));
          const custom = await db.select().from(contactCustomFields).where(eq(contactCustomFields.contactId, rec.contactId));
          vars = { ...contactToVariables(contact ?? { waId: rec.recipientWaId }), ...Object.fromEntries(custom.map((f) => [f.key, f.value])) };
        } else vars = { name: rec.displayName ?? "", first_name: rec.displayName?.split(" ")[0] ?? "", wa_id: rec.recipientWaId };
        const rendered = renderTemplate(bodyTemplate, { contact: vars, campaign: c.variables });
        if (rendered.missing.length) throw new Error(`Missing template variables: ${rendered.missing.join(", ")}`);
        let msg: { waMessageId: string } | null = null;
        const type = c.messageType === "template" ? (mediaBase64 ? "media" : "text") : c.messageType;
        if (type === "text") msg = await MessageService.sendText(c.sessionId, { chatId: rec.recipientWaId, text: rendered.text });
        else if (["image", "video", "audio", "document", "media"].includes(type)) {
          if (!mediaBase64 || !mediaMime) throw new Error("Campaign media missing");
          msg = await MessageService.sendMedia(c.sessionId, { chatId: rec.recipientWaId, base64: mediaBase64, mimeType: mediaMime, filename: mediaName ?? "file", caption: rendered.text || undefined });
        } else if (type === "location") { const p = c.payload as { lat: number; lng: number; name?: string }; msg = await MessageService.sendLocation(c.sessionId, { chatId: rec.recipientWaId, lat: p.lat, lng: p.lng, name: p.name }); }
        else if (type === "contact") { const p = c.payload as { contactId: string; name?: string }; msg = await MessageService.sendContact(c.sessionId, { chatId: rec.recipientWaId, contactId: p.contactId, name: p.name }); }
        else throw new Error(`Unsupported campaign message type ${type}`);
        await db.update(campaignRecipients).set({ status: "SENT", waMessageId: msg?.waMessageId ?? null, renderedBody: rendered.text, sentAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(campaignRecipients.id, rec.id));
        if (msg?.waMessageId) await db.insert(messageDeliveries).values({ id: newId(), sessionId: c.sessionId, waMessageId: msg.waMessageId, campaignId, recipientId: rec.id, chatId: rec.recipientWaId, status: "SENT", ack: 1 });
      } catch (e) {
        const message = (e as Error).message;
        const retry = rec.attempts + 1 <= s.retryCount && !/opted out|Missing template|Invalid WhatsApp ID/i.test(message);
        await db.update(campaignRecipients).set({ status: retry ? "QUEUED" : "FAILED", errorMessage: message, nextAttemptAt: retry ? new Date(Date.now() + s.retryDelayMs) : null, updatedAt: new Date() }).where(eq(campaignRecipients.id, rec.id));
        logger.warn("Campaign", `send failed: ${message}`, { campaignId, recipientId: rec.id, retry }, c.sessionId);
      }
      await this.refreshCounters(campaignId);
      const jitter = s.minDelayMs + Math.random() * Math.max(0, s.maxDelayMs - s.minDelayMs);
      const wait = Math.max(minInterval, jitter) - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    await db.update(campaignJobs).set({ status: "DONE" }).where(eq(campaignJobs.id, jobId));
    if (finished) {
      const counts = await this.refreshCounters(campaignId);
      const failed = counts.FAILED ?? 0; const sent = (counts.SENT ?? 0) + (counts.DELIVERED ?? 0) + (counts.READ ?? 0);
      const final: CampaignStatus = failed === 0 ? "COMPLETED" : sent === 0 ? "FAILED" : "PARTIAL";
      await db.update(campaigns).set({ status: final, completedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
      eventBus.publish("campaign.status", { campaignId, status: final, name: c.name, sent, failed }, { sessionId: c.sessionId });
      logger.info("Campaign", `finished ${final}`, { campaignId, sent, failed }, c.sessionId);
    }
  }

  /** Called from event bridge on message ACK to move recipient status forward (delivered/read). */
  async onAck(sessionId: string, waMessageId: string, status: string) {
    if (!["DELIVERED", "READ", "PLAYED", "FAILED"].includes(status)) return;
    const [rec] = await db.select().from(campaignRecipients).where(eq(campaignRecipients.waMessageId, waMessageId)).limit(1);
    if (!rec) return;
    const order = ["SENT", "DELIVERED", "READ"];
    const target = status === "PLAYED" ? "READ" : status;
    if (target !== "FAILED" && order.indexOf(target) <= order.indexOf(rec.status)) return;
    await db.update(campaignRecipients).set({ status: target as RecipientStatus, deliveredAt: target === "DELIVERED" ? new Date() : rec.deliveredAt, readAt: target === "READ" ? new Date() : rec.readAt, updatedAt: new Date() }).where(eq(campaignRecipients.id, rec.id));
    await db.insert(messageDeliveries).values({ id: newId(), sessionId, waMessageId, campaignId: rec.campaignId, recipientId: rec.id, chatId: rec.recipientWaId, status: target });
    await this.refreshCounters(rec.campaignId);
  }
}
const g = globalThis as typeof globalThis & { __campaignService?: CampaignService };
export const campaignService = g.__campaignService ?? (g.__campaignService = new CampaignService());
