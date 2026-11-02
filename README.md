# ExperimentLab

Decide whether to ship an A/B test, plan its sample size, and find out why a metric dropped, all in the browser.

**Features**
- **Experiment analysis:** two-proportion z-test, Bayesian P(treatment better), sample-ratio-mismatch check, guardrail metric, CUPED variance reduction, and a SHIP / DO NOT SHIP / INCONCLUSIVE / INVALID verdict.
- **Sample size calculator:** users per arm and test duration for a given baseline and minimum detectable lift.
- **Root cause:** ranks which dimension and values explain a metric drop (Adtributor algorithm, Bhagwan et al., NSDI 2014).
- **AI decision memo:** Groq (Llama 3.3 70B) drafts a short memo from the computed numbers only, via a serverless function so the API key never reaches the browser.

## Validation (reproducible: `npm run eval`, fixed seeds)
All results are from simulations with known ground truth, not production traffic.

| Check | Result |
|---|---|
| A/A false-positive rate (5,000 sims, nominal 5%) | **5.1%** |
| Power at relative lift 3% / 5% / 10% (target 80%, sample size from the built-in calculator) | **80.2% / 79.6% / 80.5%** |
| CUPED variance reduction (ρ = 0.7; theory 49%) | **49.0%** |
| CUPED power at fixed n = 1,500/arm | **58.5% → 87.4%** |
| SRM detector false alarms under a true 50/50 split | **0.08%** (threshold p < 0.001) |
| SRM detection of a 51.5/48.5 split at 100k users | **100%** |
| Root cause, 1,000 trials, 160 cells, 3% global drift + 2% noise: correct dimension and value | **Adtributor 98.7% vs. 67.6% for a "largest absolute drop" baseline** |

Raw numbers: `eval-results.json`.

## Run locally
```
npm install
npm run dev
npm run eval
```
For the AI memo, set `GROQ_API_KEY` (Vercel project environment variable, or `vercel dev` locally).

## Stack
React, TypeScript, Vite, Vercel serverless function, Groq API. Statistics are implemented from scratch (`src/lib/stats.ts`, `src/lib/rootcause.ts`).
