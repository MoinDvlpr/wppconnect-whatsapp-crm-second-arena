import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  "general.appName": process.env.NEXT_PUBLIC_APP_NAME || "WhatsApp CRM", "general.timezone": process.env.DEFAULT_TIMEZONE || "Asia/Kolkata", "general.dateFormat": "dd MMM yyyy HH:mm",
  "session.autoRestore": true, "session.defaultSessionId": "",
  "messaging.typingSimulation": true, "messaging.markSeenOnOpen": true,
  "campaign.messagesPerMinute": 20, "campaign.minDelayMs": 2000, "campaign.maxDelayMs": 6000, "campaign.maxSize": 5000, "campaign.retryCount": 2, "campaign.retryDelayMs": 30000, "campaign.skipOptedOut": true,
  "template.missingVariableBehavior": "fail",
  "webhook.timeoutMs": 10000, "webhook.retryCount": 3,
  "storage.mediaCache": true, "storage.mediaRetentionDays": 30,
  "security.sessionTtlDays": 7, "security.apiRateLimitPerMinute": 120,
  "logs.retentionDays": 14, "logs.level": process.env.LOG_LEVEL || "info",
  "automation.optOutKeywords": "STOP,UNSUBSCRIBE", "automation.optInKeywords": "START,SUBSCRIBE",
};
const cache = new Map<string, { v: unknown; t: number }>();
export async function getSetting<T = unknown>(key: string, fallback?: T): Promise<T> {
  const c = cache.get(key); if (c && Date.now() - c.t < 10_000) return c.v as T;
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  const v = row ? row.value : (fallback ?? DEFAULT_SETTINGS[key]);
  cache.set(key, { v, t: Date.now() });
  return v as T;
}
export async function getAllSettings() {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
export async function setSettings(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    await db.insert(settings).values({ key, value: value as object }).onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedAt: new Date() } });
    cache.delete(key);
  }
}
