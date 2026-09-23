"use client";
import Link from "next/link";
import { Plus, Megaphone } from "lucide-react";
import { fmtDate, useApi, useRealtime } from "@/lib/client/api";
import { useShell } from "@/components/shell";
import { Empty, ErrorBox, PageHeader, Skeleton, StatusBadge, Table } from "@/components/ui";

export interface Campaign { id: string; name: string; sessionId: string; status: string; messageType: string; templateId: string | null; body: string | null; totalRecipients: number; sentCount: number; deliveredCount: number; readCount: number; failedCount: number; skippedCount: number; scheduledAt: string | null; startedAt: string | null; completedAt: string | null; createdAt: string; lastError: string | null; audience: Record<string, unknown>; settings: Record<string, unknown>; variables: Record<string, string>; mediaPath: string | null; mediaFilename: string | null; payload: Record<string, unknown> }
export default function CampaignsPage() {
  const { sessionId, sessions, can } = useShell();
  const { data, loading, error, reload } = useApi<Campaign[]>("campaigns", [], { refreshMs: 30000 });
  useRealtime((e) => { if (e.event.startsWith("campaign.")) reload(true); }, [reload]);
  return <div>
    <PageHeader title="Campaigns" subtitle="Bulk messaging with a persistent queue, throttling and per-recipient tracking." actions={can("OPERATOR") && <Link href="/campaigns/new" className="btn-primary"><Plus size={16} /> Create campaign</Link>} />
    {error ? <ErrorBox error={error} retry={() => reload()} /> : loading && !data ? <Skeleton /> : !data?.length ? <Empty icon={<Megaphone size={36} />} title="No campaigns" text="Create your first campaign: choose an audience from contacts, labels or groups, compose, preview and send." action={can("OPERATOR") && <Link href="/campaigns/new" className="btn-primary">Create campaign</Link>} /> :
      <Table<Campaign> keyFn={(c) => c.id} rows={data} cols={[
        { h: "Campaign", c: (c) => <Link href={`/campaigns/${c.id}`} className="font-medium text-primary">{c.name}</Link> },
        { h: "Session", c: (c) => sessions.find((s) => s.id === c.sessionId)?.name ?? c.sessionId.slice(0, 8) },
        { h: "Type", c: (c) => c.messageType }, { h: "Status", c: (c) => <StatusBadge status={c.status} /> },
        { h: "Progress", w: "220px", c: (c) => <div><div className="flex h-2 w-full overflow-hidden rounded bg-surface-2"><div className="bg-green-500" style={{ width: `${c.totalRecipients ? (c.sentCount / c.totalRecipients) * 100 : 0}%` }} /><div className="bg-red-500" style={{ width: `${c.totalRecipients ? (c.failedCount / c.totalRecipients) * 100 : 0}%` }} /></div><p className="mt-0.5 text-[11px] text-muted">{c.sentCount}/{c.totalRecipients} sent · {c.failedCount} failed · {c.skippedCount} skipped</p></div> },
        { h: "Delivered / Read", c: (c) => `${c.deliveredCount} / ${c.readCount}` },
        { h: "Created", c: (c) => fmtDate(c.createdAt) },
      ]} />}
    {sessionId === null && <p className="mt-2 text-xs text-muted">Select a session in the top bar to create campaigns.</p>}
  </div>;
}
