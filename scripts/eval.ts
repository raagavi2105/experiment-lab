// Reproducible evaluation of ExperimentLab's statistics and root-cause engine.
// Every number reported in the README comes from this script (fixed seeds).
//   npm run eval
import { writeFileSync } from 'node:fs';
import { rng, twoProportionZ, welchT, srmCheck, sampleSizePerArm, cuped, mean, variance } from '../src/lib/stats';
import { adtributor, Row } from '../src/lib/rootcause';

const out: Record<string, unknown> = {};
const R = rng(20261102);
const binom = (n: number, p: number) => {
  // normal approximation is fine for n*p*(1-p) >> 10; exact for small n
  if (n * p * (1 - p) > 50) return Math.max(0, Math.min(n, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * R.normal())));
  let x = 0; for (let i = 0; i < n; i++) if (R.uniform() < p) x++; return x;
};

// 1. A/A tests: false-positive rate should be ~ alpha
{
  const sims = 5000, n = 20000, p = 0.1;
  let fp = 0;
  for (let i = 0; i < sims; i++) if (twoProportionZ(binom(n, p), n, binom(n, p), n).p < 0.05) fp++;
  out.aa_false_positive_rate = { sims, nPerArm: n, rate: fp / sims, nominal: 0.05 };
}

// 2. Power: using our own sample-size calculator, empirical power should be ~ 80%
{
  const rows: unknown[] = [];
  for (const mde of [0.03, 0.05, 0.10]) {
    const base = 0.1, n = sampleSizePerArm(base, mde);
    const sims = 3000; let hit = 0;
    for (let i = 0; i < sims; i++) if (twoProportionZ(binom(n, base), n, binom(n, base * (1 + mde)), n).p < 0.05) hit++;
    rows.push({ relMde: mde, nPerArm: n, empiricalPower: hit / sims, targetPower: 0.8 });
  }
  out.power_calibration = rows;
}

// 3. CUPED: variance reduction and power gain on a correlated continuous metric
{
  const rho = 0.7, n = 1500, effect = 0.08, sims = 2000;
  let hitRaw = 0, hitCuped = 0, vr = 0;
  for (let i = 0; i < sims; i++) {
    const gen = (lift: number) => {
      const x: number[] = [], y: number[] = [];
      for (let k = 0; k < n; k++) {
        const pre = R.normal();
        x.push(pre);
        y.push(rho * pre + Math.sqrt(1 - rho * rho) * R.normal() + lift);
      }
      return { x, y };
    };
    const c = gen(0), t = gen(effect);
    if (welchT(c.y, t.y).p < 0.05) hitRaw++;
    const allX = [...c.x, ...t.x], allY = [...c.y, ...t.y];
    const { theta, varReduction } = cuped(allY, allX);
    const mx = mean(allX);
    const adj = (d: { x: number[]; y: number[] }) => d.y.map((v, k) => v - theta * (d.x[k] - mx));
    vr += varReduction;
    if (welchT(adj(c), adj(t)).p < 0.05) hitCuped++;
  }
  out.cuped = { rho, theoreticalVarReduction: rho * rho, measuredVarReduction: vr / sims, powerWithout: hitRaw / sims, powerWith: hitCuped / sims, nPerArm: n, effectSd: effect };
}

// 4. SRM detector: false alarms under a true 50/50, and detection of a 48.5/51.5 split
{
  const sims = 5000, n = 100000;
  let fa = 0, det = 0;
  for (let i = 0; i < sims; i++) {
    const tOk = binom(n, 0.5), tBad = binom(n, 0.515);
    if (srmCheck(n - tOk, tOk).mismatch) fa++;
    if (srmCheck(n - tBad, tBad).mismatch) det++;
  }
  out.srm = { sims, totalUsers: n, falseAlarmRate: fa / sims, detectionRateAt51_5pct: det / sims, threshold: 'p < 0.001' };
}

// 5. Root-cause: Adtributor vs a naive "largest absolute drop" baseline
{
  const dims: Record<string, string[]> = {
    country: ['IN', 'US', 'BR', 'DE', 'GB', 'ID', 'MX', 'FR'],
    platform: ['android', 'ios', 'web'],
    version: ['v1', 'v2', 'v3', 'v4', 'v5'],
    channel: ['organic', 'paid', 'referral', 'direct'],
  };
  const trials = 1000;
  let adtTop1Dim = 0, adtTop1El = 0, naiveTop1El = 0, naiveTop1Dim = 0;
  for (let t = 0; t < trials; t++) {
    const dn = Object.keys(dims);
    const anomDim = dn[Math.floor(R.uniform() * dn.length)];
    const anomVal = dims[anomDim][Math.floor(R.uniform() * dims[anomDim].length)];
    const rows: Row[] = [];
    const weights: Record<string, number[]> = {};
    for (const d of dn) { const w = dims[d].map(() => R.gamma(1.2)); const s = w.reduce((a, b) => a + b, 0); weights[d] = w.map(x => x / s); }
    const drift = 0.97; // everything drifts down 3% (seasonality) - a decoy for naive methods
    const drop = 0.25 + R.uniform() * 0.35;
    const idx = (d: string, v: string) => dims[d].indexOf(v);
    const build = (i: number[], path: string[]) => {
      if (path.length === dn.length) {
        const cell: Record<string, string> = {};
        dn.forEach((d, k) => (cell[d] = path[k]));
        let base = 1e6;
        dn.forEach((d, k) => (base *= weights[d][idx(d, path[k])]));
        const noise = () => 1 + 0.02 * R.normal();
        const hit = cell[anomDim] === anomVal;
        rows.push({ dims: cell, baseline: base * noise(), current: base * noise() * drift * (hit ? 1 - drop : 1) });
        return;
      }
      const d = dn[path.length];
      for (const v of dims[d]) build(i, [...path, v]);
    };
    build([], []);
    const res = adtributor(rows);
    const top = res.causes[0];
    if (top?.dimension === anomDim) adtTop1Dim++;
    if (top?.dimension === anomDim && top.elements.some(e => e.value === anomVal)) adtTop1El++;

    // naive baseline: element with the largest absolute decline across all dims
    let best = { d: '', v: '', delta: 0 };
    for (const d of dn) for (const v of dims[d]) {
      let b = 0, c = 0; for (const r of rows) if (r.dims[d] === v) { b += r.baseline; c += r.current; }
      if (c - b < best.delta) best = { d, v, delta: c - b };
    }
    if (best.d === anomDim) naiveTop1Dim++;
    if (best.d === anomDim && best.v === anomVal) naiveTop1El++;
  }
  out.root_cause = {
    trials,
    scenario: 'one dimension-value drops 25-60%, global 3% drift, 2% noise, 4 dimensions, 160 cells',
    adtributor: { dimensionAccuracy: adtTop1Dim / trials, dimensionAndElementAccuracy: adtTop1El / trials },
    naiveLargestDrop: { dimensionAccuracy: naiveTop1Dim / trials, dimensionAndElementAccuracy: naiveTop1El / trials },
  };
}

// helper to keep variance import used (tree-shaking guard for lint)
void variance;

writeFileSync(new URL('../eval-results.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
