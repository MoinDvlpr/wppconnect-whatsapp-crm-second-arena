"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Inbox, Users, UsersRound, Megaphone, FileText, Tags, Workflow, ShoppingBag, CircleDashed, Radio, Smartphone, Webhook, Code2, ScrollText, BarChart3, Settings, Search, Bell, Moon, Sun, LogOut, Menu, X, Wifi, WifiOff, Activity, Cpu } from "lucide-react";
import { api, useApi, useRealtime, useRealtimeStatus, type RealtimeEvent } from "@/lib/client/api";
import { Avatar, StatusBadge, Modal } from "./ui";

export interface SessionRow { id: string; name: string; slug: string; status: string; phoneNumber: string | null; profileName: string | null; profilePicUrl: string | null; lastError: string | null; autoStart: boolean; wid: string | null; lastConnectedAt: string | null; lastDisconnectedAt: string | null; lastHeartbeatAt: string | null; reconnectCount: number; batteryLevel: number | null; platform: string | null; waVersion: string | null; lastSyncAt: string | null; loading: { percent: number; message: string } | null; createdAt: string }
interface Me { id: string; name: string; role: "ADMIN" | "OPERATOR" | "VIEWER" }
interface ShellCtx { sessions: SessionRow[]; sessionId: string | null; setSessionId: (id: string) => void; session: SessionRow | null; reloadSessions: () => void; me: Me | null; can: (role: "ADMIN" | "OPERATOR" | "VIEWER") => boolean }
const Ctx = createContext<ShellCtx>({ sessions: [], sessionId: null, setSessionId: () => {}, session: null, reloadSessions: () => {}, me: null, can: () => false });
export const useShell = () => useContext(Ctx);

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }, { href: "/inbox", label: "Inbox", icon: Inbox }, { href: "/contacts", label: "Contacts", icon: Users }, { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone }, { href: "/templates", label: "Templates", icon: FileText }, { href: "/labels", label: "Labels", icon: Tags }, { href: "/automation", label: "Automation", icon: Workflow },
  { href: "/catalog", label: "Catalog", icon: ShoppingBag }, { href: "/status", label: "Status", icon: CircleDashed }, { href: "/channels", label: "Channels", icon: Radio }, { href: "/sessions", label: "Sessions", icon: Smartphone },
  { href: "/webhooks", label: "Webhooks", icon: Webhook }, { href: "/developer", label: "Developer API", icon: Code2 }, { href: "/developer/capabilities", label: "Capabilities", icon: Cpu }, { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 }, { href: "/health", label: "Health", icon: Activity }, { href: "/settings", label: "Settings", icon: Settings },
];
const RANK = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const { data: sessions, reload } = useApi<SessionRow[]>("sessions", [], { refreshMs: 30000 });
  const { data: me } = useApi<Me | null>("/api/auth/me");
  const [sessionId, setSid] = useState<string | null>(null);
  const [dark, setDark] = useState(false); const [open, setOpen] = useState(false); const [search, setSearch] = useState(false); const [notifs, setNotifs] = useState<RealtimeEvent[]>([]);
  const rtConnected = useRealtimeStatus();
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  useEffect(() => { if (!sessions) return; const stored = localStorage.getItem("sessionId"); const pick = sessions.find((s) => s.id === stored) ?? sessions.find((s) => s.status === "READY") ?? sessions[0]; if (pick && pick.id !== sessionId) setSid(pick.id); }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime((e) => { if (e.event === "session.status" || e.event === "session.qr") reload(); if (["message.received", "campaign.status", "session.status"].includes(e.event)) setNotifs((n) => [e, ...n].slice(0, 30)); }, [reload]);
  const setSessionId = (id: string) => { setSid(id); localStorage.setItem("sessionId", id); };
  const toggleTheme = () => { const d = !dark; setDark(d); document.documentElement.classList.toggle("dark", d); localStorage.theme = d ? "dark" : "light"; };
  const ctx = useMemo<ShellCtx>(() => ({ sessions: sessions ?? [], sessionId, setSessionId, session: sessions?.find((s) => s.id === sessionId) ?? null, reloadSessions: reload, me: me ?? null, can: (r) => !!me && RANK[me.role] >= RANK[r] }), [sessions, sessionId, me, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearch(true); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const isInbox = pathname.startsWith("/inbox");
  return <Ctx.Provider value={ctx}>
    <div className="flex h-screen overflow-hidden">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center justify-between border-b border-border px-4"><Link href="/dashboard" className="flex items-center gap-2 font-semibold"><span className="rounded-md bg-primary p-1.5 text-primary-fg"><Inbox size={16} /></span>{process.env.NEXT_PUBLIC_APP_NAME || "WhatsApp CRM"}</Link><button className="lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">{NAV.map((n) => { const active = pathname === n.href || (n.href !== "/developer" && pathname.startsWith(n.href + "/")) || (n.href === "/developer" && pathname === "/developer"); return <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-muted hover:bg-surface-2 hover:text-text"}`}><n.icon size={17} />{n.label}</Link>; })}</nav>
        <div className="border-t border-border p-3 text-[11px] text-muted">Powered by WPPConnect · unofficial WhatsApp Web automation</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
          <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="hidden items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted sm:flex">Workspace <span className="font-medium text-text">Default</span></div>
          <select className="input max-w-[200px] py-1.5" value={sessionId ?? ""} onChange={(e) => setSessionId(e.target.value)} aria-label="Session">{!sessions?.length && <option value="">No sessions</option>}{sessions?.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.status}</option>)}</select>
          {ctx.session && <span className="hidden sm:inline-flex"><StatusBadge status={ctx.session.status} /></span>}
          <button onClick={() => setSearch(true)} className="btn-secondary ml-auto hidden py-1.5 text-muted sm:flex"><Search size={14} /> Search <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd></button>
          <button onClick={() => setSearch(true)} className="btn-ghost ml-auto p-1.5 sm:hidden"><Search size={18} /></button>
          <span title={rtConnected ? "Realtime connected" : "Realtime disconnected"} className={rtConnected ? "text-green-500" : "text-red-500"}>{rtConnected ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
          <NotifMenu items={notifs} clear={() => setNotifs([])} />
          <button onClick={toggleTheme} className="btn-ghost p-1.5" aria-label="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
          <div className="flex items-center gap-2 pl-1"><Avatar name={me?.name} size={28} /><span className="hidden text-sm sm:block">{me?.name}</span><button className="btn-ghost p-1.5" title="Log out" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.replace("/login"); }}><LogOut size={16} /></button></div>
        </header>
        <main className={`min-h-0 flex-1 ${isInbox ? "overflow-hidden" : "overflow-y-auto p-4 sm:p-6"}`}>{children}</main>
      </div>
    </div>
    <GlobalSearch open={search} onClose={() => setSearch(false)} />
  </Ctx.Provider>;
}

function NotifMenu({ items, clear }: { items: RealtimeEvent[]; clear: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="relative"><button className="btn-ghost relative p-1.5" onClick={() => setOpen(!open)} aria-label="Notifications"><Bell size={17} />{items.length > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-primary" />}</button>
    {open && <div className="card absolute right-0 z-50 mt-1 w-80 shadow-xl"><div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-medium">Notifications<button className="text-xs text-muted" onClick={clear}>Clear</button></div><div className="max-h-80 overflow-y-auto">{items.length === 0 ? <p className="p-4 text-center text-xs text-muted">No recent events</p> : items.map((e, i) => <div key={i} className="border-b border-border px-3 py-2 text-xs"><span className="font-medium">{e.event}</span><span className="ml-2 text-muted">{new Date(e.timestamp).toLocaleTimeString()}</span><p className="truncate text-muted">{e.event === "message.received" ? `${(e.data as { senderName?: string; body?: string }).senderName ?? e.chatId}: ${(e.data as { body?: string }).body ?? "media"}` : JSON.stringify(e.data).slice(0, 80)}</p></div>)}</div></div>}</div>;
}

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState(""); const router = useRouter();
  const { data } = useApi<{ contacts: { id: string; name: string | null; phone: string | null; sessionId: string; waId: string }[]; chats: { waId: string; name: string | null; sessionId: string }[]; messages: { waMessageId: string; chatId: string; body: string | null; sessionId: string }[]; campaigns: { id: string; name: string; status: string }[]; templates: { id: string; name: string }[]; groups: { waId: string; subject: string | null; sessionId: string }[] }>(open && q.length >= 2 ? `search?q=${encodeURIComponent(q)}` : null, [q]);
  const go = (href: string) => { onClose(); setQ(""); router.push(href); };
  return <Modal open={open} onClose={onClose} title="Search" width="max-w-xl"><input autoFocus className="input" placeholder="Search contacts, chats, messages, campaigns, templates, groups…" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="mt-3 max-h-96 space-y-3 overflow-y-auto text-sm">{data && ([["Contacts", data.contacts.map((c) => ({ k: c.id, t: c.name ?? c.phone ?? c.waId, s: c.phone, h: `/contacts/${c.id}` }))], ["Chats", data.chats.map((c) => ({ k: c.waId, t: c.name ?? c.waId, s: "", h: `/inbox?chat=${encodeURIComponent(c.waId)}&session=${c.sessionId}` }))], ["Messages", data.messages.map((m) => ({ k: m.waMessageId, t: m.body ?? "", s: m.chatId, h: `/inbox?chat=${encodeURIComponent(m.chatId)}&session=${m.sessionId}` }))], ["Campaigns", data.campaigns.map((c) => ({ k: c.id, t: c.name, s: c.status, h: `/campaigns/${c.id}` }))], ["Templates", data.templates.map((t) => ({ k: t.id, t: t.name, s: "", h: `/templates?id=${t.id}` }))], ["Groups", data.groups.map((g) => ({ k: g.waId, t: g.subject ?? g.waId, s: "", h: `/groups/${encodeURIComponent(g.waId)}` }))]] as [string, { k: string; t: string; s: string | null; h: string }[]][]).filter(([, l]) => l.length).map(([title, list]) => <div key={title}><p className="mb-1 text-[11px] font-semibold uppercase text-muted">{title}</p>{list.map((i) => <button key={i.k} onClick={() => go(i.h)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"><span className="truncate">{i.t}</span><span className="ml-2 shrink-0 text-xs text-muted">{i.s}</span></button>)}</div>)}{q.length >= 2 && data && Object.values(data).every((l) => l.length === 0) && <p className="text-center text-xs text-muted">No results</p>}</div></Modal>;
}
