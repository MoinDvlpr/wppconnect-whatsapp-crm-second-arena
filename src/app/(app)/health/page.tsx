"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import { fmtDate, useApi } from "@/lib/client/api";
import { Badge, ErrorBox, PageHeader, Skeleton, StatusBadge } from "@/components/ui";

interface Health { ok: boolean; checks: Record<string, boolean>; wppVersion: string; node: string; uptime: number; memory: number; sessions: { id: string; name: string; status: string; lastHeartbeatAt: string | null; lastError: string | null; reconnectCount: number }[]; runtime: { id: string; status: string; hasClient: boolean; qrAttempt: number; lastError: string | null; reconnectCount: number; lastHeartbeat: number | null }[]; queue: Record<string, number>; pendingWebhooks: number }
export default function HealthPage() {
  const { data, loading, error, reload } = useApi<Health>("health", [], { refreshMs: 10000 });
  if (error) return <ErrorBox error={error} retry={() => reload()} />; if (loading || !data) return <Skeleton />;
  return <div>
    <PageHeader title="Health & diagnostics" subtitle={`Node ${data.node} · WPPConnect ${data.wppVersion} · uptime ${Math.floor(data.uptime / 60)} min · RSS ${(data.memory / 1048576).toFixed(0)} MB`} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Object.entries(data.checks).map(([k, v]) => <div key={k} className="card flex items-center gap-3 p-4">{v ? <CheckCircle2 className="text-green-500" /> : <XCircle className="text-red-500" />}<div><p className="text-sm font-medium capitalize">{k}</p><p className="text-xs text-muted">{v ? "healthy" : "unavailable"}</p></div></div>)}</div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Per-session diagnostics</h3><div className="divide-y divide-border text-sm">{data.sessions.map((s) => { const rt = data.runtime.find((r) => r.id === s.id); return <div key={s.id} className="py-2"><div className="flex items-center justify-between"><span className="font-medium">{s.name}</span><StatusBadge status={s.status} /></div><dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-muted"><dt>Browser client</dt><dd>{rt?.hasClient ? "connected" : "none"}</dd><dt>WhatsApp connected</dt><dd>{s.status === "READY" ? "yes" : "no"}</dd><dt>Authenticated</dt><dd>{["READY", "CONNECTED"].includes(s.status) ? "yes" : "no"}</dd><dt>Last heartbeat</dt><dd>{fmtDate(s.lastHeartbeatAt)}</dd><dt>QR attempts</dt><dd>{rt?.qrAttempt ?? 0}</dd><dt>Reconnects</dt><dd>{s.reconnectCount}</dd><dt>Last error</dt><dd className="text-red-500">{s.lastError ?? "—"}</dd></dl></div>; })}{data.sessions.length === 0 && <p className="text-xs text-muted">No sessions.</p>}</div></div>
      <div className="space-y-4"><div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Queue</h3><div className="flex flex-wrap gap-2">{Object.entries(data.queue).map(([k, v]) => <Badge key={k}>{k}: {v}</Badge>)}{Object.keys(data.queue).length === 0 && <span className="text-xs text-muted">No campaign jobs</span>}</div><p className="mt-2 text-xs text-muted">Pending webhook deliveries: {data.pendingWebhooks}</p></div>
        <div className="card p-4 text-xs text-muted"><h3 className="mb-1 text-sm font-semibold text-text">Realtime</h3>SSE endpoint <code>/api/events</code> is served in-process. The status indicator in the top bar reflects the browser connection.</div></div>
    </div>
  </div>;
}
