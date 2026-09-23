"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Pin, BellOff, Archive, ChevronDown, ArrowLeft, Info, Paperclip, Send, Smile, MapPin, UserRound, FileText, Reply, Forward, Star, Copy, Pencil, Trash2, Download, X, Check, CheckCheck, Clock, AlertCircle, Loader2, Image as ImageIcon, MoreVertical, RefreshCw, Mic, Sticker, ListChecks } from "lucide-react";
import { api, fileToBase64, fmtBytes, fmtTime, relTime, useApi, useRealtime, type RealtimeEvent } from "@/lib/client/api";
import { useShell } from "@/components/shell";
import { Avatar, Badge, Empty, ErrorBox, Modal, Spinner, useToast, Field } from "@/components/ui";

interface ChatRow { id: string; waId: string; kind: string; displayName: string; avatarUrl: string | null; phone: string | null; unreadCount: number; lastMessageAt: string | null; lastMessagePreview: string | null; lastMessageType: string | null; lastMessageFromMe: boolean | null; isArchived: boolean; isPinned: boolean; isMuted: boolean; contactId: string | null; labels: { id: string; name: string; color: string }[]; assignedUserId: string | null }
interface Msg { id: string; waMessageId: string; chatId: string; senderId: string | null; fromMe: boolean; type: string; body: string | null; caption: string | null; timestamp: number; status: string; quotedMessageId: string | null; edited: boolean; revoked: boolean; hasMedia: boolean; mediaMimeType: string | null; mediaFilename: string | null; mediaSize: number | null; location: { lat: number; lng: number; name?: string } | null; vcard: string | null; senderName: string | null; isStarred: boolean | null; isForwarded: boolean | null; reactions: { senderId: string; emoji: string }[]; metadata: Record<string, unknown> | null; errorMessage?: string | null; mentionedIds?: string[] | null }
const FILTERS = [["all", "All"], ["unread", "Unread"], ["contacts", "Contacts"], ["groups", "Groups"], ["pinned", "Pinned"], ["archived", "Archived"]] as const;
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "✅", "👏", "😍", "🤔", "😊", "🙌", "💯", "👋"];

export default function InboxPage() { return <Suspense><Inbox /></Suspense>; }

function Inbox() {
  const { sessionId, session, setSessionId, sessions } = useShell(); const params = useSearchParams(); const router = useRouter(); const toast = useToast();
  const [filter, setFilter] = useState<string>("all"); const [q, setQ] = useState(""); const [labelId, setLabelId] = useState(""); const [active, setActive] = useState<string | null>(params.get("chat"));
  const [showInfo, setShowInfo] = useState(false); const [page, setPage] = useState(1);
  const { data: labels } = useApi<{ id: string; name: string; color: string }[]>("labels");
  const listPath = sessionId ? `chats?sessionId=${sessionId}&filter=${filter}&limit=${page * 50}${q ? `&q=${encodeURIComponent(q)}` : ""}${labelId ? `&labelId=${labelId}` : ""}` : null;
  const { data: chats, loading, error, reload, setData } = useApi<ChatRow[]>(listPath, [sessionId, filter, q, labelId, page]);
  useEffect(() => { const s = params.get("session"); if (s && s !== sessionId && sessions.some((x) => x.id === s)) setSessionId(s); }, [params, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime((e) => {
    if (e.sessionId !== sessionId) return;
    if (["message.received", "message.sent", "chat.updated", "message.deleted"].includes(e.event)) reload(true);
  }, [sessionId, reload]);
  const activeChat = chats?.find((c) => c.waId === active) ?? null;
  const open = (waId: string) => { setActive(waId); router.replace(`/inbox?chat=${encodeURIComponent(waId)}`); setData((l) => l ? l.map((c) => c.waId === waId ? { ...c, unreadCount: 0 } : c) : l); };
  const refreshChats = async () => { if (!sessionId) return; try { await api(`chats/refresh?sessionId=${sessionId}`, { method: "POST" }); reload(true); toast.success("Chats refreshed from WhatsApp"); } catch (e) { toast.error((e as Error).message); } };
  return <div className="flex h-full">
    {/* LEFT: chat list */}
    <aside className={`flex w-full flex-col border-r border-border bg-surface md:w-80 lg:w-[340px] ${active ? "hidden md:flex" : "flex"}`}>
      <div className="border-b border-border p-2"><div className="flex items-center gap-2"><div className="relative flex-1"><Search size={14} className="absolute left-2.5 top-2.5 text-muted" /><input className="input pl-8 py-1.5" placeholder="Search chats" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div><button className="btn-ghost p-1.5" title="Refresh from WhatsApp" onClick={refreshChats}><RefreshCw size={16} /></button></div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">{FILTERS.map(([id, l]) => <button key={id} onClick={() => { setFilter(id); setPage(1); }} className={`badge shrink-0 px-2.5 py-1 ${filter === id ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-text"}`}>{l}</button>)}
          <select className="badge shrink-0 border-0 bg-surface-2 text-muted" value={labelId} onChange={(e) => setLabelId(e.target.value)}><option value="">Label</option>{labels?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div></div>
      <div className="flex-1 overflow-y-auto">
        {!sessionId ? <Empty title="No session selected" text="Create and link a WhatsApp session first." /> : error ? <div className="p-3"><ErrorBox error={error} retry={() => reload()} /></div> : loading && !chats ? <div className="space-y-1 p-2">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div> : chats?.length === 0 ? <Empty title="No chats" text={session?.status === "READY" ? "Chats sync automatically once messages arrive. Use refresh to pull from WhatsApp." : `Session is ${session?.status ?? "not ready"}.`} /> :
          chats?.map((c) => <button key={c.id} onClick={() => open(c.waId)} className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left hover:bg-surface-2/70 ${active === c.waId ? "bg-surface-2" : ""}`}>
            <Avatar src={c.avatarUrl} name={c.displayName} size={44} />
            <div className="min-w-0 flex-1"><div className="flex items-center gap-1"><span className="truncate text-sm font-medium">{c.displayName}</span>{c.kind === "group" && <Badge>group</Badge>}{c.kind === "newsletter" && <Badge color="purple">channel</Badge>}<span className="ml-auto shrink-0 text-[11px] text-muted">{relTime(c.lastMessageAt)}</span></div>
              <div className="flex items-center gap-1"><p className="truncate text-xs text-muted">{c.lastMessageFromMe && <span className="mr-0.5">You:</span>}{c.lastMessagePreview ?? c.phone ?? ""}</p><span className="ml-auto flex shrink-0 items-center gap-1 text-muted">{c.isPinned && <Pin size={12} />}{c.isMuted && <BellOff size={12} />}{c.isArchived && <Archive size={12} />}{c.unreadCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-fg">{c.unreadCount}</span>}</span></div>
              {c.labels.length > 0 && <div className="mt-0.5 flex gap-1">{c.labels.slice(0, 3).map((l) => <span key={l.id} className="rounded px-1 text-[10px] text-white" style={{ background: l.color }}>{l.name}</span>)}</div>}</div></button>)}
        {chats && chats.length >= page * 50 && <button className="btn-ghost w-full text-xs" onClick={() => setPage(page + 1)}>Load more</button>}
      </div>
    </aside>
    {/* CENTER: conversation */}
    <section className={`flex min-w-0 flex-1 flex-col ${active ? "flex" : "hidden md:flex"}`}>
      {active && sessionId ? <Conversation key={active + sessionId} sessionId={sessionId} chatId={active} chat={activeChat} onBack={() => { setActive(null); router.replace("/inbox"); }} onInfo={() => setShowInfo(!showInfo)} sessionReady={session?.status === "READY"} /> : <div className="chat-pattern flex h-full flex-col items-center justify-center text-center"><div className="rounded-full bg-surface p-5 shadow"><Send size={32} className="text-primary" /></div><h3 className="mt-4 text-lg font-semibold">{process.env.NEXT_PUBLIC_APP_NAME || "WhatsApp CRM"} Inbox</h3><p className="mt-1 max-w-xs text-sm text-muted">Select a chat to start messaging. Incoming messages appear in realtime via WPPConnect.</p></div>}
    </section>
    {/* RIGHT: info panel */}
    {active && sessionId && showInfo && <ContactPanel sessionId={sessionId} chatId={active} chat={activeChat} onClose={() => setShowInfo(false)} labels={labels ?? []} onChanged={() => reload(true)} />}
  </div>;
}

// ---------------- Conversation ----------------
function Conversation({ sessionId, chatId, chat, onBack, onInfo, sessionReady }: { sessionId: string; chatId: string; chat: ChatRow | null; onBack: () => void; onInfo: () => void; sessionReady: boolean }) {
  const toast = useToast(); const { me } = useShell();
  const [msgs, setMsgs] = useState<Msg[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [hasMore, setHasMore] = useState(true); const [loadingMore, setLoadingMore] = useState(false);
  const [newCount, setNewCount] = useState(0); const [atBottom, setAtBottom] = useState(true); const [reply, setReply] = useState<Msg | null>(null); const [editing, setEditing] = useState<Msg | null>(null); const [typing, setTyping] = useState<string | null>(null); const [presence, setPresence] = useState<{ isOnline: boolean | null; lastSeen: number | boolean | null } | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Msg | null>(null); const [search, setSearch] = useState(""); const [showSearch, setShowSearch] = useState(false); const [jumpTo, setJumpTo] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null); const firstUnreadRef = useRef<string | null>(null);
  const messageKey = (m: Msg) =>
    m.waMessageId ||
    m.id ||
    `${m.chatId}-${m.timestamp}-${m.senderId ?? ""}-${m.type}-${m.body ?? m.caption ?? ""}`;
  const merge = useCallback((list: Msg[], incoming: Msg[]) => {
    const keyOf = (m: Msg) => m.waMessageId || m.id || `${m.chatId}-${m.timestamp}-${m.senderId ?? ""}`;
    const map = new Map(list.map((m) => [keyOf(m), m]));
    for (const m of incoming) {
      const key = keyOf(m);
      map.set(key, { ...map.get(key), ...m });
    }
    return [...map.values()].sort(
      (a, b) =>
        (a.timestamp ?? 0) - (b.timestamp ?? 0) ||
        (a.id ?? a.waMessageId ?? "").localeCompare(b.id ?? b.waMessageId ?? "")
    );
  }, []);
  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    try { const r = await api<{ messages: Msg[]; hasMore: boolean }>(`chats/${encodeURIComponent(chatId)}/messages?sessionId=${sessionId}&limit=40${refresh ? "&refresh=1" : ""}`); setMsgs(r.messages); setHasMore(r.hasMore || r.messages.length >= 40); const fu = r.messages.find((m) => !m.fromMe && (chat?.unreadCount ?? 0) > 0 && r.messages.indexOf(m) >= r.messages.length - (chat?.unreadCount ?? 0)); firstUnreadRef.current = fu?.waMessageId ?? null; }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }), 30); }
  }, [chatId, sessionId, chat?.unreadCount]);
  useEffect(() => { load(); if (sessionReady) { api(`chats/${encodeURIComponent(chatId)}/seen?sessionId=${sessionId}`, { method: "POST" }).catch(() => { }); api(`chats/${encodeURIComponent(chatId)}/presence/subscribe?sessionId=${sessionId}`, { method: "POST" }).catch(() => { }); api<{ isOnline: boolean | null; lastSeen: number | boolean | null }>(`chats/${encodeURIComponent(chatId)}/presence?sessionId=${sessionId}`).then(setPresence).catch(() => { }); } }, [load, chatId, sessionId, sessionReady]);
  const loadOlder = async () => {
    if (loadingMore || !msgs.length) return; setLoadingMore(true); const el = scroller.current; const prevH = el?.scrollHeight ?? 0;
    try { const first = msgs[0]; const r = await api<{ messages: Msg[]; hasMore: boolean }>(`chats/${encodeURIComponent(chatId)}/messages?sessionId=${sessionId}&limit=40&before=${first.timestamp}&beforeId=${encodeURIComponent(first.waMessageId)}`); if (!r.messages.length) setHasMore(false); setMsgs((l) => merge(l, r.messages)); requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; }); }
    catch (e) { toast.error((e as Error).message); } finally { setLoadingMore(false); }
  };
  useRealtime((e: RealtimeEvent) => {
    if (e.sessionId !== sessionId || e.chatId !== chatId) return;
    if (e.event === "message.received" || e.event === "message.sent") { const m = e.data as Msg; setMsgs((l) => merge(l, [{ ...m, reactions: m.reactions ?? [] }])); if (!atBottom && !m.fromMe) setNewCount((n) => n + 1); else setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }), 20); if (!m.fromMe && sessionReady && document.visibilityState === "visible") api(`chats/${encodeURIComponent(chatId)}/seen?sessionId=${sessionId}`, { method: "POST" }).catch(() => { }); }
    if (["message.delivered", "message.read", "message.failed"].includes(e.event)) { const d = e.data as { waMessageId: string; status: string }; setMsgs((l) => l.map((m) => m.waMessageId === d.waMessageId ? { ...m, status: d.status } : m)); }
    if (e.event === "message.edited") { const d = e.data as { waMessageId: string; body?: string; metadata?: Record<string, unknown> }; setMsgs((l) => l.map((m) => m.waMessageId === d.waMessageId ? { ...m, ...(d.body !== undefined ? { body: d.body } : {}), ...(d.metadata !== undefined ? { metadata: d.metadata } : {}), edited: d.body !== undefined } : m)); }
    if (e.event === "message.deleted") { const d = e.data as { waMessageId: string }; setMsgs((l) => l.map((m) => m.waMessageId === d.waMessageId || (m.waMessageId ?? "").endsWith("_" + d.waMessageId) ? { ...m, revoked: true, body: null } : m)); }
    if (e.event === "reaction.received") { const d = e.data as { waMessageId: string; senderId: string; emoji: string }; setMsgs((l) => l.map((m) => m.waMessageId === d.waMessageId ? { ...m, reactions: [...m.reactions.filter((r) => r.senderId !== d.senderId), ...(d.emoji ? [{ senderId: d.senderId, emoji: d.emoji }] : [])] } : m)); }
    if (e.event === "typing") { const d = e.data as { state?: string }; setTyping(d.state ?? "typing"); setTimeout(() => setTyping(null), 5000); }
    if (e.event === "presence.changed") { const d = e.data as { isOnline?: boolean; t?: number }; setPresence({ isOnline: d.isOnline ?? null, lastSeen: d.t ?? null }); }
  }, [sessionId, chatId, atBottom, merge, sessionReady]);
  const onScroll = () => { const el = scroller.current; if (!el) return; const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAtBottom(bottom); if (bottom) setNewCount(0); if (el.scrollTop < 60 && hasMore && !loadingMore) loadOlder(); };
  useEffect(() => { if (jumpTo) { const el = document.getElementById(`msg-${jumpTo}`); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("ring-2", "ring-primary"); setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500); } setJumpTo(null); } }, [jumpTo, msgs]);
  const visible = useMemo(() => search ? msgs.filter((m) => (m.body ?? m.caption ?? "").toLowerCase().includes(search.toLowerCase())) : msgs, [msgs, search]);
  const byId = useMemo(() => new Map(msgs.map((m) => [m.waMessageId, m])), [msgs]);
  const isGroup = chatId.endsWith("@g.us");
  const doAction = async (m: Msg, action: string, payload?: unknown) => {
    try {
      const base = `messages/${encodeURIComponent(m.waMessageId)}`;
      if (action === "react") await api(`${base}/react?sessionId=${sessionId}`, { method: "POST", json: { emoji: payload } });
      else if (action === "star") { await api(`${base}/star?sessionId=${sessionId}`, { method: "POST", json: { star: !m.isStarred } }); setMsgs((l) => l.map((x) => x.id === m.id ? { ...x, isStarred: !m.isStarred } : x)); }
      else if (action === "delete") { await api(`${base}?sessionId=${sessionId}`, { method: "DELETE" }); }
      else if (action === "deleteLocal") { await api(`${base}?sessionId=${sessionId}&onlyLocal=1`, { method: "DELETE" }); setMsgs((l) => l.filter((x) => x.id !== m.id)); }
      else if (action === "copy") { await navigator.clipboard.writeText(m.body ?? m.caption ?? ""); toast.success("Copied"); }
      else if (action === "download") { window.open(`/api/v1/${base}/media?sessionId=${sessionId}&download=1`, "_blank"); }
      else if (action === "edit") setEditing(m);
      else if (action === "reply") setReply(m);
      else if (action === "forward") setForwardMsg(m);
    } catch (e) { toast.error((e as Error).message); }
  };
  return <>
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <button className="btn-ghost p-1 md:hidden" onClick={onBack}><ArrowLeft size={18} /></button>
      <Avatar src={chat?.avatarUrl} name={chat?.displayName ?? chatId} size={36} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{chat?.displayName ?? chatId}</p><p className="truncate text-[11px] text-muted">{typing ? <span className="text-primary">{typing === "recording" ? "recording audio…" : "typing…"}</span> : presence?.isOnline ? "online" : typeof presence?.lastSeen === "number" ? `last seen ${relTime(presence.lastSeen)}` : chat?.phone ? `+${chat.phone}` : chatId}</p></div>
      {showSearch && <input autoFocus className="input w-48 py-1" placeholder="Search in chat" value={search} onChange={(e) => setSearch(e.target.value)} />}
      <button className="btn-ghost p-1.5" onClick={() => { setShowSearch(!showSearch); setSearch(""); }}><Search size={18} /></button>
      <button className="btn-ghost p-1.5" onClick={() => load(true)} title="Refresh from WhatsApp"><RefreshCw size={16} /></button>
      <button className="btn-ghost p-1.5" onClick={onInfo}><Info size={18} /></button>
    </header>
    <div ref={scroller} onScroll={onScroll} className="chat-pattern relative flex-1 overflow-y-auto px-3 py-2 sm:px-8">
      {loadingMore && <div className="flex justify-center py-2"><Spinner /></div>}
      {!loadingMore && hasMore && msgs.length > 0 && <button className="btn-ghost mx-auto mb-2 flex text-xs" onClick={loadOlder}>Load older messages</button>}
      {loading && !msgs.length ? <div className="flex h-full items-center justify-center"><Spinner /></div> : error ? <ErrorBox error={error} retry={() => load()} /> : visible.length === 0 ? <Empty title="No messages" text="Send the first message below." /> :
        visible.map((m, i) => {
          const prev = visible[i - 1]; const showDate = !prev || new Date(prev.timestamp * 1000).toDateString() !== new Date(m.timestamp * 1000).toDateString(); const grouped = prev && prev.fromMe === m.fromMe && prev.senderId === m.senderId && m.timestamp - prev.timestamp < 300 && !showDate; return <div key={messageKey(m)}>
            {showDate && <div className="my-3 flex justify-center"><span className="rounded-lg bg-surface px-2 py-0.5 text-[11px] text-muted shadow-sm">{new Date(m.timestamp * 1000).toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span></div>}
            {firstUnreadRef.current === m.waMessageId && <div className="my-2 flex justify-center"><span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Unread messages</span></div>}
            <Bubble m={m} grouped={!!grouped} isGroup={isGroup} sessionId={sessionId} quoted={m.quotedMessageId ? byId.get(m.quotedMessageId) ?? null : null} onAction={doAction} onJump={setJumpTo} meName={me?.name} />
          </div>;
        })}
    </div>
    {(!atBottom || newCount > 0) && <button onClick={() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); setNewCount(0); }} className="absolute bottom-24 right-6 flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs shadow-lg border border-border">{newCount > 0 ? `${newCount} new message${newCount > 1 ? "s" : ""}` : ""}<ChevronDown size={14} /></button>}
    <Composer sessionId={sessionId} chatId={chatId} reply={reply} onClearReply={() => setReply(null)} editing={editing} onClearEdit={() => setEditing(null)} disabled={!sessionReady} onSent={(m) => setMsgs((l) => merge(l, [{ ...m, reactions: [] }]))} onEdited={(id, text) => setMsgs((l) => l.map((x) => x.waMessageId === id ? { ...x, body: text, edited: true } : x))} isGroup={isGroup} />
    <ForwardDialog msg={forwardMsg} sessionId={sessionId} onClose={() => setForwardMsg(null)} />
  </>;
}

function Ticks({ status }: { status: string }) {
  if (status === "FAILED") return <AlertCircle size={13} className="text-red-500" />; if (status === "PENDING") return <Clock size={12} className="text-muted" />; if (status === "SENT") return <Check size={13} className="text-muted" />;
  return <CheckCheck size={13} className={status === "READ" || status === "PLAYED" ? "text-sky-500" : "text-muted"} />;
}

function Bubble({ m, grouped, isGroup, sessionId, quoted, onAction, onJump, meName }: { m: Msg; grouped: boolean; isGroup: boolean; sessionId: string; quoted: Msg | null; onAction: (m: Msg, a: string, p?: unknown) => void; onJump: (id: string) => void; meName?: string }) {
  const [menu, setMenu] = useState(false); const [react, setReact] = useState(false);
  const mediaUrl = `/api/v1/messages/${encodeURIComponent(m.waMessageId)}/media?sessionId=${sessionId}`;
  const system = ["e2e_notification", "notification_template", "gp2", "call_log", "ciphertext", "protocol"].includes(m.type);
  if (system) return <div className="my-1 flex justify-center"><span className="rounded-lg bg-surface/80 px-2 py-0.5 text-[11px] text-muted">{m.body ?? m.type.replace(/_/g, " ")}</span></div>;
  const text = m.body ?? m.caption;
  const canEdit = m.fromMe && m.type === "chat" && !m.hasMedia; // WPPConnect editMessage; WhatsApp enforces the 15-minute window server-side
  const meta = m.metadata ?? {};
  return <div id={`msg-${m.waMessageId}`} className={`group relative flex ${m.fromMe ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`} onMouseLeave={() => { setMenu(false); setReact(false); }}>
    <div className={`relative max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm sm:max-w-[65%] ${m.fromMe ? "bg-bubble-out" : "bg-bubble-in"} ${m.revoked ? "italic text-muted" : ""}`}>
      {isGroup && !m.fromMe && !grouped && <p className="mb-0.5 text-[11px] font-semibold text-primary">{m.senderName ?? m.senderId}</p>}
      {m.isForwarded && <p className="mb-0.5 flex items-center gap-1 text-[11px] text-muted"><Forward size={11} /> Forwarded</p>}
      {quoted && <button onClick={() => onJump(quoted.waMessageId)} className="mb-1 block w-full rounded border-l-4 border-primary bg-black/5 px-2 py-1 text-left text-xs dark:bg-white/5"><span className="font-semibold text-primary">{quoted.fromMe ? meName ?? "You" : quoted.senderName ?? "Contact"}</span><p className="truncate text-muted">{quoted.body ?? quoted.caption ?? quoted.type}</p></button>}
      {!quoted && m.quotedMessageId && <div className="mb-1 rounded border-l-4 border-primary bg-black/5 px-2 py-1 text-xs text-muted dark:bg-white/5">Quoted message</div>}
      {m.revoked ? <p>🚫 This message was deleted</p> : <>
        {(m.type === "image" || m.type === "sticker") && <img src={mediaUrl} alt={m.mediaFilename ?? "image"} loading="lazy" className={`mb-1 max-h-80 rounded-md ${m.type === "sticker" ? "h-32 w-32 object-contain" : "object-cover"}`} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />}
        {(m.type === "image" || m.type === "sticker") && <p className="hidden text-xs text-muted">Media unavailable (expired on WhatsApp servers)</p>}
        {m.type === "video" && <video controls preload="metadata" src={mediaUrl} className="mb-1 max-h-80 rounded-md" />}
        {(m.type === "audio" || m.type === "ptt") && <audio controls preload="none" src={mediaUrl} className="mb-1 max-w-full" />}
        {m.type === "document" && <a href={mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-md bg-black/5 p-2 dark:bg-white/5"><FileText size={22} className="text-primary" /><span className="min-w-0"><span className="block truncate text-xs font-medium">{m.mediaFilename ?? "Document"}</span><span className="text-[11px] text-muted">{m.mediaMimeType} {fmtBytes(m.mediaSize)}</span></span><Download size={16} className="ml-auto text-muted" /></a>}
        {m.location && <a href={`https://maps.google.com/?q=${m.location.lat},${m.location.lng}`} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-md bg-black/5 p-2 text-xs dark:bg-white/5"><MapPin size={18} className="text-red-500" />{m.location.name || `${m.location.lat.toFixed(5)}, ${m.location.lng.toFixed(5)}`}</a>}
        {m.type === "vcard" && <div className="mb-1 flex items-center gap-2 rounded-md bg-black/5 p-2 text-xs dark:bg-white/5"><UserRound size={18} />{m.vcard?.match(/FN:(.*)/)?.[1] ?? "Contact card"}</div>}
        {m.type === "poll_creation" && <PollBubble meta={meta} sessionId={sessionId} />}
        {m.type === "product" && <div className="mb-1 rounded-md bg-black/5 p-2 text-xs dark:bg-white/5">🛍️ Product message {String(meta.title ?? "")}</div>}
        {text && m.type !== "vcard" && <p className="whitespace-pre-wrap break-words">{renderText(text)}</p>}
        {!text && !m.hasMedia && !m.location && !["poll_creation", "vcard", "product"].includes(m.type) && <p className="text-xs text-muted">[{m.type}]</p>}
      </>}
      <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted">{m.isStarred && <Star size={10} className="fill-current" />}{m.edited && <span>edited</span>}<span>{fmtTime(m.timestamp)}</span>{m.fromMe && <Ticks status={m.status} />}</div>
      {m.status === "FAILED" && m.errorMessage && <p className="text-[10px] text-red-500">{m.errorMessage}</p>}
      {m.reactions.length > 0 && <div className={`absolute -bottom-3 ${m.fromMe ? "right-1" : "left-1"} flex gap-0.5 rounded-full border border-border bg-surface px-1 text-xs shadow`}>{Object.entries(m.reactions.reduce<Record<string, number>>((a, r) => { a[r.emoji] = (a[r.emoji] || 0) + 1; return a; }, {})).map(([e, n]) => <span key={e}>{e}{n > 1 ? n : ""}</span>)}</div>}
      {!m.revoked && <div className={`absolute top-0 ${m.fromMe ? "-left-16" : "-right-16"} hidden gap-0.5 group-hover:flex`}><button className="rounded-full bg-surface p-1 shadow" onClick={() => setReact(!react)}><Smile size={14} /></button><button className="rounded-full bg-surface p-1 shadow" onClick={() => setMenu(!menu)}><ChevronDown size={14} /></button></div>}
      {react && <div className={`absolute -top-9 z-10 flex gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-lg ${m.fromMe ? "right-0" : "left-0"}`}>{EMOJIS.slice(0, 8).map((e) => <button key={e} className="text-lg hover:scale-125" onClick={() => { onAction(m, "react", e); setReact(false); }}>{e}</button>)}<button className="text-xs text-muted" onClick={() => { onAction(m, "react", false); setReact(false); }}>✕</button></div>}
      {menu && <div className={`card absolute top-6 z-20 w-44 py-1 text-sm shadow-xl ${m.fromMe ? "right-0" : "left-0"}`}>
        {[["reply", "Reply", Reply], ["forward", "Forward", Forward], ["copy", "Copy", Copy], ["star", m.isStarred ? "Unstar" : "Star", Star], ...(m.hasMedia ? [["download", "Download", Download]] : []), ...(canEdit ? [["edit", "Edit", Pencil]] : []), ["deleteLocal", "Delete for me", Trash2], ...(m.fromMe ? [["delete", "Delete for everyone", Trash2]] : [])].map(([a, l, I]) => { const Icon = I as typeof Reply; return <button key={a as string} onClick={() => { setMenu(false); onAction(m, a as string); }} className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-2"><Icon size={14} />{l as string}</button>; })}
      </div>}
    </div>
  </div>;
}
function renderText(t: string) { const parts = t.split(/(https?:\/\/[^\s]+)/g); return parts.map((p, i) => /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer" className="text-sky-600 underline">{p}</a> : <span key={i}>{p.replace(/\*(.+?)\*/g, "$1")}</span>); }

// ---- Poll Bubble ----
function PollBubble({ meta, sessionId }: { meta: Record<string, unknown>; sessionId: string }) {
  const [viewOption, setViewOption] = useState<string | null>(null);
  const pollVotes = meta.pollVotes as Record<string, string[]> | undefined;
  const totalVoters = pollVotes ? Object.keys(pollVotes).length : 0;
  const allVoterIds = pollVotes ? [...new Set(Object.keys(pollVotes))] : [];
  return <>
    <div className="mb-1 w-60 rounded-xl bg-black/5 p-3 text-xs dark:bg-white/5">
      <p className="mb-2.5 text-sm font-semibold">📊 {String(meta.pollName ?? "Poll")}</p>
      <div className="space-y-1.5">
        {Array.isArray(meta.pollOptions) && (meta.pollOptions as { name: string }[]).map((o, i) => {
          const voters = pollVotes ? Object.entries(pollVotes).filter(([, opts]) => opts.includes(o.name)).map(([s]) => s) : [];
          const pct = totalVoters > 0 ? Math.round((voters.length / totalVoters) * 100) : 0;
          return <button key={i} onClick={() => setViewOption(o.name)} className="w-full overflow-hidden rounded-lg border border-border bg-surface text-left transition-opacity hover:opacity-80">
            <div className="relative flex items-center justify-between px-3 py-2">
              <div className="absolute inset-y-0 left-0 bg-primary/25 transition-all duration-500" style={{ width: `${pct}%` }} />
              <span className="relative z-10 font-medium text-[13px]">{o.name}</span>
              <span className="relative z-10 text-[11px] font-semibold text-primary">{voters.length > 0 ? voters.length : ""}</span>
            </div>
            {voters.length > 0 && <div className="flex items-center gap-1 border-t border-border/30 px-3 py-1">
              <div className="flex -space-x-1.5">{voters.slice(0, 4).map((v, vi) => <Avatar key={vi} src={null} name={v.replace("@c.us", "")} size={16} />)}</div>
              {voters.length > 4 && <span className="text-[10px] text-muted">+{voters.length - 4} more</span>}
              <span className="ml-auto text-[10px] text-muted">tap to view</span>
            </div>}
          </button>;
        })}
      </div>
      {totalVoters > 0
        ? <button onClick={() => setViewOption("__all__")} className="mt-2.5 w-full rounded-lg bg-primary/10 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20">View all {totalVoters} {totalVoters === 1 ? "vote" : "votes"}</button>
        : <p className="mt-2 text-[10px] text-muted">No votes yet</p>}
    </div>
    {viewOption && <PollVotersModal sessionId={sessionId} meta={meta} filterOption={viewOption} allVoterIds={allVoterIds} onClose={() => setViewOption(null)} />}
  </>;
}

// ---- Poll Voters Modal ----
function PollVotersModal({ sessionId, meta, filterOption, allVoterIds, onClose }: { sessionId: string; meta: Record<string, unknown>; filterOption: string; allVoterIds: string[]; onClose: () => void }) {
  const pollVotes = meta.pollVotes as Record<string, string[]> | undefined;
  const pollOptions = Array.isArray(meta.pollOptions) ? (meta.pollOptions as { name: string }[]) : [];
  // Fetch contact info for all voters
  const { data: contacts } = useApi<{ items: { waId: string; name: string | null; pushName: string | null; phone: string | null; avatarUrl: string | null }[] }>(
    allVoterIds.length > 0 ? `contacts?sessionId=${sessionId}&limit=100` : null, [sessionId]
  );
  const contactMap = useMemo(() => {
    const m = new Map<string, { name: string | null; pushName: string | null; phone: string | null; avatarUrl: string | null }>();
    contacts?.items?.forEach((c) => m.set(c.waId, c));
    return m;
  }, [contacts]);

  const getVoterDisplay = (voterId: string) => {
    const c = contactMap.get(voterId);
    const phone = voterId.replace("@c.us", "").replace("@g.us", "");
    return { name: c?.name ?? c?.pushName ?? `+${phone}`, phone, avatarUrl: c?.avatarUrl ?? null };
  };

  // Build tabs: "All" + each option
  const tabs = [{ key: "__all__", label: "All" }, ...pollOptions.map((o) => ({ key: o.name, label: o.name }))];
  const [activeTab, setActiveTab] = useState(filterOption);

  const votersForTab = (tab: string): string[] => {
    if (!pollVotes) return [];
    if (tab === "__all__") return [...new Set(Object.keys(pollVotes))];
    return Object.entries(pollVotes).filter(([, opts]) => opts.includes(tab)).map(([s]) => s);
  };

  const currentVoters = votersForTab(activeTab);

  return <Modal open onClose={onClose} title="📊 Poll results" width="max-w-sm">
    <p className="-mt-1 mb-3 text-sm font-semibold text-text">{String(meta.pollName ?? "Poll")}</p>
    {/* Option tabs */}
    <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
      {tabs.map((t) => <button key={t.key} onClick={() => setActiveTab(t.key)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${ activeTab === t.key ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-text" }`}>{t.label} <span className="opacity-70">({votersForTab(t.key).length})</span></button>)}
    </div>
    {/* Voter list */}
    <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
      {currentVoters.length === 0
        ? <p className="py-8 text-center text-xs text-muted">No votes for this option yet</p>
        : currentVoters.map((voterId) => {
            const { name, phone, avatarUrl } = getVoterDisplay(voterId);
            const chosenOpts = pollVotes?.[voterId] ?? [];
            return <div key={voterId} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar src={avatarUrl} name={name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                {name !== `+${phone}` && <p className="truncate text-[11px] text-muted">+{phone}</p>}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {chosenOpts.map((opt, oi) => <span key={oi} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">{opt}</span>)}
              </div>
            </div>;
          })}
    </div>
  </Modal>;
}

// ---------------- Composer ----------------
function Composer({ sessionId, chatId, reply, onClearReply, editing, onClearEdit, disabled, onSent, onEdited, isGroup }: { sessionId: string; chatId: string; reply: Msg | null; onClearReply: () => void; editing: Msg | null; onClearEdit: () => void; disabled: boolean; onSent: (m: Msg) => void; onEdited: (id: string, text: string) => void; isGroup: boolean }) {
  const toast = useToast(); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [emoji, setEmoji] = useState(false); const [attach, setAttach] = useState(false);
  const [files, setFiles] = useState<{ file: File; preview?: string; kind: string }[]>([]); const [progress, setProgress] = useState<string | null>(null); const [dialog, setDialog] = useState<"location" | "contact" | "template" | "poll" | null>(null); const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); const typingTimer = useRef<NodeJS.Timeout | null>(null); const lastTyping = useRef(0);
  const [recording, setRecording] = useState(false); const recorder = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]);
  useEffect(() => { if (editing) setText(editing.body ?? ""); }, [editing]);
  const addFiles = (list: FileList | File[]) => { const arr = Array.from(list).map((file) => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined, kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document" })); setFiles((f) => [...f, ...arr]); setAttach(false); };
  const onTyping = () => { const now = Date.now(); if (now - lastTyping.current > 4000 && !disabled) { lastTyping.current = now; api(`chats/${encodeURIComponent(chatId)}/typing?sessionId=${sessionId}`, { method: "POST", json: { state: "typing" } }).catch(() => { }); } if (typingTimer.current) clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => api(`chats/${encodeURIComponent(chatId)}/typing?sessionId=${sessionId}`, { method: "POST", json: { state: "stop" } }).catch(() => { }), 5000); };
  const send = async () => {
    if (busy || disabled) return;
    if (editing) { if (!text.trim()) return; setBusy(true); try { await api(`messages/${encodeURIComponent(editing.waMessageId)}?sessionId=${sessionId}`, { method: "PATCH", json: { text } }); onEdited(editing.waMessageId, text); setText(""); onClearEdit(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } return; }
    if (!text.trim() && !files.length) return;
    setBusy(true);
    try {
      if (files.length) {
        for (let i = 0; i < files.length; i++) { const f = files[i]; setProgress(`Uploading ${i + 1}/${files.length} · ${f.file.name}`); const base64 = await fileToBase64(f.file); const m = await api<Msg>(`messages?sessionId=${sessionId}`, { method: "POST", json: { type: "media", chatId, base64, mimeType: f.file.type || "application/octet-stream", filename: f.file.name, caption: i === 0 && text.trim() ? text : undefined, quotedMessageId: i === 0 ? reply?.waMessageId : undefined, kind: f.kind === "sticker" ? "sticker" : undefined } }); onSent(m); }
        setFiles([]); setProgress(null);
      } else { const m = await api<Msg>(`messages?sessionId=${sessionId}`, { method: "POST", json: { type: "text", chatId, text, quotedMessageId: reply?.waMessageId, mentionedList: isGroup ? [...text.matchAll(/@(\d{6,})/g)].map((x) => `${x[1]}@c.us`) : undefined } }); onSent(m); }
      setText(""); onClearReply();
    } catch (e) { toast.error(`Unable to send message: ${(e as Error).message}`); setProgress(null); } finally { setBusy(false); }
  };
  const toggleRecord = async () => {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "audio/webm" }); chunks.current = []; mr.ondataavailable = (e) => chunks.current.push(e.data); mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks.current, { type: mr.mimeType }); const file = new File([blob], `voice-${Date.now()}.${mr.mimeType.includes("ogg") ? "ogg" : "webm"}`, { type: mr.mimeType }); setBusy(true); try { const m = await api<Msg>(`messages?sessionId=${sessionId}`, { method: "POST", json: { type: "media", chatId, base64: await fileToBase64(file), mimeType: file.type, filename: file.name, kind: "ptt" } }); onSent(m); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }; mr.start(); recorder.current = mr; setRecording(true); api(`chats/${encodeURIComponent(chatId)}/typing?sessionId=${sessionId}`, { method: "POST", json: { state: "recording" } }).catch(() => { }); }
    catch { toast.error("Microphone access denied"); }
  };
  return <div className={`shrink-0 border-t border-border bg-surface p-2 ${drag ? "ring-2 ring-primary" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
    {disabled && <p className="mb-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">Session is not READY – messages cannot be sent right now.</p>}
    {reply && <div className="mb-1 flex items-center gap-2 rounded border-l-4 border-primary bg-surface-2 px-2 py-1 text-xs"><Reply size={14} /><div className="min-w-0 flex-1"><p className="font-semibold text-primary">{reply.fromMe ? "You" : reply.senderName ?? "Contact"}</p><p className="truncate text-muted">{reply.body ?? reply.caption ?? reply.type}</p></div><button onClick={onClearReply}><X size={14} /></button></div>}
    {editing && <div className="mb-1 flex items-center gap-2 rounded border-l-4 border-amber-500 bg-surface-2 px-2 py-1 text-xs"><Pencil size={14} /><span className="flex-1">Editing message</span><button onClick={() => { onClearEdit(); setText(""); }}><X size={14} /></button></div>}
    {files.length > 0 && <div className="mb-1 flex gap-2 overflow-x-auto">{files.map((f, i) => <div key={i} className="relative flex shrink-0 items-center gap-2 rounded-lg border border-border p-1.5 text-xs">{f.preview ? <img src={f.preview} alt="" className="h-12 w-12 rounded object-cover" /> : <FileText size={20} />}<div><p className="max-w-[120px] truncate">{f.file.name}</p><p className="text-muted">{f.file.type || "file"} · {fmtBytes(f.file.size)}</p>{f.kind === "image" && <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" onChange={(e) => setFiles((l) => l.map((x, j) => j === i ? { ...x, kind: e.target.checked ? "sticker" : "image" } : x))} /> as sticker</label>}</div><button className="absolute -right-1 -top-1 rounded-full bg-surface p-0.5 shadow" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}><X size={12} /></button></div>)}</div>}
    {progress && <p className="mb-1 flex items-center gap-1 text-xs text-muted"><Loader2 size={12} className="animate-spin" /> {progress}</p>}
    <div className="flex items-end gap-1">
      <div className="relative"><button className="btn-ghost p-2" onClick={() => setEmoji(!emoji)} disabled={disabled}><Smile size={20} /></button>{emoji && <div className="card absolute bottom-12 left-0 z-20 grid w-56 grid-cols-8 gap-1 p-2 shadow-xl">{EMOJIS.map((e) => <button key={e} className="text-lg hover:bg-surface-2" onClick={() => { setText((t) => t + e); setEmoji(false); }}>{e}</button>)}</div>}</div>
      <div className="relative"><button className="btn-ghost p-2" onClick={() => setAttach(!attach)} disabled={disabled}><Paperclip size={20} /></button>{attach && <div className="card absolute bottom-12 left-0 z-20 w-44 py-1 text-sm shadow-xl">
        <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-2" onClick={() => fileRef.current?.click()}><ImageIcon size={15} /> Photo / Video / File</button>
        <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-2" onClick={() => { setDialog("location"); setAttach(false); }}><MapPin size={15} /> Location</button>
        <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-2" onClick={() => { setDialog("contact"); setAttach(false); }}><UserRound size={15} /> Contact</button>
        <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-2" onClick={() => { setDialog("template"); setAttach(false); }}><FileText size={15} /> Template</button>
        <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-2" onClick={() => { setDialog("poll"); setAttach(false); }}><ListChecks size={15} /> Poll</button>
        <button className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-2" onClick={() => { fileRef.current?.setAttribute("accept", "image/*"); fileRef.current?.click(); }}><Sticker size={15} /> Sticker (image)</button>
      </div>}<input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; e.target.removeAttribute("accept"); }} /></div>
      <textarea className="input max-h-40 min-h-[40px] flex-1 resize-none py-2" rows={1} placeholder={disabled ? "Session not ready" : "Type a message"} value={text} disabled={disabled} onChange={(e) => { setText(e.target.value); onTyping(); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
      {text.trim() || files.length ? <button className="btn-primary p-2" onClick={send} disabled={busy || disabled}>{busy ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}</button> : <button className={`p-2 ${recording ? "btn-danger" : "btn-ghost"}`} onClick={toggleRecord} disabled={disabled || busy} title="Record voice note"><Mic size={20} /></button>}
    </div>
    <LocationDialog open={dialog === "location"} onClose={() => setDialog(null)} onSend={async (p) => { const m = await api<Msg>(`messages?sessionId=${sessionId}`, { method: "POST", json: { type: "location", chatId, ...p } }); onSent(m); }} />
    <ContactPicker open={dialog === "contact"} sessionId={sessionId} onClose={() => setDialog(null)} onPick={async (c) => { const m = await api<Msg>(`messages?sessionId=${sessionId}`, { method: "POST", json: { type: "contact", chatId, contactId: c.waId, name: c.name } }); onSent(m); }} />
    <TemplatePicker open={dialog === "template"} onClose={() => setDialog(null)} onPick={async (t, vars) => { const m = await api<Msg>(`messages?sessionId=${sessionId}`, { method: "POST", json: { type: "template", chatId, templateId: t, variables: vars } }); onSent(m); }} />
    <PollDialog open={dialog === "poll"} onClose={() => setDialog(null)} onSend={async (p) => { const m = await api<Msg>(`messages?sessionId=${sessionId}`, { method: "POST", json: { type: "poll", chatId, ...p } }); onSent(m); }} />
  </div>;
}

function LocationDialog({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (p: { lat: number; lng: number; name?: string }) => Promise<void> }) {
  const [lat, setLat] = useState(""); const [lng, setLng] = useState(""); const [name, setName] = useState(""); const toast = useToast();
  return <Modal open={open} onClose={onClose} title="Send location" width="max-w-sm" footer={<><button className="btn-secondary" onClick={() => navigator.geolocation?.getCurrentPosition((p) => { setLat(String(p.coords.latitude)); setLng(String(p.coords.longitude)); })}>Use my location</button><button className="btn-primary" onClick={async () => { try { await onSend({ lat: Number(lat), lng: Number(lng), name: name || undefined }); onClose(); } catch (e) { toast.error((e as Error).message); } }} disabled={!lat || !lng}>Send</button></>}>
    <div className="grid grid-cols-2 gap-2"><Field label="Latitude"><input className="input" value={lat} onChange={(e) => setLat(e.target.value)} /></Field><Field label="Longitude"><input className="input" value={lng} onChange={(e) => setLng(e.target.value)} /></Field></div><Field label="Name (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field></Modal>;
}
function PollDialog({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (p: { name: string; choices: string[] }) => Promise<void> }) {
  const [name, setName] = useState(""); const [choices, setChoices] = useState("Yes\nNo"); const toast = useToast();
  return <Modal open={open} onClose={onClose} title="Create poll" width="max-w-sm" footer={<button className="btn-primary" onClick={async () => { try { await onSend({ name, choices: choices.split("\n").map((c) => c.trim()).filter(Boolean) }); onClose(); } catch (e) { toast.error((e as Error).message); } }} disabled={!name}>Send poll</button>}><Field label="Question"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Options (one per line)"><textarea className="input" rows={4} value={choices} onChange={(e) => setChoices(e.target.value)} /></Field></Modal>;
}
export function ContactPicker({ open, sessionId, onClose, onPick, multi, onPickMany }: { open: boolean; sessionId: string; onClose: () => void; onPick?: (c: { waId: string; name: string }) => Promise<void>; multi?: boolean; onPickMany?: (c: { waId: string; name: string }[]) => Promise<void> }) {
  const [q, setQ] = useState(""); const [sel, setSel] = useState<Map<string, string>>(new Map()); const toast = useToast();
  const { data } = useApi<{ items: { id: string; waId: string; name: string | null; pushName: string | null; phone: string | null; avatarUrl: string | null }[] }>(open ? `contacts?sessionId=${sessionId}&limit=50&q=${encodeURIComponent(q)}` : null, [q, open]);
  return <Modal open={open} onClose={onClose} title={multi ? "Select contacts" : "Send contact"} width="max-w-md" footer={multi && <button className="btn-primary" disabled={!sel.size} onClick={async () => { try { await onPickMany?.([...sel].map(([waId, name]) => ({ waId, name }))); setSel(new Map()); onClose(); } catch (e) { toast.error((e as Error).message); } }}>Confirm ({sel.size})</button>}>
    <input className="input mb-2" placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
    <div className="max-h-80 divide-y divide-border overflow-y-auto">{data?.items.map((c) => { const name = c.name ?? c.pushName ?? c.phone ?? c.waId; return <button key={c.id} className={`flex w-full items-center gap-2 px-1 py-2 text-left text-sm hover:bg-surface-2 ${sel.has(c.waId) ? "bg-primary/10" : ""}`} onClick={async () => { if (multi) { setSel((s) => { const n = new Map(s); if (n.has(c.waId)) n.delete(c.waId); else n.set(c.waId, name); return n; }); return; } try { await onPick?.({ waId: c.waId, name }); onClose(); } catch (e) { toast.error((e as Error).message); } }}><Avatar src={c.avatarUrl} name={name} size={32} /><span className="min-w-0 flex-1 truncate">{name}</span><span className="text-xs text-muted">{c.phone ? `+${c.phone}` : c.waId}</span></button>; })}{data?.items.length === 0 && <p className="py-6 text-center text-xs text-muted">No contacts</p>}</div></Modal>;
}
function TemplatePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string, vars: Record<string, string>) => Promise<void> }) {
  const { data } = useApi<{ id: string; name: string; body: string; variables: string[]; category: string }[]>(open ? "templates" : null, [open]); const [sel, setSel] = useState<string | null>(null); const [vars, setVars] = useState<Record<string, string>>({}); const toast = useToast();
  const t = data?.find((x) => x.id === sel);
  return <Modal open={open} onClose={onClose} title="Send template" width="max-w-md" footer={<button className="btn-primary" disabled={!sel} onClick={async () => { try { await onPick(sel!, vars); onClose(); } catch (e) { toast.error((e as Error).message); } }}>Send</button>}>
    <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">{data?.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`block w-full px-3 py-2 text-left text-sm hover:bg-surface-2 ${sel === x.id ? "bg-primary/10" : ""}`}><p className="font-medium">{x.name} <Badge>{x.category}</Badge></p><p className="truncate text-xs text-muted">{x.body}</p></button>)}{data?.length === 0 && <p className="py-6 text-center text-xs text-muted">No templates yet</p>}</div>
    {t && t.variables.filter((v) => !["name", "first_name", "last_name", "phone", "email", "company", "wa_id"].includes(v)).length > 0 && <div className="mt-3 space-y-2"><p className="text-xs text-muted">Campaign variables (contact fields are filled automatically):</p>{t.variables.filter((v) => !["name", "first_name", "last_name", "phone", "email", "company", "wa_id"].includes(v)).map((v) => <Field key={v} label={`{{${v}}}`}><input className="input" value={vars[v] ?? ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} /></Field>)}</div>}
  </Modal>;
}
function ForwardDialog({ msg, sessionId, onClose }: { msg: Msg | null; sessionId: string; onClose: () => void }) {
  const [q, setQ] = useState(""); const toast = useToast(); const { data } = useApi<ChatRow[]>(msg ? `chats?sessionId=${sessionId}&limit=30&q=${encodeURIComponent(q)}` : null, [q, msg?.id]);
  return <Modal open={!!msg} onClose={onClose} title="Forward to…" width="max-w-md"><input className="input mb-2" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /><div className="max-h-80 divide-y divide-border overflow-y-auto">{data?.map((c) => <button key={c.id} className="flex w-full items-center gap-2 px-1 py-2 text-left text-sm hover:bg-surface-2" onClick={async () => { try { await api(`messages/${encodeURIComponent(msg!.waMessageId)}/forward?sessionId=${sessionId}`, { method: "POST", json: { to: [c.waId] } }); toast.success(`Forwarded to ${c.displayName}`); onClose(); } catch (e) { toast.error((e as Error).message); } }}><Avatar src={c.avatarUrl} name={c.displayName} size={32} />{c.displayName}</button>)}</div></Modal>;
}

// ---------------- Contact panel ----------------
function ContactPanel({ sessionId, chatId, chat, onClose, labels, onChanged }: { sessionId: string; chatId: string; chat: ChatRow | null; onClose: () => void; labels: { id: string; name: string; color: string }[]; onChanged: () => void }) {
  const toast = useToast(); const { data: users } = useApi<{ id: string; name: string }[]>("users");
  const { data, reload } = useApi<{ chat: ChatRow | null; contact: (Record<string, unknown> & { id: string; optedOut: boolean; isBlocked: boolean; notes: string | null; email: string | null; company: string | null; about: string | null; phone: string | null }) | null; group: { subject: string; description: string | null; participantCount: number } | null }>(`chats/${encodeURIComponent(chatId)}?sessionId=${sessionId}`, [chatId]);
  const contact = data?.contact; const [notes, setNotes] = useState(""); const [wa, setWa] = useState<{ about: string | null; picture: string | null; presence: { isOnline: boolean | null; lastSeen: number | boolean | null } | null } | null>(null);
  const { data: full } = useApi<{ labels: { id: string }[]; customFields: Record<string, string>; campaigns: { id: string; name: string; status: string }[]; stats: { total: number; sent: number; received: number } }>(contact ? `contacts/${contact.id}` : null, [contact?.id]);
  useEffect(() => { setNotes(contact?.notes ?? ""); if (contact) api<typeof wa>(`contacts/${contact.id}/whatsapp`).then(setWa).catch(() => { }); }, [contact?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = async (body: Record<string, unknown>) => { if (!contact) return; try { await api(`contacts/${contact.id}`, { method: "PATCH", json: body }); reload(true); onChanged(); toast.success("Saved"); } catch (e) { toast.error((e as Error).message); } };
  const chatAction = async (path: string, body?: unknown) => { try { await api(`chats/${encodeURIComponent(chatId)}/${path}?sessionId=${sessionId}`, { method: "POST", json: body ?? {} }); onChanged(); toast.success("Done"); } catch (e) { toast.error((e as Error).message); } };
  const isGroup = chatId.endsWith("@g.us");
  return <aside className="fixed inset-y-0 right-0 z-30 flex w-full flex-col overflow-y-auto border-l border-border bg-surface md:static md:w-80 xl:w-96">
    <div className="flex h-14 items-center gap-2 border-b border-border px-3"><button className="btn-ghost p-1" onClick={onClose}><X size={18} /></button><span className="text-sm font-semibold">{isGroup ? "Group info" : "Contact info"}</span></div>
    <div className="flex flex-col items-center gap-2 p-4 text-center"><Avatar src={wa?.picture ?? chat?.avatarUrl} name={chat?.displayName} size={96} /><h3 className="text-lg font-semibold">{chat?.displayName}</h3><p className="text-sm text-muted">{chat?.phone ? `+${chat.phone}` : chatId}</p>{wa?.about && <p className="text-xs italic text-muted">“{wa.about}”</p>}{wa?.presence && <p className="text-[11px] text-muted">{wa.presence.isOnline ? "online" : typeof wa.presence.lastSeen === "number" ? `last seen ${relTime(wa.presence.lastSeen)}` : "last seen hidden"}</p>}</div>
    <div className="space-y-4 px-4 pb-6 text-sm">
      <div className="flex flex-wrap gap-1"><button className="btn-secondary py-1 text-xs" onClick={() => chatAction("pin", { value: !chat?.isPinned })}><Pin size={12} /> {chat?.isPinned ? "Unpin" : "Pin"}</button><button className="btn-secondary py-1 text-xs" onClick={() => chatAction("archive", { value: !chat?.isArchived })}><Archive size={12} /> {chat?.isArchived ? "Unarchive" : "Archive"}</button><button className="btn-secondary py-1 text-xs" onClick={() => chatAction("mute", { time: 8, type: "hours" })}><BellOff size={12} /> Mute 8h</button><button className="btn-secondary py-1 text-xs" onClick={() => chatAction("unseen")}>Mark unread</button></div>
      {isGroup && data?.group && <div className="card p-3 text-xs"><p className="font-semibold">{data.group.subject}</p><p className="text-muted">{data.group.participantCount} participants</p>{data.group.description && <p className="mt-1 whitespace-pre-wrap">{data.group.description}</p>}<a href={`/groups/${encodeURIComponent(chatId)}`} className="mt-2 block text-primary">Manage group →</a></div>}
      {contact && <>
        <div><p className="label">CRM labels</p><div className="flex flex-wrap gap-1">{labels.map((l) => { const on = full?.labels.some((x) => x.id === l.id); return <button key={l.id} onClick={() => patch({ labelIds: on ? full!.labels.filter((x) => x.id !== l.id).map((x) => x.id) : [...(full?.labels.map((x) => x.id) ?? []), l.id] })} className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: l.color, opacity: on ? 1 : 0.35 }}>{l.name}</button>; })}{labels.length === 0 && <span className="text-xs text-muted">No labels defined</span>}</div></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Email"><input className="input" defaultValue={contact.email ?? ""} onBlur={(e) => e.target.value !== (contact.email ?? "") && patch({ email: e.target.value })} /></Field><Field label="Company"><input className="input" defaultValue={contact.company ?? ""} onBlur={(e) => e.target.value !== (contact.company ?? "") && patch({ company: e.target.value })} /></Field></div>
        <Field label="Assigned to"><select className="input" value={(contact.ownerUserId as string) ?? ""} onChange={(e) => patch({ ownerUserId: e.target.value || null })}><option value="">Unassigned</option>{users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Notes"><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (contact.notes ?? "") && patch({ notes })} /></Field>
        {full && Object.keys(full.customFields).length > 0 && <div><p className="label">Custom fields</p>{Object.entries(full.customFields).map(([k, v]) => <p key={k} className="text-xs"><span className="text-muted">{k}:</span> {v}</p>)}</div>}
        <div className="flex items-center justify-between rounded-lg border border-border p-2 text-xs"><span>Marketing opt-in</span><button className={`badge ${contact.optedOut ? "bg-red-500/15 text-red-600" : "bg-green-500/15 text-green-600"}`} onClick={() => patch({ optedOut: !contact.optedOut, optedIn: contact.optedOut })}>{contact.optedOut ? "Opted out" : "Opted in"}</button></div>
        <div className="flex items-center justify-between rounded-lg border border-border p-2 text-xs"><span>Block on WhatsApp</span><button className="btn-secondary py-1 text-xs" onClick={async () => { try { await api(`contacts/${contact.id}/${contact.isBlocked ? "unblock" : "block"}`, { method: "POST" }); reload(true); toast.success(contact.isBlocked ? "Unblocked" : "Blocked"); } catch (e) { toast.error((e as Error).message); } }}>{contact.isBlocked ? "Unblock" : "Block"}</button></div>
        {full && <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="card p-2"><p className="text-lg font-semibold">{full.stats.total}</p><p className="text-muted">messages</p></div><div className="card p-2"><p className="text-lg font-semibold">{full.stats.sent}</p><p className="text-muted">sent</p></div><div className="card p-2"><p className="text-lg font-semibold">{full.stats.received}</p><p className="text-muted">received</p></div></div>}
        {full && full.campaigns.length > 0 && <div><p className="label">Campaign history</p>{full.campaigns.map((c) => <p key={c.id} className="flex justify-between text-xs"><a href={`/campaigns/${c.id}`} className="text-primary">{c.name}</a><Badge>{c.status}</Badge></p>)}</div>}
        <a href={`/contacts/${contact.id}`} className="block text-center text-xs text-primary">Open full CRM profile →</a>
      </>}
      {!contact && !isGroup && <p className="text-xs text-muted">No CRM record yet. It is created automatically on first sync/message.</p>}
    </div>
    <MoreVertical className="hidden" />
  </aside>;
}
