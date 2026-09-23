import path from "node:path";
import { eq } from "drizzle-orm";
import type { Whatsapp } from "@wppconnect-team/wppconnect";
import { db } from "@/db";
import { waSessions } from "@/db/schema";
import { eventBus } from "@/lib/events";
import { logger } from "@/lib/logger";
import { ApiError, sessionNotReady } from "@/lib/api";
import { attachListeners } from "./event-bridge";

export type SessionStatus = "STOPPED" | "STARTING" | "QR" | "AUTHENTICATING" | "CONNECTED" | "READY" | "DISCONNECTED" | "ERROR";
interface Runtime {
  client: Whatsapp | null;
  status: SessionStatus;
  starting: Promise<void> | null;
  qr: string | null;
  qrAttempt: number;
  qrUpdatedAt: number | null;
  lastError: string | null;
  loading: { percent: number; message: string } | null;
  reconnectCount: number;
  lastHeartbeat: number | null;
  heartbeat: NodeJS.Timeout | null;
  detach: (() => void) | null;
  stopRequested: boolean;
}
const READY_STATES: SessionStatus[] = ["READY"];
const SESSIONS_PATH = path.resolve(process.cwd(), process.env.WPP_SESSIONS_PATH || "data/wppconnect");

/** Single registry across HMR reloads: Map<sessionId, Runtime>. Guarantees one WPPConnect client per session. */
class SessionManager {
  private runtimes = new Map<string, Runtime>();

  private rt(id: string): Runtime {
    let r = this.runtimes.get(id);
    if (!r) { r = { client: null, status: "STOPPED", starting: null, qr: null, qrAttempt: 0, qrUpdatedAt: null, lastError: null, loading: null, reconnectCount: 0, lastHeartbeat: null, heartbeat: null, detach: null, stopRequested: false }; this.runtimes.set(id, r); }
    return r;
  }
  getRuntime(id: string) { return this.rt(id); }
  getClient(id: string): Whatsapp | null { return this.runtimes.get(id)?.client ?? null; }
  getStatus(id: string): SessionStatus { return this.runtimes.get(id)?.status ?? "STOPPED"; }
  isReady(id: string) { return READY_STATES.includes(this.getStatus(id)) && !!this.getClient(id); }
  requireClient(id: string): Whatsapp {
    const c = this.getClient(id);
    if (!c || !this.isReady(id)) throw sessionNotReady();
    return c;
  }
  list() { return [...this.runtimes.entries()].map(([id, r]) => ({ id, status: r.status, hasClient: !!r.client, qrAttempt: r.qrAttempt, lastError: r.lastError, reconnectCount: r.reconnectCount, lastHeartbeat: r.lastHeartbeat, loading: r.loading })); }

  private async setStatus(id: string, status: SessionStatus, extra: Partial<typeof waSessions.$inferInsert> = {}) {
    const r = this.rt(id);
    const prev = r.status;
    r.status = status;
    const patch: Partial<typeof waSessions.$inferInsert> = { status, updatedAt: new Date(), ...extra };
    if (status === "READY" && prev !== "READY") patch.lastConnectedAt = new Date();
    if (["DISCONNECTED", "STOPPED", "ERROR"].includes(status) && ["READY", "CONNECTED"].includes(prev)) patch.lastDisconnectedAt = new Date();
    if (status !== "QR") { patch.qrCode = null; r.qr = null; }
    try { await db.update(waSessions).set(patch).where(eq(waSessions.id, id)); } catch (e) { logger.error("Database", "session status persist failed", e, {}, id); }
    eventBus.publish("session.status", { sessionId: id, status, previous: prev, lastError: r.lastError, ...extra }, { sessionId: id });
    logger.info("Session", `status ${prev} -> ${status}`, {}, id);
  }

  async start(id: string): Promise<void> {
    const r = this.rt(id);
    if (r.client && r.status === "READY") return;
    if (r.starting) return r.starting;
    r.stopRequested = false;
    r.starting = this.doStart(id).finally(() => { r.starting = null; });
    return r.starting;
  }

  private async doStart(id: string) {
    const [row] = await db.select().from(waSessions).where(eq(waSessions.id, id)).limit(1);
    if (!row) throw new ApiError("NOT_FOUND", "Session not found", 404);
    const r = this.rt(id);
    if (r.client) { await this.safeClose(id); }
    r.lastError = null; r.qr = null; r.qrAttempt = 0; r.loading = null;
    await this.setStatus(id, "STARTING", { lastError: null });
    // Import lazily so the rest of the app boots even if puppeteer/chromium is missing.
    let wpp: typeof import("@wppconnect-team/wppconnect");
    try { wpp = await import("@wppconnect-team/wppconnect"); }
    catch (e) { r.lastError = "WPPConnect module failed to load: " + (e as Error).message; await this.setStatus(id, "ERROR", { lastError: r.lastError }); throw e; }
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
    try {
      const client = await wpp.create({
        session: row.slug,
        folderNameToken: SESSIONS_PATH,
        headless: true,
        logQR: false,
        disableWelcome: true,
        updatesLog: false,
        autoClose: 0,
        waitForLogin: true,
        deviceName: process.env.NEXT_PUBLIC_APP_NAME || "WhatsApp CRM",
        puppeteerOptions: { executablePath: execPath || undefined, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] },
        browserArgs: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        catchQR: (base64Qr, _ascii, attempt) => {
          r.qr = base64Qr; r.qrAttempt = attempt; r.qrUpdatedAt = Date.now();
          void this.setStatus(id, "QR", { qrCode: base64Qr, qrAttempts: attempt, qrUpdatedAt: new Date() });
          eventBus.publish("session.qr", { sessionId: id, qr: base64Qr, attempt }, { sessionId: id });
        },
        statusFind: (status) => {
          logger.info("WPPConnect", `statusFind: ${status}`, {}, id);
          const s = String(status);
          if (s === "isLogged" || s === "inChat" || s === "chatsAvailable") void this.setStatus(id, "CONNECTED");
          else if (s === "qrReadSuccess" || s === "phoneNotConnected" || s === "waitChat") void this.setStatus(id, "AUTHENTICATING");
          else if (s === "notLogged" || s === "qrReadFail" || s === "qrReadError") { if (r.status !== "QR") void this.setStatus(id, "QR"); }
          else if (s === "desconnectedMobile" || s === "disconnectedMobile" || s === "serverClose" || s === "browserClose" || s === "autocloseCalled") {
            r.lastError = `WPPConnect: ${s}`;
            void this.setStatus(id, "DISCONNECTED", { lastError: r.lastError });
            if (!r.stopRequested && (s === "browserClose" || s === "serverClose")) this.scheduleReconnect(id);
          } else if (s === "deviceNotConnected") { r.lastError = "Phone device not connected"; void this.setStatus(id, "DISCONNECTED", { lastError: r.lastError }); }
          else if (s === "deleteToken") { void this.setStatus(id, "QR"); }
        },
        onLoadingScreen: (percent, message) => { r.loading = { percent, message }; },
      });
      r.client = client;
      r.detach = attachListeners(id, client, {
        onState: (state) => {
          const s = String(state);
          if (s === "CONNECTED") void this.markReady(id);
          else if (s === "CONFLICT") { r.lastError = "Conflict: WhatsApp Web open elsewhere (use 'Use here')"; void this.setStatus(id, "DISCONNECTED", { lastError: r.lastError }); }
          else if (s === "UNPAIRED" || s === "UNPAIRED_IDLE") { r.lastError = "Device unpaired"; void this.setStatus(id, "DISCONNECTED", { lastError: r.lastError }); }
          else if (s === "UNLAUNCHED" || s === "OPENING" || s === "PAIRING") void this.setStatus(id, "AUTHENTICATING");
          else if (s === "TIMEOUT" || s === "PROXYBLOCK" || s === "TOS_BLOCK" || s === "SMB_TOS_BLOCK") { r.lastError = `Connection state ${s}`; void this.setStatus(id, "DISCONNECTED", { lastError: r.lastError }); }
        },
      });
      await this.markReady(id);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      r.lastError = msg;
      logger.error("Session", "start failed", e, {}, id);
      await this.setStatus(id, "ERROR", { lastError: msg });
      throw new ApiError("SESSION_START_FAILED", msg.includes("Could not find") || msg.includes("executable") ? "Chromium/Chrome not available. Install Chrome or set PUPPETEER_EXECUTABLE_PATH." : msg, 500);
    }
  }

  private async markReady(id: string) {
    const r = this.rt(id);
    const c = r.client; if (!c) return;
    try {
      const [host, wid, waVersion] = await Promise.all([c.getHostDevice().catch(() => null), c.getWid().catch(() => null), c.getWAVersion().catch(() => null)]);
      const h = host as unknown as Record<string, unknown> | null;
      const phone = (h?.wid as { user?: string } | undefined)?.user ?? (typeof wid === "string" ? wid.split("@")[0] : null);
      const profileName = (h?.pushname as string | undefined) ?? null;
      const platform = (h?.platform as string | undefined) ?? null;
      let pic: string | null = null;
      if (wid) { try { const p = await c.getProfilePicFromServer(wid); pic = (p as unknown as { eurl?: string; imgFull?: string })?.imgFull ?? (p as unknown as { eurl?: string })?.eurl ?? null; } catch { /* no picture */ } }
      await this.setStatus(id, "READY", { phoneNumber: phone ?? null, wid: wid ?? null, profileName, platform, waVersion: waVersion ?? null, profilePicUrl: pic, lastError: null, lastHeartbeatAt: new Date() });
      this.startHeartbeat(id);
      // Initial sync in background (contacts, chats, groups, recent messages)
      const { syncSession } = await import("../services/sync.service");
      syncSession(id).catch((e) => logger.error("Session", "initial sync failed", e, {}, id));
      const { automationService } = await import("../services/automation.service");
      automationService.ensureStarted();
    } catch (e) { logger.error("Session", "markReady failed", e, {}, id); }
  }

  private startHeartbeat(id: string) {
    const r = this.rt(id);
    if (r.heartbeat) clearInterval(r.heartbeat);
    r.heartbeat = setInterval(async () => {
      const c = r.client; if (!c) return;
      try {
        const connected = await c.isConnected();
        r.lastHeartbeat = Date.now();
        let battery: number | null = null;
        try { battery = await c.getBatteryLevel(); } catch { /* unsupported on MD */ }
        await db.update(waSessions).set({ lastHeartbeatAt: new Date(), batteryLevel: battery ?? undefined }).where(eq(waSessions.id, id));
        if (!connected && r.status === "READY") { r.lastError = "Heartbeat: not connected"; await this.setStatus(id, "DISCONNECTED", { lastError: r.lastError }); }
        else if (connected && r.status === "DISCONNECTED") { r.lastError = null; await this.setStatus(id, "READY", { lastError: null }); }
      } catch (e) { logger.warn("Session", "heartbeat failed: " + (e as Error).message, {}, id); }
    }, 30_000);
  }

  private scheduleReconnect(id: string) {
    const r = this.rt(id);
    if (r.reconnectCount >= 5) { logger.warn("Session", "max reconnect attempts reached", {}, id); return; }
    r.reconnectCount++;
    db.update(waSessions).set({ reconnectCount: r.reconnectCount }).where(eq(waSessions.id, id)).catch(() => {});
    const delay = Math.min(60_000, 5_000 * r.reconnectCount);
    logger.info("Session", `reconnect scheduled in ${delay}ms (attempt ${r.reconnectCount})`, {}, id);
    setTimeout(() => { if (!r.stopRequested) this.start(id).catch(() => {}); }, delay);
  }

  private async safeClose(id: string) {
    const r = this.rt(id);
    if (r.heartbeat) { clearInterval(r.heartbeat); r.heartbeat = null; }
    r.detach?.(); r.detach = null;
    const c = r.client; r.client = null;
    if (c) { try { await Promise.race([c.close(), new Promise((res) => setTimeout(res, 10_000))]); } catch (e) { logger.warn("Session", "close error: " + (e as Error).message, {}, id); } }
  }
  async stop(id: string) { const r = this.rt(id); r.stopRequested = true; await this.safeClose(id); await this.setStatus(id, "STOPPED"); }
  async restart(id: string) { await this.stop(id); this.rt(id).reconnectCount = 0; await this.start(id); }
  async logout(id: string) {
    const r = this.rt(id); r.stopRequested = true;
    const c = r.client;
    if (c) { try { await c.logout(); } catch (e) { logger.warn("Session", "logout error: " + (e as Error).message, {}, id); } }
    await this.safeClose(id);
    await this.setStatus(id, "STOPPED", { phoneNumber: null, wid: null, profileName: null, profilePicUrl: null });
    // Remove persisted token so the next start shows a fresh QR.
    try { const fs = await import("node:fs/promises"); const [row] = await db.select().from(waSessions).where(eq(waSessions.id, id)); if (row) await fs.rm(path.join(SESSIONS_PATH, row.slug), { recursive: true, force: true }); } catch { /* ignore */ }
  }
  async destroy(id: string) { await this.logout(id); this.runtimes.delete(id); }
  async refreshQr(id: string) {
    const r = this.rt(id);
    if (r.status === "QR" && r.client) { try { const q = await r.client.getQrCode(); if (q?.base64Image) { r.qr = q.base64Image; r.qrUpdatedAt = Date.now(); return r.qr; } } catch { /* fallthrough */ } }
    if (["STOPPED", "ERROR", "DISCONNECTED"].includes(r.status)) { await this.restart(id); }
    return r.qr;
  }

  /** Restore sessions with autoStart=true on server boot; never duplicates clients. */
  async restoreAll() {
    const rows = await db.select().from(waSessions).where(eq(waSessions.autoStart, true));
    for (const row of rows) {
      if (this.runtimes.get(row.id)?.client) continue;
      await db.update(waSessions).set({ status: "STOPPED" }).where(eq(waSessions.id, row.id));
      this.start(row.id).catch((e) => logger.error("Session", "restore failed", e, {}, row.id));
    }
    // mark non-autostart sessions as stopped in DB (stale state from previous process)
    const all = await db.select({ id: waSessions.id, autoStart: waSessions.autoStart }).from(waSessions);
    for (const s of all) if (!s.autoStart && !this.runtimes.get(s.id)?.client) await db.update(waSessions).set({ status: "STOPPED", qrCode: null }).where(eq(waSessions.id, s.id));
  }
}
const g = globalThis as typeof globalThis & { __sessionManager?: SessionManager };
export const sessionManager = g.__sessionManager ?? (g.__sessionManager = new SessionManager());
