import { powerAt, sampleSizePerArm } from './lib/stats';

const C = { cy: '#22d3ee', vi: '#a78bfa', li: '#a3e635', ro: '#fb7185', am: '#fbbf24', mut: '#7f8db0', line: 'rgba(120,160,255,.18)' };
export { C };

export function Ring({ value, color, label, size = 150 }: { value: number; color: string; label: string; size?: number }) {
  const r = size / 2 - 12, c = 2 * Math.PI * r;
  return (<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${(value * 100).toFixed(0)}%`}>
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth="10" />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dasharray .8s' }} />
    <text x="50%" y="48%" textAnchor="middle" fill="#e8eefc" fontSize="28" fontWeight="600" fontFamily="JetBrains Mono">{(value * 100).toFixed(0)}%</text>
    <text x="50%" y="62%" textAnchor="middle" fill={C.mut} fontSize="10">{label}</text></svg>);
}

export function Posterior({ samples, ci }: { samples: number[]; ci: [number, number] }) {
  const W = 520, H = 190, P = 26, bins = 42;
  const lo = Math.min(...samples, ci[0]), hi = Math.max(...samples, ci[1]), bw = (hi - lo) / bins || 1;
  const h = new Array(bins).fill(0); samples.forEach(s => { h[Math.min(bins - 1, Math.floor((s - lo) / bw))]++; });
  const mx = Math.max(...h, 1); const x = (v: number) => P + ((v - lo) / (hi - lo || 1)) * (W - 2 * P);
  return (<svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Posterior distribution of relative lift">
    {h.map((c, i) => { const v = lo + i * bw, bh = (c / mx) * (H - 50); return <rect key={i} x={x(v)} y={H - 28 - bh} width={(W - 2 * P) / bins - 1} height={bh} rx="2" fill={v + bw / 2 >= 0 ? C.li : C.ro} opacity=".75" />; })}
    {lo < 0 && hi > 0 && <><line x1={x(0)} x2={x(0)} y1={8} y2={H - 28} stroke="#fff" strokeDasharray="4" opacity=".6" /><text x={x(0) + 4} y={16} fill="#fff" fontSize="10" opacity=".7">no change</text></>}
    <line x1={x(ci[0])} x2={x(ci[1])} y1={H - 12} y2={H - 12} stroke={C.cy} strokeWidth="3" strokeLinecap="round" />
    <text x={P} y={H - 1} fill={C.mut} fontSize="10">{(lo * 100).toFixed(1)}%</text><text x={W - P} y={H - 1} fill={C.mut} fontSize="10" textAnchor="end">{(hi * 100).toFixed(1)}%</text>
    <text x={W / 2} y={H - 1} fill={C.cy} fontSize="10" textAnchor="middle">95% credible interval</text></svg>);
}

export function Forest({ items }: { items: { label: string; est: number; lo: number; hi: number }[] }) {
  const W = 520, rowH = 44, H = items.length * rowH + 30, P = 110;
  const all = items.flatMap(i => [i.lo, i.hi, 0]); const lo = Math.min(...all), hi = Math.max(...all);
  const x = (v: number) => P + ((v - lo) / (hi - lo || 1)) * (W - P - 20);
  return (<svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Forest plot of effect sizes with confidence intervals">
    <line x1={x(0)} x2={x(0)} y1={6} y2={H - 22} stroke="#fff" strokeDasharray="4" opacity=".5" />
    {items.map((it, i) => { const y = 24 + i * rowH, good = it.lo > 0, bad = it.hi < 0, col = good ? C.li : bad ? C.ro : C.am;
      return <g key={it.label}><text x={0} y={y + 4} fill="#e8eefc" fontSize="12">{it.label}</text>
        <line x1={x(it.lo)} x2={x(it.hi)} y1={y} y2={y} stroke={col} strokeWidth="3" strokeLinecap="round" /><circle cx={x(it.est)} cy={y} r="6" fill={col} style={{ filter: `drop-shadow(0 0 6px ${col})` }} />
        <text x={x(it.est)} y={y + 20} fill={C.mut} fontSize="10" textAnchor="middle">{(it.est * 100).toFixed(1)}%</text></g>; })}
    <text x={x(0)} y={H - 6} fill={C.mut} fontSize="10" textAnchor="middle">0 (no effect)</text></svg>);
}

export function PowerCurve({ base, mde, perDay }: { base: number; mde: number; perDay: number }) {
  const W = 560, H = 230, P = 38; const need = sampleSizePerArm(base, mde); const maxN = need * 2;
  const pts = Array.from({ length: 41 }, (_, i) => { const n = Math.max(50, (maxN * i) / 40); return [n, powerAt(base, mde, n)] as const; });
  const x = (n: number) => P + (n / maxN) * (W - P - 14), y = (p: number) => H - 30 - p * (H - 50);
  const d = pts.map(([n, p], i) => `${i ? 'L' : 'M'}${x(n)},${y(p)}`).join(' ');
  return (<svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Statistical power versus sample size">
    {[0, .25, .5, .75, 1].map(g => <g key={g}><line x1={P} x2={W - 14} y1={y(g)} y2={y(g)} stroke={C.line} /><text x={P - 6} y={y(g) + 3} fill={C.mut} fontSize="10" textAnchor="end">{g * 100}%</text></g>)}
    <path d={`${d} L${x(maxN)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#pg)" opacity=".35" /><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.cy} /><stop offset="1" stopColor="transparent" /></linearGradient></defs>
    <path d={d} fill="none" stroke={C.cy} strokeWidth="2.5" style={{ filter: `drop-shadow(0 0 6px ${C.cy})` }} />
    <line x1={P} x2={x(need)} y1={y(.8)} y2={y(.8)} stroke={C.li} strokeDasharray="4" /><line x1={x(need)} x2={x(need)} y1={y(.8)} y2={y(0)} stroke={C.li} strokeDasharray="4" />
    <circle cx={x(need)} cy={y(.8)} r="6" fill={C.li} style={{ filter: `drop-shadow(0 0 8px ${C.li})` }} />
    <text x={x(need)} y={y(0) + 16} fill={C.li} fontSize="11" textAnchor="middle">{need.toLocaleString()} / arm · {Math.ceil((2 * need) / Math.max(perDay, 1))} days</text>
    <text x={W / 2} y={H - 2} fill={C.mut} fontSize="10" textAnchor="middle">users per arm →</text></svg>);
}

export function HBars({ items, fmt }: { items: { label: string; value: number; color: string; sub?: string }[]; fmt: (v: number) => string }) {
  const mx = Math.max(...items.map(i => Math.abs(i.value)), 1e-9);
  return (<div style={{ display: 'grid', gap: 12 }}>{items.map(i => (<div key={i.label}>
    <div className="row between sm"><b>{i.label}</b><span className="mono" style={{ color: i.color }}>{fmt(i.value)}</span></div>
    <div style={{ height: 10, background: 'rgba(120,160,255,.08)', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}><div style={{ width: `${(Math.abs(i.value) / mx) * 100}%`, height: '100%', background: i.color, boxShadow: `0 0 12px ${i.color}`, borderRadius: 99, transition: 'width .6s' }} /></div>
    {i.sub && <div className="mut sm" style={{ marginTop: 3 }}>{i.sub}</div>}</div>))}</div>);
}
