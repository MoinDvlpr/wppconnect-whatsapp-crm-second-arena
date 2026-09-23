"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Loader2 } from "lucide-react";
import { api } from "@/lib/client/api";

function LoginForm() {
  const router = useRouter(); const params = useSearchParams();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setError(null); try { await api("/api/auth/login", { method: "POST", json: { email, password } }); router.replace(params.get("next") || "/dashboard"); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } };
  return <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6 shadow-xl">
    <div className="flex items-center gap-2"><div className="rounded-lg bg-primary p-2 text-primary-fg"><MessageSquare size={20} /></div><div><h1 className="text-lg font-semibold">{process.env.NEXT_PUBLIC_APP_NAME || "WhatsApp CRM"}</h1><p className="text-xs text-muted">Sign in to your workspace</p></div></div>
    <label className="block"><span className="label">Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
    <label className="block"><span className="label">Password</span><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
    {error && <p className="text-sm text-red-600">{error}</p>}
    <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Sign in</button>
    <p className="text-center text-[11px] text-muted">Default admin: admin@example.com / admin12345 (change after first login)</p>
  </form>;
}
export default function LoginPage() { return <div className="flex min-h-screen items-center justify-center bg-bg p-4"><Suspense><LoginForm /></Suspense></div>; }
