import { db } from "@/db";
import { systemLogs } from "@/db/schema";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type LogSource = "WPPConnect" | "Session" | "Campaign" | "Webhook" | "Database" | "API" | "System" | "Automation" | "Queue";
const LEVELS: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const minLevel = LEVELS[((process.env.LOG_LEVEL || "info").toUpperCase() as LogLevel)] ?? 20;

interface LogEntry { level: LogLevel; source: LogSource; message: string; sessionId?: string | null; stack?: string; metadata?: Record<string, unknown>; }
const buffer: LogEntry[] = [];
let flushing = false;
async function flush() {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, 100);
  try {
    await db.insert(systemLogs).values(batch.map((b) => ({ level: b.level, source: b.source, message: b.message, sessionId: b.sessionId ?? null, stack: b.stack ?? null, metadata: b.metadata ?? null })));
  } catch (e) { console.error("[logger] persist failed", (e as Error).message); }
  finally { flushing = false; if (buffer.length) setTimeout(flush, 200); }
}
function write(e: LogEntry) {
  if (LEVELS[e.level] < minLevel) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), ...e });
  if (e.level === "ERROR") console.error(line); else if (e.level === "WARN") console.warn(line); else console.log(line);
  if (e.level !== "DEBUG") { buffer.push(e); setTimeout(flush, 50); }
}
export const logger = {
  debug: (source: LogSource, message: string, meta?: Record<string, unknown>, sessionId?: string | null) => write({ level: "DEBUG", source, message, metadata: meta, sessionId }),
  info: (source: LogSource, message: string, meta?: Record<string, unknown>, sessionId?: string | null) => write({ level: "INFO", source, message, metadata: meta, sessionId }),
  warn: (source: LogSource, message: string, meta?: Record<string, unknown>, sessionId?: string | null) => write({ level: "WARN", source, message, metadata: meta, sessionId }),
  error: (source: LogSource, message: string, err?: unknown, meta?: Record<string, unknown>, sessionId?: string | null) =>
    write({ level: "ERROR", source, message, metadata: { ...meta, error: err instanceof Error ? err.message : err ? String(err) : undefined }, stack: err instanceof Error ? err.stack : undefined, sessionId }),
};
/** Structured timing wrapper for WPPConnect operations (does not log message content). */
export async function timed<T>(sessionId: string, method: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
  const start = Date.now();
  try { const r = await fn(); logger.debug("WPPConnect", method, { ...meta, durationMs: Date.now() - start, result: "ok" }, sessionId); return r; }
  catch (e) { logger.error("WPPConnect", `${method} failed`, e, { ...meta, durationMs: Date.now() - start }, sessionId); throw e; }
}
