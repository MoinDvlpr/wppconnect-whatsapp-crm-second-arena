"use client";
import { useEffect, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { useShell } from "@/components/shell";
import { Badge, Confirm, Field, Modal, PageHeader, Skeleton, Tabs, useToast } from "@/components/ui";

const GROUPS: Record<string, { key: string; label: string; type?: "number" | "boolean" | "text" | "select"; options?: string[]; hint?: string }[]> = {
  General: [{ key: "general.appName", label: "Application name" }, { key: "general.timezone", label: "Timezone", hint: "IANA name, e.g. Asia/Kolkata" }, { key: "general.dateFormat", label: "Date format" }],
  Session: [{ key: "session.autoRestore", label: "Restore sessions on boot", type: "boolean" }, { key: "session.defaultSessionId", label: "Default session id" }],
  Messaging: [{ key: "messaging.typingSimulation", label: "Send typing state while composing", type: "boolean" }, { key: "messaging.markSeenOnOpen", label: "Mark chat seen when opened", type: "boolean" }],
  Campaign: [{ key: "campaign.messagesPerMinute", label: "Messages per minute", type: "number" }, { key: "campaign.minDelayMs", label: "Minimum delay (ms)", type: "number" }, { key: "campaign.maxDelayMs", label: "Maximum delay (ms)", type: "number" }, { key: "campaign.maxSize", label: "Maximum campaign size", type: "number" }, { key: "campaign.retryCount", label: "Retry count", type: "number" }, { key: "campaign.retryDelayMs", label: "Retry delay (ms)", type: "number" }, { key: "campaign.skipOptedOut", label: "Skip opted-out contacts", type: "boolean" }],
  Template: [{ key: "template.missingVariableBehavior", label: "Missing variable behaviour", type: "select", options: ["fail", "blank"] }],
  Automation: [{ key: "automation.optOutKeywords", label: "Opt-out keywords (comma separated)" }, { key: "automation.optInKeywords", label: "Opt-in keywords" }],
  Webhook: [{ key: "webhook.timeoutMs", label: "Default timeout (ms)", type: "number" }, { key: "webhook.retryCount", label: "Default retries", type: "number" }],
  Storage: [{ key: "storage.mediaCache", label: "Cache downloaded media on disk", type: "boolean" }, { key: "storage.mediaRetentionDays", label: "Media retention (days)", type: "number" }],
  Security: [{ key: "security.sessionTtlDays", label: "Login session TTL (days)", type: "number" }, { key: "security.apiRateLimitPerMinute", label: "API rate limit / minute", type: "number" }],
  Logs: [{ key: "logs.retentionDays", label: "Log retention (days)", type: "number" }, { key: "logs.level", label: "Log level", type: "select", options: ["debug", "info", "warn", "error"] }],
};
export default function SettingsPage() {
  const { can, me } = useShell(); const toast = useToast(); const [tab, setTab] = useState("General"); const { data, loading, reload } = useApi<Record<string, unknown>>("settings"); const [f, setF] = useState<Record<string, unknown>>({});
  useEffect(() => { if (data) setF(data); }, [data]);
  const save = async () => { try { await api("settings", { method: "PATCH", json: Object.fromEntries(Object.keys(f).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(data?.[k])).map((k) => [k, f[k]])) }); reload(true); toast.success("Settings saved"); } catch (e) { toast.error((e as Error).message); } };
  if (loading || !data) return <Skeleton />;
  return <div className="mx-auto max-w-4xl">
    <PageHeader title="Settings" actions={can("ADMIN") && tab !== "Users" && tab !== "Account" && <button className="btn-primary" onClick={save}><Save size={16} /> Save changes</button>} />
    <Tabs tabs={[...Object.keys(GROUPS).map((g) => ({ id: g, label: g })), { id: "Users", label: "Users & roles" }, { id: "Account", label: "My account" }]} value={tab} onChange={setTab} />
    <div className="card mt-4 p-5">
      {GROUPS[tab] && <div className="grid gap-4 sm:grid-cols-2">{GROUPS[tab].map((s) => <Field key={s.key} label={s.label} hint={s.hint}>{s.type === "boolean" ? <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={!!f[s.key]} disabled={!can("ADMIN")} onChange={(e) => setF({ ...f, [s.key]: e.target.checked })} /> Enabled</label> : s.type === "select" ? <select className="input" value={String(f[s.key] ?? "")} disabled={!can("ADMIN")} onChange={(e) => setF({ ...f, [s.key]: e.target.value })}>{s.options!.map((o) => <option key={o}>{o}</option>)}</select> : <input className="input" type={s.type === "number" ? "number" : "text"} value={String(f[s.key] ?? "")} disabled={!can("ADMIN")} onChange={(e) => setF({ ...f, [s.key]: s.type === "number" ? Number(e.target.value) : e.target.value })} />}</Field>)}</div>}
      {tab === "Users" && <Users />}
      {tab === "Account" && <Account name={me?.name} />}
    </div>
    <p className="mt-3 text-[11px] text-muted">Environment-level settings (DATABASE_URL, WPP_SESSIONS_PATH, MEDIA_STORAGE_PATH, AUTH_SECRET, LOG_LEVEL) are configured via <code>.env</code>.</p>
  </div>;
}
function Users() {
  const { can, me } = useShell(); const toast = useToast(); const { data, reload } = useApi<{ id: string; email: string; name: string; role: string }[]>("users"); const [add, setAdd] = useState(false); const [f, setF] = useState({ email: "", name: "", password: "", role: "OPERATOR" }); const [del, setDel] = useState<string | null>(null);
  return <div>{can("ADMIN") && <button className="btn-secondary mb-3" onClick={() => setAdd(true)}><Plus size={14} /> Add user</button>}
    <div className="divide-y divide-border text-sm">{data?.map((u) => <div key={u.id} className="flex items-center gap-3 py-2"><div className="flex-1"><p className="font-medium">{u.name}</p><p className="text-xs text-muted">{u.email}</p></div>{can("ADMIN") ? <select className="input w-32" value={u.role} onChange={async (e) => { await api(`users/${u.id}`, { method: "PATCH", json: { role: e.target.value } }); reload(true); toast.success("Role updated"); }}>{["ADMIN", "OPERATOR", "VIEWER"].map((r) => <option key={r}>{r}</option>)}</select> : <Badge color="blue">{u.role}</Badge>}{can("ADMIN") && u.id !== me?.id && <button className="btn-ghost p-1 text-red-500" onClick={() => setDel(u.id)}><Trash2 size={14} /></button>}</div>)}</div>
    <p className="mt-3 text-xs text-muted">ADMIN: everything · OPERATOR: send messages, manage contacts/campaigns/templates · VIEWER: read-only.</p>
    <Modal open={add} onClose={() => setAdd(false)} title="Add user" width="max-w-sm" footer={<button className="btn-primary" onClick={async () => { try { await api("users", { method: "POST", json: f }); setAdd(false); reload(true); toast.success("User created"); } catch (e) { toast.error((e as Error).message); } }}>Create</button>}><div className="space-y-2"><Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Email"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="Password (min 8)"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field><Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["ADMIN", "OPERATOR", "VIEWER"].map((r) => <option key={r}>{r}</option>)}</select></Field></div></Modal>
    <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete user" text="The user will lose access immediately." onConfirm={async () => { await api(`users/${del}`, { method: "DELETE" }); reload(true); }} /></div>;
}
function Account({ name }: { name?: string }) { const toast = useToast(); const [cur, setCur] = useState(""); const [next, setNext] = useState(""); return <div className="max-w-sm space-y-3"><p className="text-sm">Signed in as <strong>{name}</strong></p><Field label="Current password"><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field><Field label="New password (min 8)"><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field><button className="btn-primary" disabled={!cur || next.length < 8} onClick={async () => { try { await api("me/password", { method: "POST", json: { current: cur, next } }); setCur(""); setNext(""); toast.success("Password changed"); } catch (e) { toast.error((e as Error).message); } }}>Change password</button></div>; }
