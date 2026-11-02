import { useMemo, useState } from 'react';
import { twoProportionZ, welchT, srmCheck, sampleSizePerArm, cuped, bayesBinary, decide, mean } from './lib/stats';
import { adtributor, type Row } from './lib/rootcause';
import { parseCsv, sampleExperiment, sampleDrop, toCsv, type ExpUser } from './lib/data';

const pct = (x: number, d = 2) => (isFinite(x) ? (x * 100).toFixed(d) + '%' : 'n/a');

async function explain(payload: unknown): Promise<string> {
  const r = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Failed');
  return d.text;
}

function Memo({ payload }: { payload: unknown }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  return (
    <div>
      <button onClick={async () => { setBusy(true); setErr(''); try { setText(await explain(payload)); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>
        {busy ? 'Writing…' : 'Draft decision memo (AI)'}
      </button>
      {err && <p className="hint">{err}</p>}
      {text && <div className="memo" style={{ marginTop: 12 }}>{text}</div>}
    </div>
  );
}

function Experiment() {
  const [data, setData] = useState<ExpUser[]>([]);
  const [alpha] = useState(0.05);
  const [higherBetter, setHB] = useState(true);
  const res = useMemo(() => {
    if (!data.length) return null;
    const c = data.filter(d => d.variant === 'control'), t = data.filter(d => d.variant === 'treatment');
    if (c.length < 2 || t.length < 2) return null;
    const xC = c.reduce((s, d) => s + d.converted, 0), xT = t.reduce((s, d) => s + d.converted, 0);
    const primary = twoProportionZ(xC, c.length, xT, t.length, alpha);
    const bayes = bayesBinary(xC, c.length, xT, t.length);
    const srm = srmCheck(c.length, t.length);
    const hasVal = c.every(d => d.value !== undefined) && t.every(d => d.value !== undefined);
    const hasPre = hasVal && c.every(d => d.pre !== undefined) && t.every(d => d.pre !== undefined);
    let guard = null as null | ReturnType<typeof welchT>; let cu = null as null | { r: ReturnType<typeof welchT>; vr: number };
    if (hasVal) {
      const vc = c.map(d => d.value!), vt = t.map(d => d.value!);
      guard = welchT(vc, vt, alpha);
      if (hasPre) {
        const allX = [...c, ...t].map(d => d.pre!), allY = [...vc, ...vt];
        const { theta, varReduction } = cuped(allY, allX); const mx = mean(allX);
        const adj = (arr: ExpUser[]) => arr.map(d => d.value! - theta * (d.pre! - mx));
        cu = { r: welchT(adj(c), adj(t), alpha), vr: varReduction };
      }
    }
    const guardrails = guard ? [{ name: 'value metric', result: (cu?.r ?? guard), higherIsBetter: higherBetter, maxRelDrop: 0.02 }] : [];
    const verdict = decide(primary, srm, guardrails, alpha);
    return { nC: c.length, nT: t.length, pC: xC / c.length, pT: xT / t.length, primary, bayes, srm, guard, cu, verdict };
  }, [data, alpha, higherBetter]);

  const load = (f: File) => f.text().then(t => {
    setData(parseCsv(t).map(r => ({ variant: r.variant === 'treatment' ? 'treatment' : 'control', converted: Number(r.converted), value: r.value ? Number(r.value) : undefined, pre: r.pre ? Number(r.pre) : undefined })));
  });

  return (
    <>
      <div className="card">
        <h2>Analyze an A/B test</h2>
        <p className="hint">CSV columns: <code>variant</code> (control/treatment), <code>converted</code> (0/1), optional <code>value</code> (guardrail metric) and <code>pre</code> (pre-experiment value, used for CUPED).</p>
        <div className="row">
          <input type="file" accept=".csv" style={{ width: 'auto' }} onChange={e => e.target.files?.[0] && load(e.target.files[0])} />
          <button className="pri" onClick={() => setData(sampleExperiment())}>Load sample experiment</button>
          <button onClick={() => { const s = sampleExperiment(); const b = new Blob([toCsv(s.map(x => ({ variant: x.variant, converted: x.converted, value: x.value!.toFixed(2), pre: x.pre!.toFixed(2) })))], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sample-experiment.csv'; a.click(); }}>Download sample CSV</button>
        </div>
        <div style={{ marginTop: 12, maxWidth: 260 }}>
          <label>Guardrail metric: higher is better?</label>
          <select value={String(higherBetter)} onChange={e => setHB(e.target.value === 'true')}><option value="true">Yes (e.g. revenue)</option><option value="false">No (e.g. latency)</option></select>
        </div>
      </div>
      {res && (
        <div className="card">
          <div className={`verdict ${res.verdict.verdict}`}>{res.verdict.verdict}</div>
          <p>{res.verdict.reasons.join(' ')}</p>
          <div className="grid">
            <div className="stat"><b>{res.nC.toLocaleString()} / {res.nT.toLocaleString()}</b><span>control / treatment users</span></div>
            <div className="stat"><b>{pct(res.pC)} → {pct(res.pT)}</b><span>conversion</span></div>
            <div className="stat"><b>{pct(res.primary.relEffect)}</b><span>relative lift (CI {pct(res.primary.ci[0] / res.pC)} to {pct(res.primary.ci[1] / res.pC)})</span></div>
            <div className="stat"><b>p = {res.primary.p.toFixed(4)}</b><span>two-sided z-test</span></div>
            <div className="stat"><b>{pct(res.bayes.probTreatmentBetter, 1)}</b><span>Bayesian P(treatment better)</span></div>
            <div className="stat"><b>p = {res.srm.p.toFixed(4)}</b><span>SRM check {res.srm.mismatch ? '(MISMATCH)' : '(ok)'}</span></div>
          </div>
          {res.guard && (
            <p style={{ marginTop: 12 }} className="hint">
              Value metric: lift {pct(res.guard.relEffect)} (p={res.guard.p.toFixed(4)})
              {res.cu && <> · with CUPED: lift {pct(res.cu.r.relEffect)} (p={res.cu.r.p.toFixed(4)}), variance reduced {pct(res.cu.vr, 1)}</>}
            </p>
          )}
          <Memo payload={{ verdict: res.verdict, conversion: { control: res.pC, treatment: res.pT, relLift: res.primary.relEffect, p: res.primary.p, ci: res.primary.ci }, bayesProbBetter: res.bayes.probTreatmentBetter, srm: res.srm, n: [res.nC, res.nT], valueMetric: res.guard ? { relLift: res.guard.relEffect, p: res.guard.p } : null }} />
        </div>
      )}
    </>
  );
}

function SampleSize() {
  const [base, setBase] = useState(0.1); const [mde, setMde] = useState(0.05); const [perDay, setPerDay] = useState(5000);
  const n = sampleSizePerArm(base, mde);
  return (
    <div className="card">
      <h2>Sample size & duration</h2>
      <div className="grid">
        <div><label>Baseline conversion</label><input type="number" step="0.01" value={base} onChange={e => setBase(Number(e.target.value))} /></div>
        <div><label>Min. detectable lift (relative)</label><input type="number" step="0.01" value={mde} onChange={e => setMde(Number(e.target.value))} /></div>
        <div><label>Eligible users per day</label><input type="number" value={perDay} onChange={e => setPerDay(Number(e.target.value))} /></div>
      </div>
      {base > 0 && base < 1 && mde > 0 && (
        <p style={{ marginTop: 12 }}><b>{n.toLocaleString()}</b> users per arm ({(2 * n).toLocaleString()} total) → about <b>{Math.ceil((2 * n) / Math.max(perDay, 1))} days</b> at 80% power, α = 0.05.</p>
      )}
    </div>
  );
}

function RootCause() {
  const [rows, setRows] = useState<Row[]>([]);
  const res = useMemo(() => (rows.length ? adtributor(rows) : null), [rows]);
  const load = (f: File) => f.text().then(t => {
    const p = parseCsv(t);
    setRows(p.map(r => { const { baseline, current, ...dims } = r; return { dims, baseline: Number(baseline), current: Number(current) }; }));
  });
  return (
    <>
      <div className="card">
        <h2>Why did the metric drop?</h2>
        <p className="hint">CSV: one or more dimension columns, plus <code>baseline</code> and <code>current</code> totals per row. Uses the Adtributor algorithm to rank which dimension and values explain the change.</p>
        <div className="row">
          <input type="file" accept=".csv" style={{ width: 'auto' }} onChange={e => e.target.files?.[0] && load(e.target.files[0])} />
          <button className="pri" onClick={() => setRows(sampleDrop())}>Load sample drop</button>
        </div>
      </div>
      {res && (
        <div className="card">
          <div className="verdict INCONCLUSIVE">Total change: {res.totalDelta.toFixed(0)} ({pct(res.totalDelta / rows.reduce((s, r) => s + r.baseline, 0), 1)})</div>
          {res.causes.length === 0 && <p>No single dimension explains the change. It looks broad-based.</p>}
          {res.causes.map(c => (
            <div key={c.dimension} style={{ marginBottom: 12 }}>
              <h2>{c.dimension} <span className="hint">explains {pct(c.totalEp, 0)} of the change</span></h2>
              <table><thead><tr><th>Value</th><th>Baseline</th><th>Current</th><th>Share of change</th><th>Surprise</th></tr></thead>
                <tbody>{c.elements.map(e => <tr key={e.value}><td>{e.value}</td><td>{e.baseline.toFixed(0)}</td><td>{e.current.toFixed(0)}</td><td>{pct(e.ep, 1)}</td><td>{e.surprise.toFixed(4)}</td></tr>)}</tbody></table>
            </div>
          ))}
          <Memo payload={{ totalDelta: res.totalDelta, causes: res.causes.slice(0, 3) }} />
        </div>
      )}
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState<'exp' | 'size' | 'rc'>('exp');
  return (
    <div className="wrap">
      <h1>ExperimentLab</h1>
      <p className="sub">Decide whether to ship an experiment, plan its sample size, and find out why a metric dropped.</p>
      <div className="tabs">
        <button className={tab === 'exp' ? 'on' : ''} onClick={() => setTab('exp')}>Analyze experiment</button>
        <button className={tab === 'size' ? 'on' : ''} onClick={() => setTab('size')}>Sample size</button>
        <button className={tab === 'rc' ? 'on' : ''} onClick={() => setTab('rc')}>Root cause</button>
      </div>
      {tab === 'exp' && <Experiment />}
      {tab === 'size' && <SampleSize />}
      {tab === 'rc' && <RootCause />}
      <p className="hint">Statistics run in your browser; only computed summaries are sent to the AI memo writer. Validation results: see README.</p>
    </div>
  );
}
