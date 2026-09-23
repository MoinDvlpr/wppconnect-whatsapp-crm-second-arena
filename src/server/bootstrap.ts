import { sql } from "drizzle-orm";
import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { logger } from "@/lib/logger";
import { ensureAdminUser } from "@/lib/auth";
import { eventBus } from "@/lib/events";
import { runCapabilityAudit } from "./wpp/capability-registry";

const g = globalThis as typeof globalThis & { __bootstrapped?: Promise<void> };
/** Idempotent server bootstrap: admin user, capability audit, workers, session restore. */
export function bootstrap(): Promise<void> {
  if (g.__bootstrapped) return g.__bootstrapped;
  g.__bootstrapped = (async () => {
    try { await db.execute(sql`select 1`); } catch (e) { logger.error("Database", "database unreachable at bootstrap", e); return; }
    await ensureAdminUser().catch((e) => logger.error("System", "admin bootstrap failed", e));
    try { const audit = runCapabilityAudit(); logger.info("System", `WPPConnect ${audit.version} capability audit: mapped=${audit.mapped} deprecated=${audit.deprecated} unsupported=${audit.unsupportedByVersion} unmapped=${audit.unmapped}`, { unmapped: audit.unmappedMethods, unsupported: audit.unsupportedMethods }); }
    catch (e) { logger.error("System", "capability audit failed", e); }
    // Event monitor persistence (bounded via retention cleanup)
    eventBus.subscribeAll((e) => { if (e.event === "system.log" || e.event === "typing" || e.event === "presence.changed") return; db.insert(eventLog).values({ event: e.event, sessionId: e.sessionId ?? null, payload: e.data as object }).catch(() => {}); });
    const { webhookService } = await import("./services/webhook.service"); webhookService.ensureStarted();
    const { campaignService } = await import("./services/campaign.service"); campaignService.ensureStarted();
    const { automationService } = await import("./services/automation.service"); automationService.ensureStarted();
    if (process.env.WPP_AUTO_RESTORE !== "false") {
      const { sessionManager } = await import("./wpp/session-manager");
      sessionManager.restoreAll().catch((e) => logger.error("Session", "restore failed", e));
    }
    const retention = async () => {
      try {
        const { getSetting } = await import("./services/settings.service");
        const logDays = Number(await getSetting("logs.retentionDays", 14)); const mediaDays = Number(await getSetting("storage.mediaRetentionDays", 30));
        await db.execute(sql`delete from event_log where created_at < now() - interval '3 days'`);
        await db.execute(sql`delete from system_logs where created_at < now() - (${logDays} || ' days')::interval`);
        const { messageMedia } = await import("@/db/schema"); const { storage } = await import("@/lib/storage"); const { lt } = await import("drizzle-orm");
        const old = await db.select().from(messageMedia).where(lt(messageMedia.createdAt, new Date(Date.now() - mediaDays * 86400_000))).limit(500);
        for (const m of old) { await storage.delete(m.storagePath).catch(() => {}); await db.delete(messageMedia).where(sql`${messageMedia.id} = ${m.id}`); }
        if (old.length) logger.info("System", `retention: removed ${old.length} cached media files`);
      } catch (e) { logger.warn("System", "retention job failed: " + (e as Error).message); }
    };
    const t = setInterval(retention, 6 * 3600_000); t.unref?.(); setTimeout(retention, 60_000).unref?.();
    logger.info("System", "bootstrap complete");
  })();
  return g.__bootstrapped;
}
