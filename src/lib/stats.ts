// Core statistics for ExperimentLab. Pure functions, no dependencies,
// so the same code runs in the browser and in the evaluation scripts.

export function mean(x: number[]): number {
  let s = 0;
  for (const v of x) s += v;
  return s / x.length;
}

export function variance(x: number[]): number {
  const m = mean(x);
  let s = 0;
  for (const v of x) s += (v - m) ** 2;
  return s / (x.length - 1);
}

export function cov(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my);
  return s / (x.length - 1);
}

// ---- distributions ----
export function normCdf(z: number): number {
  // Abramowitz-Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function normInv(p: number): number {
  // Acklam's approximation
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q: number, r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= ph) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function lgamma(z: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gammaP(a: number, x: number): number {
  // regularized lower incomplete gamma (series / continued fraction)
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 200; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-12) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

export function chi2Sf(x: number, df: number): number {
  return 1 - gammaP(df / 2, x / 2);
}

// ---- seeded RNG (for reproducible evals and Monte Carlo) ----
export function rng(seed: number) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(uniform(), 1e-12), v = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const gamma = (k: number): number => {
    if (k < 1) return gamma(k + 1) * Math.pow(uniform(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number, v: number;
      do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v ** 3;
      const u = uniform();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const beta = (a: number, b: number) => { const x = gamma(a), y = gamma(b); return x / (x + y); };
  return { uniform, normal, gamma, beta };
}

// ---- frequentist tests ----
export interface TestResult {
  effect: number;       // absolute difference (treatment - control)
  relEffect: number;    // relative lift
  se: number;
  z: number;
  p: number;
  ci: [number, number];
}

export function twoProportionZ(xC: number, nC: number, xT: number, nT: number, alpha = 0.05): TestResult {
  const pC = xC / nC, pT = xT / nT;
  const pooled = (xC + xT) / (nC + nT);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / nC + 1 / nT));
  const z = sePooled === 0 ? 0 : (pT - pC) / sePooled;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  const se = Math.sqrt((pC * (1 - pC)) / nC + (pT * (1 - pT)) / nT);
  const zc = normInv(1 - alpha / 2);
  const effect = pT - pC;
  return { effect, relEffect: pC === 0 ? NaN : effect / pC, se, z, p, ci: [effect - zc * se, effect + zc * se] };
}

export function welchT(c: number[], t: number[], alpha = 0.05): TestResult {
  const mC = mean(c), mT = mean(t);
  const se = Math.sqrt(variance(c) / c.length + variance(t) / t.length);
  const z = se === 0 ? 0 : (mT - mC) / se; // n is large in practice; normal approx
  const p = 2 * (1 - normCdf(Math.abs(z)));
  const zc = normInv(1 - alpha / 2);
  const effect = mT - mC;
  return { effect, relEffect: mC === 0 ? NaN : effect / mC, se, z, p, ci: [effect - zc * se, effect + zc * se] };
}

// ---- sample ratio mismatch ----
export function srmCheck(nC: number, nT: number, expectedShareT = 0.5) {
  const n = nC + nT;
  const eT = n * expectedShareT, eC = n - eT;
  const chi2 = (nC - eC) ** 2 / eC + (nT - eT) ** 2 / eT;
  const p = chi2Sf(chi2, 1);
  return { chi2, p, mismatch: p < 0.001 };
}

// ---- power / sample size ----
export function sampleSizePerArm(baseline: number, mde: number, alpha = 0.05, power = 0.8): number {
  // relative MDE on a proportion
  const p1 = baseline, p2 = baseline * (1 + mde);
  const za = normInv(1 - alpha / 2), zb = normInv(power);
  const pbar = (p1 + p2) / 2;
  const num = (za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  return Math.ceil(num / (p2 - p1) ** 2);
}

// ---- CUPED variance reduction ----
export function cuped(y: number[], x: number[], xMeanAll?: number): { adjusted: number[]; theta: number; varReduction: number } {
  const theta = cov(y, x) / variance(x);
  const mx = xMeanAll ?? mean(x);
  const adjusted = y.map((v, i) => v - theta * (x[i] - mx));
  const varReduction = 1 - variance(adjusted) / variance(y);
  return { adjusted, theta, varReduction };
}

// ---- Bayesian beta-binomial ----
export function bayesBinary(xC: number, nC: number, xT: number, nT: number, draws = 20000, seed = 7) {
  const r = rng(seed);
  let wins = 0, liftSum = 0;
  const lifts: number[] = [];
  for (let i = 0; i < draws; i++) {
    const pC = r.beta(1 + xC, 1 + nC - xC);
    const pT = r.beta(1 + xT, 1 + nT - xT);
    if (pT > pC) wins++;
    const l = (pT - pC) / pC;
    liftSum += l; lifts.push(l);
  }
  const sample = lifts.filter((_, i) => i % 10 === 0);
  lifts.sort((a, b) => a - b);
  return { posterior: sample, probTreatmentBetter: wins / draws, expectedLift: liftSum / draws, credible95: [lifts[Math.floor(draws * 0.025)], lifts[Math.floor(draws * 0.975)]] as [number, number] };
}

// ---- decision logic ----
export interface Guardrail { name: string; result: TestResult; higherIsBetter: boolean; maxRelDrop: number; }

export function decide(primary: TestResult, srm: { mismatch: boolean }, guardrails: Guardrail[], alpha = 0.05) {
  const reasons: string[] = [];
  if (srm.mismatch) return { verdict: 'INVALID' as const, reasons: ['Sample ratio mismatch detected: randomization or logging is broken. Do not trust this result.'] };
  const sig = primary.p < alpha;
  const harmed = guardrails.filter(g => {
    const r = g.result;
    const worse = g.higherIsBetter ? r.relEffect < -g.maxRelDrop && r.p < alpha : r.relEffect > g.maxRelDrop && r.p < alpha;
    return worse;
  });
  if (harmed.length) {
    reasons.push(`Guardrail harmed: ${harmed.map(h => h.name).join(', ')}.`);
    return { verdict: 'DO NOT SHIP' as const, reasons };
  }
  if (sig && primary.effect > 0) { reasons.push('Primary metric improved significantly; no guardrail violations.'); return { verdict: 'SHIP' as const, reasons }; }
  if (sig && primary.effect < 0) { reasons.push('Primary metric got significantly worse.'); return { verdict: 'DO NOT SHIP' as const, reasons }; }
  reasons.push('No statistically significant effect on the primary metric. Consider a larger sample or a bigger change.');
  return { verdict: 'INCONCLUSIVE' as const, reasons };
}

// ---- power curve: analytic power of a two-proportion test at n per arm ----
export function powerAt(baseline: number, relMde: number, nPerArm: number, alpha = 0.05): number {
  const p1 = baseline, p2 = baseline * (1 + relMde);
  const se = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / nPerArm);
  return normCdf(Math.abs(p2 - p1) / se - normInv(1 - alpha / 2));
}

// ---- peeking simulator: A/A tests checked at every look vs once at the end ----
export function simulatePeeking(looks: number, perLook: number, sims = 1500, p = 0.1, seed = 99) {
  const r = rng(seed);
  let anyHit = 0, finalHit = 0;
  const sd = Math.sqrt(p * (1 - p));
  for (let s = 0; s < sims; s++) {
    let sumC = 0, sumT = 0, hitEver = false, hitFinal = false;
    for (let l = 1; l <= looks; l++) {
      sumC += perLook * p + Math.sqrt(perLook) * sd * r.normal();
      sumT += perLook * p + Math.sqrt(perLook) * sd * r.normal();
      const n = l * perLook, pc = sumC / n, pt = sumT / n, pool = (pc + pt) / 2;
      const se = Math.sqrt(pool * (1 - pool) * 2 / n);
      const pv = 2 * (1 - normCdf(Math.abs((pt - pc) / se)));
      if (pv < 0.05) { hitEver = true; if (l === looks) hitFinal = true; }
    }
    if (hitEver) anyHit++; if (hitFinal) finalHit++;
  }
  return { peekingFalsePositive: anyHit / sims, singleLookFalsePositive: finalHit / sims, sims, looks };
}
