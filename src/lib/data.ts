import { rng } from './stats';
import type { Row } from './rootcause';

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(l => {
    const c = l.split(',');
    const o: Record<string, string> = {};
    head.forEach((h, i) => (o[h] = (c[i] ?? '').trim()));
    return o;
  });
}

export interface ExpUser { variant: 'control' | 'treatment'; converted: number; value?: number; pre?: number }

export function sampleExperiment(): ExpUser[] {
  const r = rng(11);
  const out: ExpUser[] = [];
  for (let i = 0; i < 12000; i++) {
    const t = r.uniform() < 0.5;
    const pre = Math.max(0, 20 + 8 * r.normal());
    const value = Math.max(0, 0.8 * pre + 5 * r.normal() + (t ? 0.8 : 0));
    out.push({ variant: t ? 'treatment' : 'control', converted: r.uniform() < (t ? 0.112 : 0.1) ? 1 : 0, value, pre });
  }
  return out;
}

export function sampleDrop(): Row[] {
  const r = rng(5);
  const countries = ['IN', 'US', 'BR', 'DE', 'GB', 'ID'];
  const platforms = ['android', 'ios', 'web'];
  const versions = ['v4', 'v5', 'v6'];
  const rows: Row[] = [];
  for (const c of countries) for (const p of platforms) for (const v of versions) {
    const base = 1000 * (1 + r.uniform() * 4);
    const hit = c === 'BR' && p === 'android' && v === 'v6';
    rows.push({ dims: { country: c, platform: p, version: v }, baseline: base, current: base * 0.98 * (hit ? 0.35 : 1) * (1 + 0.02 * r.normal()) });
  }
  return rows;
}

export function toCsv(rows: Record<string, string | number>[]): string {
  const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map(r => keys.map(k => r[k]).join(','))].join('\n');
}
