import { createHmac } from "node:crypto";
import { and, eq, lte, or, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { eventBus, type AppEvent } from "@/lib/events";
import { logger } from "@/lib/logger";
import { newId, ApiError } from "@/lib/api";
import dns from "node:dns/promises";
import net from "node:net";

export const WEBHOOK_EVENTS = ["message.received", "message.sent", "message.delivered", "message.read", "message.failed", "message.edited", "message.deleted", "reaction.received", "session.status", "contact.updated", "group.updated", "campaign.status"] as const;

/** SSRF protection: reject private/loopback/link-local targets unless explicitly allowed. */
export async function assertSafeUrl(url: string) {
  let u: URL; try { u = new URL(url); } catch { throw new ApiError("INVALID_URL", "Invalid webhook URL", 422); }
  if (!["http:", "https:"].includes(u.protocol)) throw new ApiError("INVALID_URL", "Only http/https webhooks are allowed", 422);
  if (process.env.WEBHOOK_ALLOW_PRIVATE === "true") return;
  const host = u.hostname;
  const isPrivate = (ip: string) => {
    if (net.isIPv6(ip)) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  };
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new ApiError("SSRF_BLOCKED", "Webhook URL targets a private network", 422);
  if (net.isIP(host)) { if (isPrivate(host)) throw new ApiError("SSRF_BLOCKED", "Webhook URL targets a private network", 422); return; }
  try { const addrs = await dns.lookup(host, { all: true }); if (addrs.some((a) => isPrivate(a.address))) throw new ApiError("SSRF_BLOCKED", "Webhook URL resolves to a private network", 422); }
  catch (e) { if (e instanceof ApiError) throw e; throw new ApiError("INVALID_URL", "Webhook host could not be resolved", 422); }
}

class WebhookService {
  private started = false; private timer: NodeJS.Timeout | null = null;
  ensureStarted() {
    if (this.started) return; this.started = true;
    eventBus.subscribeAll((e) => { if ((WEBHOOK_EVENTS as readonly string[]).includes(e.event)) this.enqueue(e).catch((err) => logger.error("Webhook", "enqueue failed", err)); });
    this.timer = setInterval(() => this.processDue().catch((e) => logger.error("Webhook", "process failed", e)), 4000); this.timer.unref?.();
    logger.info("Webhook", "dispatcher started");
  }
  private async enqueue(e: AppEvent) {
    const hooks = await db.select().from(webhooks).where(eq(webhooks.enabled, true));
    for (const h of hooks) {
      if (h.events.length && !h.events.includes(e.event)) continue;
      if (h.sessionIds.length && e.sessionId && !h.sessionIds.includes(e.sessionId)) continue;
      const payload = { event: e.event, timestamp: e.timestamp, sessionId: e.sessionId, chatId: e.chatId, contact: (e.data as { senderId?: string })?.senderId ?? null, message: e.event.startsWith("message.") ? e.data : null, metadata: e.data };
      await db.insert(webhookDeliveries).values({ id: newId(), webhookId: h.id, event: e.event, payload, status: "PENDING", nextAttemptAt: new Date() });
    }
  }
  private async processDue() {
    const due = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.status, "PENDING"), or(isNull(webhookDeliveries.nextAttemptAt), lte(webhookDeliveries.nextAttemptAt, new Date())))).limit(20);
    await Promise.all(due.map((d) => this.deliver(d.id)));
  }
  sign(secret: string, body: string, ts: string) { return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex"); }
  async deliver(deliveryId: string) {
    const [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)); if (!d) return;
    const [h] = await db.select().from(webhooks).where(eq(webhooks.id, d.webhookId)); if (!h) { await db.update(webhookDeliveries).set({ status: "FAILED", error: "Webhook deleted" }).where(eq(webhookDeliveries.id, d.id)); return; }
    const body = JSON.stringify(d.payload); const ts = Date.now().toString();
    const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "WhatsAppCRM-Webhook/1.0", "x-webhook-event": d.event, "x-webhook-timestamp": ts, "x-webhook-delivery": d.id, ...h.headers };
    if (h.secret) headers["x-webhook-signature"] = `sha256=${this.sign(h.secret, body, ts)}`;
    const start = Date.now(); const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), h.timeoutMs);
    const attempts = d.attempts + 1;
    try {
      await assertSafeUrl(h.url);
      const res = await fetch(h.url, { method: "POST", headers, body, signal: ctrl.signal, redirect: "manual" });
      const text = (await res.text()).slice(0, 2000);
      const success = res.status >= 200 && res.status < 300;
      await db.update(webhookDeliveries).set({ status: success ? "SUCCESS" : attempts > h.retryCount ? "FAILED" : "PENDING", attempts, responseStatus: res.status, responseBody: text, error: success ? null : `HTTP ${res.status}`, durationMs: Date.now() - start, nextAttemptAt: success ? null : new Date(Date.now() + Math.min(300_000, 5000 * 2 ** attempts)), updatedAt: new Date() }).where(eq(webhookDeliveries.id, d.id));
      eventBus.publish("webhook.delivered", { deliveryId: d.id, webhookId: h.id, success, status: res.status });
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? `Timeout after ${h.timeoutMs}ms` : (e as Error).message;
      await db.update(webhookDeliveries).set({ status: attempts > h.retryCount ? "FAILED" : "PENDING", attempts, error: msg, durationMs: Date.now() - start, nextAttemptAt: new Date(Date.now() + Math.min(300_000, 5000 * 2 ** attempts)), updatedAt: new Date() }).where(eq(webhookDeliveries.id, d.id));
      logger.warn("Webhook", `delivery failed: ${msg}`, { webhookId: h.id, attempts });
    } finally { clearTimeout(to); }
  }
  async retry(deliveryId: string) { await db.update(webhookDeliveries).set({ status: "PENDING", nextAttemptAt: new Date(), attempts: 0 }).where(eq(webhookDeliveries.id, deliveryId)); await this.deliver(deliveryId); }
  async test(webhookId: string) {
    const id = newId();
    await db.insert(webhookDeliveries).values({ id, webhookId, event: "webhook.test", payload: { event: "webhook.test", timestamp: new Date().toISOString(), sessionId: null, chatId: null, contact: null, message: null, metadata: { hello: "world" } }, status: "PENDING" });
    await this.deliver(id);
    const [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
    return d;
  }
  async stats(webhookId: string) {
    const rows = await db.select({ status: webhookDeliveries.status, n: sql<number>`count(*)::int` }).from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, webhookId)).groupBy(webhookDeliveries.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
}
const g = globalThis as typeof globalThis & { __webhookService?: WebhookService };
export const webhookService = g.__webhookService ?? (g.__webhookService = new WebhookService());
