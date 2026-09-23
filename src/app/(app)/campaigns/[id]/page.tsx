"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Pause, Square, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, fmtDate, useApi, useRealtime } from "@/lib/client/api";
import { useShell } from "@/components/shell";
import { Badge, Confirm, ErrorBox, PageHeader, Skeleton, Stat, StatusBadge, Table, Tabs, useToast } from "@/components/ui";
import { BarChart } from "@/components/charts";
import type { Campaign } from "../page";

interface Recipient { id: string; recipientWaId: string; displayName: string | null; status: string; attempts: number; errorMessage: string | null; sentAt: string | null; deliveredAt: string | null; readAt: string | null; renderedBody: string | null }
const R_STATUSES = ["", "QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED", "CANCELLED", "PENDING"];
export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { can, sessions } = useShell(); const toast = useToast(); const router = useRouter();
  const { data: c, loading, error, reload } = useApi<Campaign & { template: { name: string } | null }>(`campaigns/${id}`);
  const [status, setStatus] = useState(""); const [page, setPage] = useState(1); const [tab, setTab] = useState("recipients"); const [del, setDel] = useState(false); const [cancel, setCancel] = useState(false);
  const { data: recs, reload: reloadRecs } = useApi<{ items: Recipient[]; total: number }>(`campaigns/${id}/recipients?page=${page}&limit=50${status ? `&status=${status}` : ""}`, [page, status]);
  const { data: analytics, reload: reloadA } = useApi<{ byStatus: Record<string, number>; responses: number; timeline: { minute: string; n: number }[]; durationMs: number | null; note: string }>(tab === "analytics" ? `campaigns/${id}/analytics` : null, [tab]);
  useRealtime((e) => { if ((e.event === "campaign.progress" || e.event === "campaign.status") && (e.data as { campaignId: string }).campaignId === id) { reload(true); reloadRecs(true); if (tab === "analytics") reloadA(true); } }, [id, tab]);
  if (error) return <ErrorBox error={error} retry={() => reload()} />; if (loading || !c) return <Skeleton rows={8} />;
  const act = async (a: string) => { try { await api(`campaigns/${id}/${a}`, { method: "POST", json: {} }); toast.success(`Campaign ${a}`); reload(true); reloadRecs(true); } catch (e) { toast.error((e as Error).message); } };
  const pct = c.totalRecipients ? Math.round(((c.sentCount + c.failedCount + c.skippedCount) / c.totalRecipients) * 100) : 0;
  return <div>
    <Link href="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft size={14} /> Campaigns</Link>
    <PageHeader title={c.name} subtitle={`${sessions.find((s) => s.id === c.sessionId)?.name ?? c.sessionId} · ${c.messageType}${c.template ? ` · template "${c.template.name}"` : ""} · created ${fmtDate(c.createdAt)}`} actions={can("OPERATOR") && <>
      {["DRAFT", "PAUSED", "PARTIAL", "FAILED"].includes(c.status) && <button className="btn-primary" onClick={() => act(c.status === "PAUSED" ? "resume" : c.status === "DRAFT" ? "start" : "retry")}><Play size={16} /> {c.status === "PAUSED" ? "Resume" : c.status === "DRAFT" ? "Start" : "Retry failed"}</button>}
      {["RUNNING", "QUEUED"].includes(c.status) && <button className="btn-secondary" onClick={() => act("pause")}><Pause size={16} /> Pause</button>}
      {["RUNNING", "QUEUED", "PAUSED", "DRAFT"].includes(c.status) && <button className="btn-secondary text-red-500" onClick={() => setCancel(true)}><Square size={16} /> Cancel</button>}
      {c.failedCount > 0 && !["RUNNING", "QUEUED"].includes(c.status) && <button className="btn-secondary" onClick={() => act("retry")}><RotateCcw size={16} /> Retry {c.failedCount} failed</button>}
      {!["RUNNING", "QUEUED"].includes(c.status) && <button className="btn-ghost text-red-500" onClick={() => setDel(true)}><Trash2 size={16} /></button>}</>} />
    <div className="card mb-4 p-4"><div className="mb-2 flex items-center justify-between text-sm"><StatusBadge status={c.status} /><span className="text-muted">{pct}% processed{c.startedAt ? ` · started ${fmtDate(c.startedAt)}` : ""}{c.completedAt ? ` · completed ${fmtDate(c.completedAt)}` : ""}</span></div>
      <div className="flex h-3 w-full overflow-hidden rounded bg-surface-2"><div className="bg-green-500 transition-all" style={{ width: `${c.totalRecipients ? (c.sentCount / c.totalRecipients) * 100 : 0}%` }} /><div className="bg-red-500 transition-all" style={{ width: `${c.totalRecipients ? (c.failedCount / c.totalRecipients) * 100 : 0}%` }} /><div className="bg-slate-400 transition-all" style={{ width: `${c.totalRecipients ? (c.skippedCount / c.totalRecipients) * 100 : 0}%` }} /></div>
      {c.lastError && <p className="mt-2 text-xs text-red-500">{c.lastError}</p>}</div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <Stat label="Total" value={c.totalRecipients} /><Stat label="Queued" value={Math.max(0, c.totalRecipients - c.sentCount - c.failedCount - c.skippedCount)} /><Stat label="Sent" value={c.sentCount} /><Stat label="Delivered" value={c.deliveredCount} /><Stat label="Read" value={c.readCount} /><Stat label="Failed" value={c.failedCount} /><Stat label="Skipped" value={c.skippedCount} sub="opted out" />
    </div>
    <div className="mt-5"><Tabs tabs={[{ id: "recipients", label: "Recipients", count: recs?.total }, { id: "analytics", label: "Analytics" }, { id: "config", label: "Configuration" }]} value={tab} onChange={setTab} /></div>
    <div className="mt-4">
      {tab === "recipients" && <div><div className="mb-2 flex items-center gap-2"><select className="input w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{R_STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}</select><span className="text-xs text-muted">{recs?.total ?? 0} recipients</span></div>
        <Table<Recipient> keyFn={(r) => r.id} rows={recs?.items ?? []} cols={[{ h: "Recipient", c: (r) => <span><span className="block font-medium">{r.displayName ?? "—"}</span><span className="font-mono text-xs text-muted">{r.recipientWaId}</span></span> }, { h: "Status", c: (r) => <StatusBadge status={r.status} /> }, { h: "Attempts", c: (r) => r.attempts }, { h: "Sent", c: (r) => fmtDate(r.sentAt) }, { h: "Delivered / Read", c: (r) => `${r.deliveredAt ? "✓" : "—"} / ${r.readAt ? "✓" : "—"}` }, { h: "Error", c: (r) => <span className="text-xs text-red-500">{r.errorMessage}</span> }, { h: "", c: (r) => r.status === "FAILED" && can("OPERATOR") ? <button className="btn-ghost py-1 text-xs" onClick={async () => { await api(`campaigns/${id}/retry`, { method: "POST", json: { recipientIds: [r.id] } }); reloadRecs(true); }}>Retry</button> : null }]} />
        <div className="mt-2 flex justify-end gap-2 text-xs"><button className="btn-secondary py-1" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button><button className="btn-secondary py-1" disabled={(recs?.total ?? 0) <= page * 50} onClick={() => setPage(page + 1)}>Next</button></div></div>}
      {tab === "analytics" && analytics && <div className="grid gap-4 md:grid-cols-2"><div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Sent per minute</h3><BarChart data={analytics.timeline.map((t) => ({ label: t.minute.slice(11), values: [t.n] }))} series={[{ name: "Sent", color: "rgb(34 197 94)" }]} /></div>
        <div className="card p-4 text-sm"><h3 className="mb-2 font-semibold">Summary</h3><dl className="grid grid-cols-2 gap-1">{Object.entries(analytics.byStatus).map(([k, v]) => <><dt key={k} className="text-muted">{k}</dt><dd className="text-right">{v}</dd></>)}<dt className="text-muted">Responses (replies after start)</dt><dd className="text-right">{analytics.responses}</dd><dt className="text-muted">Response rate</dt><dd className="text-right">{c.sentCount ? `${Math.round((analytics.responses / c.sentCount) * 100)}%` : "—"}</dd><dt className="text-muted">Completion time</dt><dd className="text-right">{analytics.durationMs ? `${Math.round(analytics.durationMs / 1000)}s` : "—"}</dd></dl><p className="mt-3 text-[11px] text-muted">{analytics.note}</p></div></div>}
      {tab === "config" && <div className="card grid gap-3 p-4 text-sm md:grid-cols-2"><div><p className="label">Message</p><pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs">{c.body ?? "(template)"}</pre>{c.mediaFilename && <p className="mt-1 text-xs">📎 {c.mediaFilename}</p>}</div><div><p className="label">Audience spec</p><pre className="rounded-lg bg-surface-2 p-3 text-xs">{JSON.stringify(c.audience, null, 2)}</pre><p className="label mt-3">Sending settings</p><div className="flex flex-wrap gap-1">{Object.entries(c.settings).map(([k, v]) => <Badge key={k}>{k}: {String(v)}</Badge>)}</div>{Object.keys(c.variables).length > 0 && <><p className="label mt-3">Variables</p><div className="flex flex-wrap gap-1">{Object.entries(c.variables).map(([k, v]) => <Badge key={k}>{k}={v}</Badge>)}</div></>}</div></div>}
    </div>
    <Confirm open={cancel} onClose={() => setCancel(false)} danger title="Cancel campaign" text="Pending recipients will be marked CANCELLED. Already sent messages are not affected." onConfirm={() => act("cancel")} />
    <Confirm open={del} onClose={() => setDel(false)} danger title="Delete campaign" text="Deletes the campaign and its recipient history." onConfirm={async () => { await api(`campaigns/${id}`, { method: "DELETE" }); router.push("/campaigns"); }} />
  </div>;
}
