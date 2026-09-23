"use client";
import Link from "next/link";
import { Smartphone, Users, MessageSquare, Megaphone, AlertTriangle, Inbox, Send, Download } from "lucide-react";
import { useApi, useRealtime } from "@/lib/client/api";
import { useShell } from "@/components/shell";
import { ErrorBox, PageHeader, Skeleton, Stat, StatusBadge } from "@/components/ui";
import { BarChart, DonutChart } from "@/components/charts";

interface Stats { totalSessions: number; connectedSessions: number; totalContacts: number; totalChats: number; unreadChats: number; messagesToday: number; messagesSent: number; messagesReceived: number; campaignsRunning: number; campaignSuccessRate: number | null; failedMessages: number; campaigns: { status: string; n: number; sent: number; failed: number; total: number }[]; series: { day: string; sent: number; received: number }[]; statusDistribution: { status: string; n: number }[] }
export default function Dashboard() {
  const { sessionId, sessions } = useShell();
  const { data, error, loading, reload } = useApi<Stats>(`stats${sessionId ? `?sessionId=${sessionId}` : ""}`, [sessionId], { refreshMs: 60000 });
  useRealtime((e) => { if (["message.received", "message.sent", "campaign.status", "session.status"].includes(e.event)) reload(true); }, [reload]);
  if (error) return <ErrorBox error={error} retry={() => reload()} />;
  if (loading || !data) return <Skeleton rows={8} />;
  return <div>
    <PageHeader title="Dashboard" subtitle="Overview of your WhatsApp workspace" actions={<Link href="/inbox" className="btn-primary"><Inbox size={16} /> Open Inbox</Link>} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Sessions" value={`${data.connectedSessions}/${data.totalSessions}`} sub="connected" icon={<Smartphone size={18} />} />
      <Stat label="Contacts" value={data.totalContacts} icon={<Users size={18} />} />
      <Stat label="Chats" value={data.totalChats} sub={`${data.unreadChats} unread`} icon={<MessageSquare size={18} />} />
      <Stat label="Messages today" value={data.messagesToday} sub={`${data.messagesSent} sent · ${data.messagesReceived} received`} icon={<Send size={18} />} />
      <Stat label="Campaigns running" value={data.campaignsRunning} sub={data.campaignSuccessRate !== null ? `${data.campaignSuccessRate}% success` : "no campaigns yet"} icon={<Megaphone size={18} />} />
      <Stat label="Failed messages" value={data.failedMessages} icon={<AlertTriangle size={18} />} />
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      <div className="card p-4 lg:col-span-2"><h3 className="mb-3 text-sm font-semibold">Messages over time (14 days)</h3><BarChart data={data.series.map((s) => ({ label: s.day.slice(5), values: [s.sent, s.received] }))} series={[{ name: "Sent", color: "rgb(34 197 94)" }, { name: "Received", color: "rgb(59 130 246)" }]} /></div>
      <div className="card p-4"><h3 className="mb-3 text-sm font-semibold">Delivery status (sent messages)</h3><DonutChart data={data.statusDistribution.map((s) => ({ label: s.status, value: s.n }))} /></div>
      <div className="card p-4"><h3 className="mb-3 text-sm font-semibold">Campaign performance</h3>{data.campaigns.length === 0 ? <p className="text-xs text-muted">No campaigns yet.</p> : <BarChart data={data.campaigns.map((c) => ({ label: c.status, values: [c.sent, c.failed] }))} series={[{ name: "Sent", color: "rgb(34 197 94)" }, { name: "Failed", color: "rgb(239 68 68)" }]} />}</div>
      <div className="card p-4 lg:col-span-2"><h3 className="mb-3 text-sm font-semibold">Session activity</h3><div className="divide-y divide-border">{sessions.length === 0 && <p className="py-4 text-xs text-muted">No sessions. <Link className="text-primary" href="/sessions">Create one</Link>.</p>}{sessions.map((s) => <div key={s.id} className="flex items-center justify-between py-2 text-sm"><div><span className="font-medium">{s.name}</span><span className="ml-2 text-xs text-muted">{s.phoneNumber ? `+${s.phoneNumber}` : "not linked"}</span></div><div className="flex items-center gap-3 text-xs text-muted"><span>{s.lastHeartbeatAt ? `heartbeat ${new Date(s.lastHeartbeatAt).toLocaleTimeString()}` : ""}</span><StatusBadge status={s.status} /></div></div>)}</div></div>
    </div>
    <p className="mt-4 flex items-center gap-1 text-[11px] text-muted"><Download size={12} /> All figures are computed from persisted session data; delivery/read metrics depend on WhatsApp ACK events.</p>
  </div>;
}
