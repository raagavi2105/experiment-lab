// Root-cause analysis for a metric drop, based on the Adtributor algorithm
// (Bhagwan et al., NSDI 2014): per dimension, find the elements that explain
// most of the change (explanatory power, EP) and that changed unusually
// relative to their share (surprise, Jensen-Shannon divergence).

export interface Row { dims: Record<string, string>; baseline: number; current: number; }

export interface Cause {
  dimension: string;
  elements: { value: string; ep: number; surprise: number; baseline: number; current: number; delta: number }[];
  totalEp: number;
  totalSurprise: number;
}

function js(p: number, q: number): number {
  const m = (p + q) / 2;
  const t = (a: number) => (a > 0 && m > 0 ? a * Math.log(a / m) : 0);
  return 0.5 * (t(p) + t(q));
}

export function adtributor(rows: Row[], opts: { tEp?: number; tEep?: number; maxElements?: number } = {}): { totalDelta: number; causes: Cause[] } {
  const tEp = opts.tEp ?? 0.1;   // min explanatory power per element
  const tEep = opts.tEep ?? 0.67; // stop once elements jointly explain this much
  const maxEl = opts.maxElements ?? 3;
  const totalBase = rows.reduce((s, r) => s + r.baseline, 0);
  const totalCur = rows.reduce((s, r) => s + r.current, 0);
  const totalDelta = totalCur - totalBase;
  const dimNames = rows.length ? Object.keys(rows[0].dims) : [];
  const causes: Cause[] = [];

  for (const dim of dimNames) {
    const agg = new Map<string, { b: number; c: number }>();
    for (const r of rows) {
      const k = r.dims[dim];
      const e = agg.get(k) ?? { b: 0, c: 0 };
      e.b += r.baseline; e.c += r.current;
      agg.set(k, e);
    }
    const els = [...agg.entries()].map(([value, v]) => ({
      value, baseline: v.b, current: v.c, delta: v.c - v.b,
      ep: totalDelta === 0 ? 0 : (v.c - v.b) / totalDelta,
      surprise: js(totalBase ? v.b / totalBase : 0, totalCur ? v.c / totalCur : 0),
    }));
    // elements that move in the same direction as the total, ranked by surprise
    const cand = els.filter(e => e.ep >= tEp).sort((a, b) => b.surprise - a.surprise);
    const picked: typeof cand = [];
    let ep = 0;
    for (const e of cand) {
      picked.push(e); ep += e.ep;
      if (ep >= tEep || picked.length >= maxEl) break;
    }
    if (picked.length) {
      causes.push({ dimension: dim, elements: picked, totalEp: ep, totalSurprise: picked.reduce((s, e) => s + e.surprise, 0) });
    }
  }
  causes.sort((a, b) => b.totalSurprise - a.totalSurprise);
  return { totalDelta, causes };
}
