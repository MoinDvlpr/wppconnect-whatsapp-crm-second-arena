"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Power, LogOut, Trash2, QrCode, Inbox, Settings2, Play, Square, Battery, Activity, ScrollText } from "lucide-react";
import { api, useApi, useRealtime, fmtDate } from "@/lib/client/api";
import { useShell, type SessionRow } from "@/components/shell";
import { Avatar, Badge, Confirm, Empty, Field, Modal, PageHeader, Spinner, StatusBadge, useToast, Table } from "@/components/ui";

export default function SessionsPage() {
  const { sessions, reloadSessions, can } = useShell(); const toast = useToast();
  const [create, setCreate] = useState(false); const [name, setName] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<SessionRow | null>(null); const [del, setDel] = useState<SessionRow | null>(null); const [diag, setDiag] = useState<SessionRow | null>(null); const [settings, setSettings] = useState<SessionRow | null>(null);
  useRealtime((e) => { if (e.event === "session.status") reloadSessions(); }, [reloadSessions]);
  const act = async (s: SessionRow, action: string) => { setBusy(s.id + action); try { await api(`sessions/${s.id}/${action}`, { method: "POST" }); toast.success(`${action} requested for ${s.name}`); if (action === "start" || action === "restart") setQrFor(s); reloadSessions(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); } };
  const doCreate = async () => { setBusy("create"); try { const s = await api<SessionRow>("sessions", { method: "POST", json: { name } }); setCreate(false); setName(""); reloadSessions(); setQrFor(s); toast.success("Session created – starting WPPConnect client"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); } };
  return <div>
    <PageHeader title="WhatsApp Sessions" subtitle="Each session is an independent WPPConnect client linked to one WhatsApp account." actions={can("ADMIN") && <button className="btn-primary" onClick={() => setCreate(true)}><Plus size={16} /> New session</button>} />
    {sessions.length === 0 ? <Empty icon={<QrCode size={40} />} title="No sessions yet" text="Create a session, then scan the QR code with WhatsApp → Linked devices." action={can("ADMIN") && <button className="btn-primary" onClick={() => setCreate(true)}><Plus size={16} /> Create session</button>} /> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sessions.map((s) => <div key={s.id} className="card flex flex-col p-4">
        <div className="flex items-start gap-3"><Avatar src={s.profilePicUrl} name={s.profileName ?? s.name} size={48} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold">{s.name}</h3><StatusBadge status={s.status} /></div><p className="truncate text-sm text-muted">{s.phoneNumber ? `+${s.phoneNumber}` : "Not linked"}{s.profileName ? ` · ${s.profileName}` : ""}</p><p className="text-[11px] text-muted">slug: {s.slug}{s.platform ? ` · ${s.platform}` : ""}{s.waVersion ? ` · WA ${s.waVersion}` : ""}</p></div></div>
        {s.loading && s.status !== "READY" && <div className="mt-3"><div className="h-1.5 w-full overflow-hidden rounded bg-surface-2"><div className="h-full bg-primary transition-all" style={{ width: `${s.loading.percent}%` }} /></div><p className="mt-1 text-[11px] text-muted">{s.loading.message}</p></div>}
        {s.lastError && <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-600 dark:text-red-300">{s.lastError}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted"><dt>Connected</dt><dd className="text-right text-text">{fmtDate(s.lastConnectedAt)}</dd><dt>Disconnected</dt><dd className="text-right text-text">{fmtDate(s.lastDisconnectedAt)}</dd><dt>Heartbeat</dt><dd className="text-right text-text">{fmtDate(s.lastHeartbeatAt)}</dd><dt>Reconnects</dt><dd className="text-right text-text">{s.reconnectCount}</dd>{s.batteryLevel !== null && <><dt className="flex items-center gap-1"><Battery size={11} /> Battery</dt><dd className="text-right text-text">{s.batteryLevel}%</dd></>}</dl>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Link href="/inbox" className="btn-primary py-1.5"><Inbox size={14} /> Inbox</Link>
          {["QR", "STARTING", "AUTHENTICATING"].includes(s.status) && <button className="btn-secondary py-1.5" onClick={() => setQrFor(s)}><QrCode size={14} /> QR</button>}
          {["STOPPED", "ERROR", "DISCONNECTED"].includes(s.status) ? <button className="btn-secondary py-1.5" disabled={!!busy} onClick={() => act(s, "start")}><Play size={14} /> Start</button> : <button className="btn-secondary py-1.5" disabled={!!busy} onClick={() => act(s, "stop")}><Square size={14} /> Stop</button>}
          <button className="btn-secondary py-1.5" disabled={!!busy} onClick={() => act(s, "restart")}>{busy === s.id + "restart" ? <Spinner /> : <RefreshCw size={14} />} Restart</button>
          <button className="btn-secondary py-1.5" disabled={!!busy || s.status === "STOPPED"} onClick={() => act(s, "logout")}><LogOut size={14} /> Logout</button>
          <button className="btn-secondary py-1.5" onClick={() => setDiag(s)}><Activity size={14} /> Diagnostics</button>
          {can("ADMIN") && <button className="btn-secondary py-1.5" onClick={() => setSettings(s)}><Settings2 size={14} /></button>}
          {can("ADMIN") && <button className="btn-ghost py-1.5 text-red-500" onClick={() => setDel(s)}><Trash2 size={14} /></button>}
        </div>
      </div>)}</div>}
    <Modal open={create} onClose={() => setCreate(false)} title="Create WhatsApp session" footer={<><button className="btn-secondary" onClick={() => setCreate(false)}>Cancel</button><button className="btn-primary" disabled={!name.trim() || busy === "create"} onClick={doCreate}>{busy === "create" && <Spinner />}Create & start</button></>}>
      <Field label="Session name" hint="e.g. Sales, Support. A headless Chromium will be launched for this session."><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    </Modal>
    <QrDialog session={qrFor} onClose={() => setQrFor(null)} />
    <DiagnosticsDialog session={diag} onClose={() => setDiag(null)} />
    <SessionSettings session={settings} onClose={() => setSettings(null)} />
    <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete session" text={`Delete "${del?.name}" including its cached chats, contacts and messages? The WhatsApp link will be removed.`} onConfirm={async () => { if (!del) return; await api(`sessions/${del.id}`, { method: "DELETE" }); reloadSessions(); toast.success("Session deleted"); }} />
  </div>;
}

export function QrDialog({ session, onClose }: { session: SessionRow | null; onClose: () => void }) {
  const [state, setState] = useState<{ qr: string | null; status: string; attempt: number; expired: boolean } | null>(null); const [busy, setBusy] = useState(false); const toast = useToast();
  const load = async () => { if (!session) return; try { setState(await api(`sessions/${session.id}/qr`)); } catch { /* ignore */ } };
  useEffect(() => { setState(null); if (!session) return; load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime((e) => { if (session && e.sessionId === session.id && (e.event === "session.qr" || e.event === "session.status")) load(); }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => { if (!session) return; setBusy(true); try { await api(`sessions/${session.id}/qr/refresh`, { method: "POST" }); await load(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const s = state?.status ?? session?.status ?? "";
  return <Modal open={!!session} onClose={onClose} title={`Link WhatsApp · ${session?.name ?? ""}`} width="max-w-md">
    <div className="flex flex-col items-center gap-3 text-center">
      <StatusBadge status={s} />
      {s === "READY" || s === "CONNECTED" ? <div className="py-8"><p className="text-lg font-semibold text-green-600">Connected!</p><p className="text-sm text-muted">Syncing chats and contacts…</p></div>
        : state?.qr ? <><img src={state.qr} alt="QR code" className={`h-64 w-64 rounded-lg bg-white p-2 ${state.expired ? "opacity-30" : ""}`} />{state.expired && <p className="text-sm text-amber-600">QR expired – refresh to get a new one.</p>}<p className="text-xs text-muted">Attempt {state.attempt}. Open WhatsApp → Linked devices → Link a device.</p></>
        : s === "ERROR" ? <p className="py-8 text-sm text-red-600">{session?.lastError ?? "Session failed to start"}</p>
        : <div className="flex flex-col items-center gap-2 py-12"><Spinner /><p className="text-sm text-muted">{s === "STOPPED" ? "Session is stopped." : "Starting browser and waiting for QR…"}</p></div>}
      <button className="btn-secondary" onClick={refresh} disabled={busy}>{busy ? <Spinner /> : <RefreshCw size={14} />} {["STOPPED", "ERROR", "DISCONNECTED"].includes(s) ? "Start & get QR" : "Refresh QR"}</button>
    </div></Modal>;
}

function DiagnosticsDialog({ session, onClose }: { session: SessionRow | null; onClose: () => void }) {
  const { data, loading, reload } = useApi<Record<string, unknown>>(session ? `sessions/${session.id}/diagnostics` : null, [session?.id]);
  const { data: logs } = useApi<{ id: number; level: string; message: string; createdAt: string }[]>(session ? `sessions/${session.id}/logs?limit=30` : null, [session?.id]);
  return <Modal open={!!session} onClose={onClose} title={`Diagnostics · ${session?.name ?? ""}`} width="max-w-2xl">
    {loading ? <Spinner /> : <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{Object.entries(data ?? {}).map(([k, v]) => <div key={k} className="rounded-lg bg-surface-2 p-2"><p className="text-muted">{k}</p><p className="truncate font-mono" title={JSON.stringify(v)}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</p></div>)}</div>}
    <div className="mt-3 flex items-center justify-between"><h4 className="flex items-center gap-1 text-sm font-semibold"><ScrollText size={14} /> Recent session logs</h4><button className="btn-ghost py-1 text-xs" onClick={() => reload()}>Refresh</button></div>
    <div className="mt-1 max-h-60 overflow-y-auto rounded-lg border border-border font-mono text-[11px]">{(logs ?? []).map((l) => <div key={l.id} className="flex gap-2 border-b border-border px-2 py-1"><span className="text-muted">{new Date(l.createdAt).toLocaleTimeString()}</span><Badge color={l.level === "ERROR" ? "red" : l.level === "WARN" ? "yellow" : "gray"}>{l.level}</Badge><span className="break-all">{l.message}</span></div>)}</div>
  </Modal>;
}
function SessionSettings({ session, onClose }: { session: SessionRow | null; onClose: () => void }) {
  const { reloadSessions } = useShell(); const toast = useToast(); const [name, setName] = useState(""); const [auto, setAuto] = useState(true); const [presence, setPresence] = useState(true);
  useEffect(() => { if (session) { setName(session.name); setAuto(session.autoStart); } }, [session]);
  return <Modal open={!!session} onClose={onClose} title="Session settings" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={async () => { if (!session) return; try { await api(`sessions/${session.id}`, { method: "PATCH", json: { name, autoStart: auto } }); reloadSessions(); toast.success("Saved"); onClose(); } catch (e) { toast.error((e as Error).message); } }}>Save</button></>}>
    <div className="space-y-3"><Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-start on server boot</label>
      <div className="flex items-center justify-between rounded-lg border border-border p-2 text-sm"><span>Online presence</span><div className="flex gap-1"><button className={`btn-secondary py-1 ${presence ? "border-primary" : ""}`} onClick={async () => { setPresence(true); await api(`sessions/${session!.id}/presence`, { method: "POST", json: { online: true } }).catch((e) => toast.error(e.message)); }}>Online</button><button className={`btn-secondary py-1 ${!presence ? "border-primary" : ""}`} onClick={async () => { setPresence(false); await api(`sessions/${session!.id}/presence`, { method: "POST", json: { online: false } }).catch((e) => toast.error(e.message)); }}>Offline</button></div></div>
      <button className="btn-secondary w-full" onClick={async () => { try { await api(`sessions/${session!.id}/sync`, { method: "POST" }); toast.success("Sync started"); } catch (e) { toast.error((e as Error).message); } }}><RefreshCw size={14} /> Force resync contacts/chats</button>
      <button className="btn-secondary w-full" onClick={async () => { try { await api(`sessions/${session!.id}/use-here`, { method: "POST" }); toast.success("Requested takeover"); } catch (e) { toast.error((e as Error).message); } }}><Power size={14} /> Use WhatsApp here (resolve conflict)</button>
    </div></Modal>;
}
void Table;
