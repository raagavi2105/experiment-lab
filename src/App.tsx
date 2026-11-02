import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { twoProportionZ, welchT, srmCheck, sampleSizePerArm, cuped, bayesBinary, decide, mean, simulatePeeking } from './lib/stats';
import { adtributor, type Row } from './lib/rootcause';
import { parseCsv, sampleExperiment, sampleDrop, toCsv, type ExpUser } from './lib/data';
import { Ring, Posterior, Forest, PowerCurve, HBars, C } from './charts';
import ev from './eval-results.json';

const pct = (x: number, d = 1) => (isFinite(x) ? (x * 100).toFixed(d) + '%' : 'n/a');
type Page = 'home' | 'plan' | 'analyze' | 'diagnose' | 'peek' | 'proof';

const I = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Mission', icon: I('M3 11l9-8 9 8M5 10v10h14V10') },
  { id: 'plan', label: 'Plan', icon: I('M4 19V9m6 10V5m6 14v-7m4 7H2') },
  { id: 'analyze', label: 'Analyze', icon: I('M4 4v16h16M8 14l3-4 3 3 5-7') },
  { id: 'diagnose', label: 'Diagnose', icon: I('M11 4a7 7 0 100 14 7 7 0 000-14zm10 17l-5-5') },
  { id: 'peek', label: 'Peek lab', icon: I('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z') },
  { id: 'proof', label: 'Proof', icon: I('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
];

async function explain(payload: unknown): Promise<string> {
  const r = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed'); return d.text;
}
function Memo({ payload }: { payload: unknown }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  return (<div>
    <button className="btn" onClick={async () => { setBusy(true); setErr(''); try { setText(await explain(payload)); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>{busy ? '◌ Writing memo…' : '✦ Draft decision memo (AI)'}</button>
    {err && <p className="mut sm">{err}</p>}{text && <div className="memo fade" style={{ marginTop: 12 }}>{text}</div>}</div>);
}
const Head = ({ crumb, title, sub }: { crumb: string; title: string; sub: string }) => (<div style={{ marginBottom: 20 }}><div className="crumb">// {crumb}</div><h1>{title}</h1><p className="mut" style={{ margin: 0, maxWidth: 680 }}>{sub}</p></div>);
const Stat = ({ v, l, c }: { v: string; l: string; c?: string }) => <div className="glass stat"><b style={{ color: c }}>{v}</b><span>{l}</span></div>;

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [exp, setExp] = useState<ExpUser[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || e.metaKey || e.ctrlKey) return; const i = Number(e.key); if (i >= 1 && i <= NAV.length) setPage(NAV[i - 1].id); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  return (<div className="app">
    <nav className="rail" aria-label="Main"><div className="brand">Ex</div>
      {NAV.map((n, i) => <button key={n.id} className={`nv ${page === n.id ? 'on' : ''}`} onClick={() => setPage(n.id)} aria-label={n.label}>{n.icon}{n.label}<kbd>{i + 1}</kbd></button>)}</nav>
    <main className="main fade" key={page}>
      {page === 'home' && <Home go={setPage} loadDemo={() => { setExp(sampleExperiment()); setRows(sampleDrop()); setPage('analyze'); }} />}
      {page === 'plan' && <Plan />}
      {page === 'analyze' && <Analyze data={exp} setData={setExp} />}
      {page === 'diagnose' && <Diagnose rows={rows} setRows={setRows} />}
      {page === 'peek' && <Peek />}
      {page === 'proof' && <Proof />}
    </main></div>);
}

function Home({ go, loadDemo }: { go: (p: Page) => void; loadDemo: () => void }) {
  const tiles: [Page, string, string, string][] = [
    ['plan', '01 · PLAN', 'Size the test before you run it', 'How many users, how many days, and what lift you can realistically detect.'],
    ['analyze', '02 · ANALYZE', 'Ship, hold or kill', 'Frequentist + Bayesian read, guardrails, SRM check and CUPED, ending in a clear call.'],
    ['diagnose', '03 · DIAGNOSE', 'Why did the metric drop?', 'Pinpoints the country, platform or version responsible, with ranked evidence.'],
    ['peek', '04 · PEEK LAB', 'See why peeking breaks tests', 'Run a live simulation of how checking early inflates false positives.'],
  ];
  return (<div>
    <div className="glass glow" style={{ padding: 'clamp(22px,4vw,44px)', marginBottom: 18 }}><div className="scan" />
      <div className="crumb">// experiment decision cockpit</div>
      <h1 style={{ fontSize: 'clamp(34px,6vw,64px)', maxWidth: 820 }}>Make launch decisions you can <span style={{ background: 'linear-gradient(90deg,var(--cy),var(--vi))', WebkitBackgroundClip: 'text', color: 'transparent' }}>defend.</span></h1>
      <p className="mut" style={{ maxWidth: 640, fontSize: 17 }}>Plan an A/B test, read the result honestly, and trace a metric drop to its cause. All the statistics run in your browser and are validated by simulation.</p>
      <div className="row" style={{ marginTop: 18 }}><button className="btn pri" onClick={loadDemo}>▶ Run the demo mission</button><button className="btn" onClick={() => go('plan')}>Start planning</button></div></div>
    <div className="grid c2">{tiles.map(t => <div key={t[0]} className="glass tile" onClick={() => go(t[0])}><div className="n">{t[1]}</div><h2>{t[2]}</h2><p className="mut" style={{ margin: 0 }}>{t[3]}</p></div>)}</div>
    <p className="mut sm" style={{ marginTop: 18 }}>Tip: press <span className="mono">1–6</span> to jump between sections.</p></div>);
}

function Plan() {
  const [base, setBase] = useState(0.1), [mde, setMde] = useState(0.05), [perDay, setPerDay] = useState(5000);
  const n = sampleSizePerArm(base, mde), days = Math.ceil((2 * n) / Math.max(perDay, 1));
  return (<div><Head crumb="01 plan" title="Size your test" sub="Choose the smallest lift worth detecting. The cost in users and days is the real trade-off." />
    <div className="grid c2"><div className="glass"><div className="grid c3" style={{ gridTemplateColumns: '1fr' }}>
      <div><label>Baseline conversion · {pct(base)}</label><input type="range" min="0.01" max="0.6" step="0.005" value={base} onChange={e => setBase(Number(e.target.value))} /></div>
      <div><label>Min. detectable lift · {pct(mde, 0)} relative</label><input type="range" min="0.01" max="0.3" step="0.01" value={mde} onChange={e => setMde(Number(e.target.value))} /></div>
      <div><label>Eligible users / day</label><input type="number" value={perDay} onChange={e => setPerDay(Number(e.target.value))} /></div></div>
      <div className="grid c3" style={{ marginTop: 16 }}><Stat v={n.toLocaleString()} l="users per arm" c={C.cy} /><Stat v={String(days)} l="days to run" c={C.li} /></div></div>
      <div className="glass"><h3>Power curve</h3><PowerCurve base={base} mde={mde} perDay={perDay} /><p className="mut sm" style={{ marginBottom: 0 }}>80% power, α = 0.05. The green dot is where you can reliably detect the lift.</p></div></div>
    <div className="glass" style={{ marginTop: 16 }}><h3>The trade-off</h3><table><thead><tr><th>Lift to detect</th><th>Users / arm</th><th>Days</th></tr></thead><tbody>
      {[0.02, 0.05, 0.1, 0.2].map(m => { const s = sampleSizePerArm(base, m); return <tr key={m}><td className="mono">{pct(m, 0)}</td><td className="mono">{s.toLocaleString()}</td><td className="mono">{Math.ceil((2 * s) / Math.max(perDay, 1))}</td></tr>; })}</tbody></table>
      <p className="mut sm" style={{ marginBottom: 0 }}>Halving the detectable lift roughly quadruples the sample you need.</p></div></div>);
}

function Analyze({ data, setData }: { data: ExpUser[]; setData: (d: ExpUser[]) => void }) {
  const [hb, setHb] = useState(true), [useCuped, setUseCuped] = useState(true);
  const res = useMemo(() => {
    const c = data.filter(d => d.variant === 'control'), t = data.filter(d => d.variant === 'treatment'); if (c.length < 2 || t.length < 2) return null;
    const xC = c.reduce((s, d) => s + d.converted, 0), xT = t.reduce((s, d) => s + d.converted, 0);
    const primary = twoProportionZ(xC, c.length, xT, t.length), bayes = bayesBinary(xC, c.length, xT, t.length), srm = srmCheck(c.length, t.length);
    const hasV = [...c, ...t].every(d => d.value !== undefined), hasP = hasV && [...c, ...t].every(d => d.pre !== undefined);
    let guard = null as null | ReturnType<typeof welchT>, cu = null as null | { r: ReturnType<typeof welchT>; vr: number };
    if (hasV) { guard = welchT(c.map(d => d.value!), t.map(d => d.value!));
      if (hasP) { const X = [...c, ...t].map(d => d.pre!), Y = [...c, ...t].map(d => d.value!), { theta, varReduction } = cuped(Y, X), mx = mean(X), adj = (a: ExpUser[]) => a.map(d => d.value! - theta * (d.pre! - mx)); cu = { r: welchT(adj(c), adj(t)), vr: varReduction }; } }
    const g = useCuped && cu ? cu.r : guard;
    const verdict = decide(primary, srm, g ? [{ name: 'value metric', result: g, higherIsBetter: hb, maxRelDrop: 0.02 }] : []);
    const needN = primary.effect !== 0 ? sampleSizePerArm(xC / c.length, Math.abs(primary.relEffect)) : Infinity;
    return { nC: c.length, nT: t.length, pC: xC / c.length, pT: xT / t.length, primary, bayes, srm, guard, cu, g, verdict, needN };
  }, [data, hb, useCuped]);
  const tag = res ? ({ SHIP: 'SHIP', 'DO NOT SHIP': 'DONT', INCONCLUSIVE: 'INCON', INVALID: 'INVALID' } as const)[res.verdict.verdict] : 'INCON';
  const load = (f: File) => f.text().then(t => setData(parseCsv(t).map(r => ({ variant: r.variant === 'treatment' ? 'treatment' : 'control', converted: Number(r.converted), value: r.value ? Number(r.value) : undefined, pre: r.pre ? Number(r.pre) : undefined }))));
  return (<div><Head crumb="02 analyze" title="Should we ship it?" sub="Upload experiment results and get a defensible call: significance, probability of winning, guardrails and data-quality checks." />
    <div className="glass" style={{ marginBottom: 16 }}><div className="row between"><div className="row">
      <label className="btn" style={{ margin: 0, textTransform: 'none', fontFamily: 'inherit', fontSize: 15, color: 'var(--tx)', letterSpacing: 0 }}>⬆ Upload CSV<input type="file" accept=".csv" hidden onChange={e => e.target.files?.[0] && load(e.target.files[0])} /></label>
      <button className="btn pri" onClick={() => setData(sampleExperiment())}>▶ Load sample experiment</button>
      <button className="btn sm" onClick={() => { const s = sampleExperiment(); const b = new Blob([toCsv(s.map(x => ({ variant: x.variant, converted: x.converted, value: x.value!.toFixed(2), pre: x.pre!.toFixed(2) })))], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sample-experiment.csv'; a.click(); }}>Download template</button></div>
      <div className="row"><select value={String(hb)} onChange={e => setHb(e.target.value === 'true')} style={{ width: 'auto' }}><option value="true">Guardrail: higher is better</option><option value="false">Guardrail: lower is better</option></select>
        <label style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={useCuped} onChange={e => setUseCuped(e.target.checked)} style={{ width: 'auto' }} />CUPED</label></div></div>
      <p className="mut sm" style={{ marginBottom: 0 }}>CSV columns: <span className="mono">variant</span> (control/treatment), <span className="mono">converted</span> (0/1), optional <span className="mono">value</span> and <span className="mono">pre</span>.</p></div>
    {!res && <div className="glass dropz mut">No data yet. Load the sample experiment to see a full read-out.</div>}
    {res && <div className="grid fade">
      <div className="glass glow"><div className="verdict"><div><h3>Verdict</h3><div className={`vtag ${tag}`} style={{ marginTop: 10, display: 'inline-block' }}>{res.verdict.verdict}</div><p className="mut" style={{ maxWidth: 420 }}>{res.verdict.reasons.join(' ')}</p>
        {res.verdict.verdict === 'INCONCLUSIVE' && isFinite(res.needN) && <p className="sm" style={{ color: C.am }}>To detect the observed lift reliably you would need about {res.needN.toLocaleString()} users per arm (you have {Math.min(res.nC, res.nT).toLocaleString()}).</p>}</div>
        <Ring value={res.bayes.probTreatmentBetter} color={res.bayes.probTreatmentBetter > .95 ? C.li : res.bayes.probTreatmentBetter > .8 ? C.am : C.ro} label="P(treatment wins)" /></div></div>
      <div className="grid c4"><Stat v={`${res.nC.toLocaleString()} / ${res.nT.toLocaleString()}`} l="control / treatment" /><Stat v={`${pct(res.pC, 2)} → ${pct(res.pT, 2)}`} l="conversion" c={C.cy} /><Stat v={pct(res.primary.relEffect)} l="relative lift" c={res.primary.effect > 0 ? C.li : C.ro} /><Stat v={res.primary.p < 0.0001 ? '<0.0001' : res.primary.p.toFixed(4)} l="p-value" /><Stat v={res.srm.p.toFixed(3)} l={res.srm.mismatch ? 'SRM: MISMATCH' : 'SRM check: healthy'} c={res.srm.mismatch ? C.ro : C.li} /></div>
      <div className="grid c2"><div className="glass"><h3>Where the true lift likely sits</h3><Posterior samples={res.bayes.posterior} ci={res.bayes.credible95} /></div>
        <div className="glass"><h3>Effects with 95% intervals</h3><Forest items={[{ label: 'Conversion', est: res.primary.relEffect, lo: res.primary.ci[0] / res.pC, hi: res.primary.ci[1] / res.pC }, ...(res.g ? [{ label: 'Value metric', est: res.g.relEffect, lo: res.g.ci[0] / Math.abs(res.g.effect / res.g.relEffect), hi: res.g.ci[1] / Math.abs(res.g.effect / res.g.relEffect) }] : [])]} />
          {res.cu && <p className="mut sm" style={{ marginBottom: 0 }}>CUPED removed <b style={{ color: C.cy }}>{pct(res.cu.vr)}</b> of the value metric's variance.</p>}</div></div>
      <div className="glass"><Memo payload={{ verdict: res.verdict, conversion: { control: res.pC, treatment: res.pT, relLift: res.primary.relEffect, p: res.primary.p }, probTreatmentWins: res.bayes.probTreatmentBetter, srm: res.srm, usersPerArm: [res.nC, res.nT], valueMetric: res.g ? { relLift: res.g.relEffect, p: res.g.p } : null }} /></div></div>}</div>);
}

function Diagnose({ rows, setRows }: { rows: Row[]; setRows: (r: Row[]) => void }) {
  const res = useMemo(() => (rows.length ? adtributor(rows) : null), [rows]);
  const load = (f: File) => f.text().then(t => setRows(parseCsv(t).map(r => { const { baseline, current, ...dims } = r; return { dims, baseline: Number(baseline), current: Number(current) }; })));
  const base = rows.reduce((s, r) => s + r.baseline, 0);
  return (<div><Head crumb="03 diagnose" title="Why did the metric move?" sub="Upload a breakdown by country, platform, version or any dimension. The Adtributor algorithm ranks which slice explains the change." />
    <div className="glass row" style={{ marginBottom: 16 }}><label className="btn" style={{ margin: 0, textTransform: 'none', fontFamily: 'inherit', fontSize: 15, color: 'var(--tx)', letterSpacing: 0 }}>⬆ Upload CSV<input type="file" accept=".csv" hidden onChange={e => e.target.files?.[0] && load(e.target.files[0])} /></label>
      <button className="btn pri" onClick={() => setRows(sampleDrop())}>▶ Load sample drop</button><span className="mut sm">Columns: your dimensions + <span className="mono">baseline</span> and <span className="mono">current</span>.</span></div>
    {!res && <div className="glass dropz mut">No data yet. Load the sample drop to see the investigation.</div>}
    {res && <div className="grid fade"><div className="glass glow"><h3>Total change</h3><div className="stat"><b style={{ color: res.totalDelta < 0 ? C.ro : C.li, fontSize: 38 }}>{pct(res.totalDelta / base)}</b><span>{res.totalDelta.toFixed(0)} units vs. baseline</span></div></div>
      {res.causes.length === 0 && <div className="glass">No single dimension explains the change; it looks broad-based (seasonality or a global issue).</div>}
      <div className="grid c2">{res.causes.map((c, i) => <div className="glass" key={c.dimension} style={i === 0 ? { borderColor: 'rgba(251,113,133,.5)' } : {}}>
        <div className="row between"><h3>{i === 0 ? '● primary suspect · ' : ''}{c.dimension}</h3><span className="pill" style={{ color: C.cy }}>{pct(c.totalEp, 0)} explained</span></div><div style={{ marginTop: 14 }}>
          <HBars fmt={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}`} items={c.elements.map(e => ({ label: e.value, value: e.delta, color: e.delta < 0 ? C.ro : C.li, sub: `${pct(e.ep, 0)} of the change · ${e.baseline.toFixed(0)} → ${e.current.toFixed(0)}` }))} /></div></div>)}</div>
      <div className="glass"><Memo payload={{ totalDeltaPct: res.totalDelta / base, topCauses: res.causes.slice(0, 3).map(c => ({ dimension: c.dimension, explained: c.totalEp, elements: c.elements.map(e => ({ value: e.value, delta: e.delta, share: e.ep })) })) }} /></div></div>}</div>);
}

function Peek() {
  const [looks, setLooks] = useState(10), [perLook, setPerLook] = useState(1000);
  const [out, setOut] = useState<ReturnType<typeof simulatePeeking> | null>(null), [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); setTimeout(() => { setOut(simulatePeeking(looks, perLook)); setBusy(false); }, 30); };
  return (<div><Head crumb="04 peek lab" title="Why you shouldn't peek" sub="Both arms are identical, so any 'win' is a false alarm. Watch what happens when you check results after every batch of users." />
    <div className="grid c2"><div className="glass"><div style={{ display: 'grid', gap: 16 }}><div><label>Number of looks · {looks}</label><input type="range" min="2" max="20" value={looks} onChange={e => setLooks(Number(e.target.value))} /></div>
      <div><label>Users per arm per look · {perLook.toLocaleString()}</label><input type="range" min="500" max="5000" step="500" value={perLook} onChange={e => setPerLook(Number(e.target.value))} /></div>
      <button className="btn pri" onClick={run} disabled={busy}>{busy ? 'Simulating…' : '▶ Run 1,500 A/A experiments'}</button></div></div>
      <div className="glass glow">{!out ? <p className="mut">Run the simulation to compare the two policies.</p> : <div className="fade"><HBars fmt={v => pct(v)} items={[{ label: `Stop at the first p < 0.05 (${out.looks} looks)`, value: out.peekingFalsePositive, color: C.ro, sub: 'false-positive rate' }, { label: 'Look once, at the end', value: out.singleLookFalsePositive, color: C.li, sub: 'false-positive rate (nominal 5%)' }]} />
        <p style={{ marginBottom: 0 }}>Peeking makes a false win <b style={{ color: C.ro }}>{(out.peekingFalsePositive / Math.max(out.singleLookFalsePositive, 0.001)).toFixed(1)}×</b> more likely. Fix it by fixing the sample size in advance, or by using sequential testing.</p></div>}</div></div></div>);
}

function Proof() {
  const e = ev as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows: [string, string][] = [
    ['A/A false-positive rate (5,000 sims, nominal 5%)', pct(e.aa_false_positive_rate.rate)],
    ['Power at 3% / 5% / 10% lift (target 80%)', e.power_calibration.map((p: { empiricalPower: number }) => pct(p.empiricalPower, 0)).join(' / ')],
    ['CUPED variance reduction (ρ = 0.7; theory 49%)', pct(e.cuped.measuredVarReduction)],
    ['CUPED power at fixed n = 1,500/arm', `${pct(e.cuped.powerWithout)} → ${pct(e.cuped.powerWith)}`],
    ['SRM false alarms under a true 50/50 split', pct(e.srm.falseAlarmRate, 2)],
    ['SRM detection of a 51.5/48.5 split, 100k users', pct(e.srm.detectionRateAt51_5pct, 0)],
    ['Root cause: correct dimension + value (Adtributor)', pct(e.root_cause.adtributor.dimensionAndElementAccuracy)],
    ['Root cause: "largest absolute drop" baseline', pct(e.root_cause.naiveLargestDrop.dimensionAndElementAccuracy)],
  ];
  return (<div><Head crumb="05 proof" title="Does the math hold up?" sub="Every engine here is tested against simulations where the true answer is known. Reproduce with npm run eval (fixed seeds)." />
    <div className="glass glow"><table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>{rows.map(([a, b]) => <tr key={a}><td>{a}</td><td className="mono" style={{ color: C.cy }}>{b}</td></tr>)}</tbody></table>
      <p className="mut sm" style={{ marginBottom: 0 }}>Simulation results with known ground truth, not production traffic. Root-cause test: 1,000 trials, 160 cells, 3% global drift and 2% noise.</p></div></div>);
}
