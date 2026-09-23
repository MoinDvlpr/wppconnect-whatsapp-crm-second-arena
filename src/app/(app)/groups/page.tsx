"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Search, UsersRound, LogIn } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { useShell } from "@/components/shell";
import { Avatar, Badge, Empty, ErrorBox, Field, Modal, PageHeader, Skeleton, useToast } from "@/components/ui";
import { ContactPicker } from "../inbox/page";

interface Group { id: string; waId: string; subject: string | null; description: string | null; participantCount: number; isAnnounce: boolean | null; isRestricted: boolean | null; avatarUrl: string | null }
export default function GroupsPage() {
  const { sessionId, can } = useShell(); const toast = useToast(); const [q, setQ] = useState(""); const [create, setCreate] = useState(false); const [join, setJoin] = useState(false); const [name, setName] = useState(""); const [pick, setPick] = useState(false); const [members, setMembers] = useState<{ waId: string; name: string }[]>([]); const [code, setCode] = useState("");
  const { data, loading, error, reload } = useApi<Group[]>(sessionId ? `groups?sessionId=${sessionId}&q=${encodeURIComponent(q)}&limit=200` : null, [sessionId, q]);
  return <div>
    <PageHeader title="Groups" subtitle="WhatsApp groups of the selected session" actions={can("OPERATOR") && <><button className="btn-secondary" onClick={() => setJoin(true)}><LogIn size={16} /> Join via link</button><button className="btn-primary" onClick={() => setCreate(true)}><Plus size={16} /> New group</button></>} />
    <div className="relative mb-3 w-72"><Search size={14} className="absolute left-2.5 top-2.5 text-muted" /><input className="input pl-8" placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {error ? <ErrorBox error={error} retry={() => reload()} /> : loading && !data ? <Skeleton /> : !data?.length ? <Empty icon={<UsersRound size={36} />} title="No groups" text="Groups are synced when the session connects." /> :
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.map((g) => <Link key={g.id} href={`/groups/${encodeURIComponent(g.waId)}`} className="card flex items-center gap-3 p-3 hover:bg-surface-2/60"><Avatar src={g.avatarUrl} name={g.subject} size={44} /><div className="min-w-0"><p className="truncate font-medium">{g.subject ?? g.waId}</p><p className="text-xs text-muted">{g.participantCount} participants</p><div className="mt-1 flex gap-1">{g.isAnnounce && <Badge>announce only</Badge>}{g.isRestricted && <Badge>restricted</Badge>}</div></div></Link>)}</div>}
    <Modal open={create} onClose={() => setCreate(false)} title="Create group" footer={<button className="btn-primary" disabled={!name || !members.length} onClick={async () => { try { await api(`groups?sessionId=${sessionId}`, { method: "POST", json: { name, participants: members.map((m) => m.waId) } }); toast.success("Group created"); setCreate(false); setMembers([]); setName(""); reload(true); } catch (e) { toast.error((e as Error).message); } }}>Create</button>}>
      <Field label="Group name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="mt-3"><button className="btn-secondary" onClick={() => setPick(true)}>Select participants ({members.length})</button><div className="mt-2 flex flex-wrap gap-1">{members.map((m) => <Badge key={m.waId}>{m.name}</Badge>)}</div></div>
    </Modal>
    <Modal open={join} onClose={() => setJoin(false)} title="Join group" width="max-w-sm" footer={<button className="btn-primary" disabled={!code} onClick={async () => { try { await api(`groups/join?sessionId=${sessionId}`, { method: "POST", json: { inviteCode: code } }); toast.success("Joined"); setJoin(false); } catch (e) { toast.error((e as Error).message); } }}>Join</button>}><Field label="Invite link or code"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://chat.whatsapp.com/…" /></Field></Modal>
    {sessionId && <ContactPicker open={pick} sessionId={sessionId} multi onClose={() => setPick(false)} onPickMany={async (c) => setMembers(c)} />}
  </div>;
}
