"use client";
/** Lightweight dependency-free SVG charts. */
export function BarChart({ data, series, height = 180 }: { data: { label: string; values: number[] }[]; series: { name: string; color: string }[]; height?: number }) {
  if (!data.length) return <p className="py-8 text-center text-xs text-muted">No data</p>;
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const bw = 100 / data.length;
  return <div><svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="w-full" style={{ height }}>{data.map((d, i) => d.values.map((v, j) => { const w = bw / (series.length + 1); const h = (v / max) * (height / 3 - 4); return <rect key={`${i}-${j}`} x={i * bw + w / 2 + j * w} y={height / 3 - h} width={w * 0.9} height={h} fill={series[j].color} rx={0.5}><title>{d.label} · {series[j].name}: {v}</title></rect>; }))}</svg>
    <div className="mt-1 flex justify-between text-[10px] text-muted">{data.filter((_, i) => i % Math.ceil(data.length / 7) === 0).map((d) => <span key={d.label}>{d.label}</span>)}</div>
    <div className="mt-2 flex gap-3 text-[11px] text-muted">{series.map((s) => <span key={s.name} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}</div></div>;
}
const PALETTE = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b", "#14b8a6"];
export function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <p className="py-8 text-center text-xs text-muted">No data</p>;
  const r = 15.9;
  const segments = data.reduce<{ d: { label: string; value: number }; pct: number; offset: number }[]>((arr, d) => { const offset = arr.reduce((a, s) => a + s.pct, 0); return [...arr, { d, pct: (d.value / total) * 100, offset }]; }, []);
  return <div className="flex items-center gap-4"><svg viewBox="0 0 42 42" className="h-32 w-32 -rotate-90">{segments.map((s, i) => <circle key={s.d.label} cx={21} cy={21} r={r} fill="transparent" stroke={PALETTE[i % PALETTE.length]} strokeWidth={5} strokeDasharray={`${s.pct} ${100 - s.pct}`} strokeDashoffset={-s.offset}><title>{s.d.label}: {s.d.value}</title></circle>)}</svg>
    <ul className="space-y-1 text-xs">{data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{d.label}<span className="text-muted">{d.value} ({Math.round((d.value / total) * 100)}%)</span></li>)}</ul></div>;
}
