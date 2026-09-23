"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X, CheckCircle2, AlertCircle, Info, Loader2 } from "lucide-react";

// ---------- Toasts ----------
interface Toast { id: number; kind: "success" | "error" | "info"; text: string }
const ToastCtx = createContext<{ push: (kind: Toast["kind"], text: string) => void }>({ push: () => {} });
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => { const id = Date.now() + Math.random(); setItems((l) => [...l, { id, kind, text }]); setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4500); }, []);
  return <ToastCtx.Provider value={{ push }}>{children}
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">{items.map((t) => (
      <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${t.kind === "success" ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300" : t.kind === "error" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "border-border bg-surface text-text"}`}>
        {t.kind === "success" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : t.kind === "error" ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}<span className="break-words">{t.text}</span></div>))}</div>
  </ToastCtx.Provider>;
}
export function useToast() { const { push } = useContext(ToastCtx); return { success: (t: string) => push("success", t), error: (t: string) => push("error", t), info: (t: string) => push("info", t) }; }

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, width = "max-w-lg", footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose} role="dialog" aria-modal>
    <div className={`card w-full ${width} max-h-[92vh] flex flex-col shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3"><h2 className="text-base font-semibold">{title}</h2><button onClick={onClose} className="btn-ghost p-1" aria-label="Close"><X size={18} /></button></div>
      <div className="overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
    </div></div>;
}
export function Confirm({ open, onClose, onConfirm, title, text, danger }: { open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: string; text: string; danger?: boolean }) {
  const [busy, setBusy] = useState(false);
  return <Modal open={open} onClose={onClose} title={title} width="max-w-md" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{busy && <Loader2 size={14} className="animate-spin" />}Confirm</button></>}><p className="text-sm text-muted">{text}</p></Modal>;
}

// ---------- Primitives ----------
export function Badge({ children, color = "gray", className = "" }: { children: ReactNode; color?: string; className?: string }) {
  const map: Record<string, string> = { gray: "bg-surface-2 text-muted", green: "bg-green-500/15 text-green-700 dark:text-green-300", red: "bg-red-500/15 text-red-700 dark:text-red-300", yellow: "bg-amber-500/15 text-amber-700 dark:text-amber-300", blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300", purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300" };
  return <span className={`badge ${map[color] ?? map.gray} ${className}`}>{children}</span>;
}
export function statusColor(s: string) { if (["READY", "CONNECTED", "COMPLETED", "SENT", "DELIVERED", "READ", "SUCCESS", "SUPPORTED"].includes(s)) return "green"; if (["ERROR", "FAILED", "CANCELLED", "DISCONNECTED"].includes(s)) return "red"; if (["QR", "STARTING", "AUTHENTICATING", "RUNNING", "QUEUED", "SENDING", "PENDING", "PAUSED", "PARTIAL", "DEPRECATED"].includes(s)) return "yellow"; if (["DRAFT", "STOPPED", "SKIPPED"].includes(s)) return "gray"; return "blue"; }
export function StatusBadge({ status }: { status: string }) { return <Badge color={statusColor(status)}>{status}</Badge>; }
export function Spinner({ className = "" }: { className?: string }) { return <Loader2 size={18} className={`animate-spin text-muted ${className}`} />; }
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">{icon && <div className="text-muted">{icon}</div>}<h3 className="text-sm font-semibold">{title}</h3>{text && <p className="max-w-sm text-xs text-muted">{text}</p>}{action && <div className="mt-2">{action}</div>}</div>;
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) { return <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"><span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span>{retry && <button className="btn-secondary py-1" onClick={retry}>Retry</button>}</div>; }
export function Skeleton({ rows = 5 }: { rows?: number }) { return <div className="space-y-2 p-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>; }
export function Avatar({ src, name, size = 40, className = "" }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  const initials = (name || "?").split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const hue = [...(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (src && !err) return <img src={src} alt="" width={size} height={size} onError={() => setErr(true)} className={`shrink-0 rounded-full object-cover ${className}`} style={{ width: size, height: size }} />;
  return <div className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`} style={{ width: size, height: size, fontSize: size / 2.6, background: `hsl(${hue} 45% 50%)` }}>{initials}</div>;
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) { return <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold tracking-tight">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div><div className="flex flex-wrap items-center gap-2">{actions}</div></div>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}</label>; }
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (v: string) => void }) {
  return <div className="flex gap-1 overflow-x-auto border-b border-border">{tabs.map((t) => <button key={t.id} onClick={() => onChange(t.id)} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${value === t.id ? "border-primary font-medium text-text" : "border-transparent text-muted hover:text-text"}`}>{t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[10px]">{t.count}</span>}</button>)}</div>;
}
export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: string; icon?: ReactNode }) { return <div className="card flex items-start justify-between p-4"><div><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>{sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}</div>{icon && <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>}</div>; }
export function Table<T>({ cols, rows, empty, keyFn, onRow }: { cols: { h: string; c: (r: T) => ReactNode; w?: string }[]; rows: T[]; empty?: string; keyFn: (r: T) => string; onRow?: (r: T) => void }) {
  return <div className="card overflow-x-auto"><table className="w-full min-w-[600px]"><thead className="border-b border-border bg-surface-2/60"><tr>{cols.map((c) => <th key={c.h} className="th" style={{ width: c.w }}>{c.h}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{rows.length === 0 ? <tr><td colSpan={cols.length} className="py-10 text-center text-sm text-muted">{empty ?? "No records"}</td></tr> : rows.map((r) => <tr key={keyFn(r)} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "cursor-pointer hover:bg-surface-2/60" : ""}>{cols.map((c) => <td key={c.h} className="td">{c.c(r)}</td>)}</tr>)}</tbody></table></div>;
}
