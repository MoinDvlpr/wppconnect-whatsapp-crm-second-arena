"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ApiErrorShape { code: string; message: string; details?: unknown }
export class ClientApiError extends Error { constructor(public code: string, message: string, public status: number, public details?: unknown) { super(message); } }

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path.startsWith("/") ? path : `/api/v1/${path}`, { ...rest, headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers || {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body, credentials: "same-origin" });
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) { if (!res.ok) throw new ClientApiError("HTTP_" + res.status, res.statusText, res.status); return (await res.blob()) as unknown as T; }
  const body = await res.json();
  if (!res.ok || body.success === false) { const e = body.error as ApiErrorShape | undefined; if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.href = `/login?next=${encodeURIComponent(location.pathname)}`; throw new ClientApiError(e?.code ?? "ERROR", e?.message ?? "Request failed", res.status, e?.details); }
  return body.data as T;
}

export function useApi<T>(path: string | null, deps: unknown[] = [], opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path); pathRef.current = path;
  const reload = useCallback(async (silent = false) => {
    if (!pathRef.current) { setData(null); setLoading(false); return; }
    if (!silent) setLoading(true);
    try { setData(await api<T>(pathRef.current)); setError(null); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [path, ...deps]);
  useEffect(() => { if (!opts.refreshMs) return; const t = setInterval(() => reload(true), opts.refreshMs); return () => clearInterval(t); }, [opts.refreshMs, reload]);
  return { data, error, loading, reload, setData };
}

export interface RealtimeEvent<T = unknown> { event: string; timestamp: string; sessionId: string | null; chatId: string | null; data: T }
type Listener = (e: RealtimeEvent) => void;
const listeners = new Set<Listener>(); let es: EventSource | null = null; let connected = false; const statusListeners = new Set<(c: boolean) => void>();
function ensureStream() {
  if (es || typeof window === "undefined") return;
  es = new EventSource("/api/events");
  es.onopen = () => { connected = true; statusListeners.forEach((l) => l(true)); };
  es.onerror = () => { connected = false; statusListeners.forEach((l) => l(false)); es?.close(); es = null; setTimeout(ensureStream, 3000); };
  es.onmessage = (m) => { try { const e = JSON.parse(m.data) as RealtimeEvent; listeners.forEach((l) => l(e)); } catch { /* ignore */ } };
  const names = ["message.received", "message.sent", "message.delivered", "message.read", "message.failed", "message.edited", "message.deleted", "reaction.received", "presence.changed", "typing", "chat.updated", "contact.updated", "group.updated", "session.status", "session.qr", "campaign.status", "campaign.progress", "webhook.delivered", "system.log"];
  for (const n of names) es.addEventListener(n, (m) => { try { const e = JSON.parse((m as MessageEvent).data) as RealtimeEvent; listeners.forEach((l) => l(e)); } catch { /* ignore */ } });
}
export function useRealtime(handler: Listener, deps: unknown[] = []) {
  useEffect(() => { ensureStream(); listeners.add(handler); return () => { listeners.delete(handler); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
export function useRealtimeStatus() { const [c, setC] = useState(connected); useEffect(() => { ensureStream(); statusListeners.add(setC); return () => { statusListeners.delete(setC); }; }, []); return c; }

export function fmtTime(ts: number | string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }) {
  if (!ts) return ""; const d = typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts); return d.toLocaleTimeString([], opts);
}
export function fmtDate(ts: number | string | Date | null | undefined) { if (!ts) return "—"; const d = typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts); return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
export function relTime(ts: number | string | Date | null | undefined) {
  if (!ts) return ""; const d = typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts); const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "now"; if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`; if (diff < 86400_000) return fmtTime(d); if (diff < 7 * 86400_000) return d.toLocaleDateString([], { weekday: "short" }); return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}
export function fmtBytes(n?: number | null) { if (!n) return ""; if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`; return `${(n / 1048576).toFixed(1)} MB`; }
export function fileToBase64(file: File): Promise<string> { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); }); }
