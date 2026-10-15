import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Card } from '../engine/types';
import { riverTotals, FOLD_X2 } from './enumerate';
import { GAME_EV, GAME_EXPECTED_WAGER } from './edges';
import { frac, sum, toRatio } from './fraction';
import {
  preflopClass,
  preflopClasses,
  preflopRow,
  rowSums,
  isChartHand,
  classWeight,
} from './preflop';
import { preflopPreview } from './preview';
import { PREFLOP_BLIND_STANDARD } from './tables/preflop-blind-standard';
import { createHash } from 'node:crypto';

const DOC = fileURLToPath(new URL('../../../docs/design/simulator.md', import.meta.url));
/** Appendix A of simulator.md: class SA SP SC, pinned from the independent C enumeration. */
function appendixA(): Map<string, [bigint, bigint, bigint]> {
  const text = readFileSync(DOC, 'utf8');
  const i = text.indexOf('class SA SP SC');
  const block = text.slice(i, text.indexOf('```', i)).trim().split('\n').slice(1);
  return new Map(
    block.map((l) => {
      const [name, a, b, c] = l.trim().split(/\s+/);
      return [name!, [BigInt(a!), BigInt(b!), BigInt(c!)] as [bigint, bigint, bigint]];
    }),
  );
}

const B = 'blind-standard' as const;
const classes = preflopClasses(B);

function holeFor(name: string): [Card, Card] {
  const h = '23456789TJQKA'.indexOf(name[0]!);
  const l = '23456789TJQKA'.indexOf(name[1]!);
  if (name.length === 2) return [h * 4, h * 4 + 1];
  return [h * 4, l * 4 + (name.endsWith('s') ? 0 : 1)];
}
const hole = (name: string) => holeFor(name);
const req = (name: string) => ({
  street: 'preflop' as const,
  hole: hole(name),
  board: [],
  blindPaytable: B,
  ante: 1000,
});

describe('shipped preflop table vs simulator.md Appendix A', () => {
  const appendix = appendixA();
  it('has all 169 classes in the same order, weights 1326', () => {
    expect(appendix.size).toBe(169);
    expect(classes).toEqual([...appendix.keys()]);
    expect(classes.reduce((a, n) => a + classWeight(n), 0)).toBe(1326);
  });
  it('SA, SP and SC of every class equal the independent C results exactly', () => {
    for (const [name, [SA, SP, SC]] of appendix) {
      const s = rowSums(preflopRow(B, name));
      expect([name, s.SA, s.SP, s.SC]).toEqual([name, SA, SP, SC]);
    }
  });
  it('header hash matches the row string', () => {
    const sha = createHash('sha256').update(PREFLOP_BLIND_STANDARD.rows).digest('hex');
    const src = readFileSync(
      fileURLToPath(new URL('./tables/preflop-blind-standard.ts', import.meta.url)),
      'utf8',
    );
    expect(src).toContain(`sha256 ${sha}`);
    expect(PREFLOP_BLIND_STANDARD.rows.length).toBeLessThan(25_000);
  });
  it('internal consistency of every row', () => {
    for (const name of classes) {
      const r = preflopRow(B, name);
      const s = rowSums(r);
      expect(r.f2 + s.fc).toBe(19_600n);
      expect(s.cp).toBeGreaterThanOrEqual(0n);
      expect(r.wq).toBeLessThanOrEqual(r.sw);
      expect(r.lq).toBeLessThanOrEqual(r.sl);
      expect(r.sw + r.sl).toBeLessThanOrEqual(2_097_572_400n);
    }
  });
});

describe('perfect play from the table', () => {
  const evs = classes.map((name) => {
    const p = preflopPreview(req(name));
    return { name, p };
  });
  it('weighted EV equals GAME_EV and E[wager] equals the canonical value', () => {
    let ev = frac(0);
    let wager = frac(0);
    for (const { name, p } of evs) {
      const w = BigInt(classWeight(name));
      ev = sum([
        ev,
        frac(p.options[p.bestIndex]!.ev.num * w, p.options[p.bestIndex]!.ev.den * 1326n),
      ]);
      const r = preflopRow(B, name);
      const s = rowSums(r);
      const cases = 19_600n * 1_081n;
      const wCheck = frac(4n * r.f2 * 1081n + 3n * s.cp + 2n * r.cf, cases);
      const wBest = p.bestIndex === 0 ? frac(6) : wCheck;
      wager = sum([wager, frac(wBest.num * w, wBest.den * 1326n)]);
    }
    expect(toRatio(ev)).toBe(toRatio(GAME_EV));
    expect(toRatio(wager)).toBe(toRatio(GAME_EXPECTED_WAGER));
  });
  it('Bet 4x is best for exactly the 69 chart classes; 3x is never best', () => {
    const chart = evs.filter(({ p }) => p.bestIndex === 0).map(({ name }) => name);
    expect(chart).toHaveLength(69);
    expect(chart.every(isChartHand)).toBe(true);
    expect(classes.filter(isChartHand)).toHaveLength(69);
    for (const { p } of evs) {
      expect(p.bestIndex).not.toBe(1);
      // linearity: EV(4x) - EV(3x) = SP / (2 * 990 * boards)
    }
  });
  it('linearity: EV(4x) - EV(3x) is the same P as the table', () => {
    for (const { name, p } of evs.slice(0, 40)) {
      const s = rowSums(preflopRow(B, name));
      const d = frac(s.SP, 2n * 990n * 2_118_760n);
      const diff = frac(
        p.options[0]!.ev.num * p.options[1]!.ev.den - p.options[1]!.ev.num * p.options[0]!.ev.den,
        p.options[0]!.ev.den * p.options[1]!.ev.den,
      );
      expect(toRatio(diff)).toBe(toRatio(d));
    }
  });
});

describe('AA and friends (pinned)', () => {
  it('AA: Bet 4x +3.601 vs Check +2.193', () => {
    const p = preflopPreview(req('AA'));
    expect(p.handClass).toBe('AA');
    expect(p.options.map((o) => o.label)).toEqual(['Bet 4x', 'Bet 3x', 'Check']);
    expect(toRatio(p.options[0]!.ev)).toBe(
      toRatio(frac(3292247168n + 4n * 2953693496n, 4195144800n)),
    );
    expect(toRatio(p.options[2]!.ev)).toBe(toRatio(frac(91996341600n, 41951448000n)));
    expect((p.options[0]!.ev.num * 1000n) / p.options[0]!.ev.den).toBe(3601n);
    expect((p.options[2]!.ev.num * 1000n) / p.options[2]!.ev.den).toBe(2192n); // 2.19292 (spec rounds up: 2.193)
    expect(p.bestIndex).toBe(0);
    expect(p.options[2]!.tier).toBe('blunder');
    expect(p.showdowns).toBe(0);
    expect(p.source).toBe('table');
  });
  it('calibration regrets (simulator.md §2.4)', () => {
    const r = (name: string, i: number) =>
      Number(preflopPreview(req(name)).options[i]!.regret.num) /
      Number(preflopPreview(req(name)).options[i]!.regret.den);
    expect(r('AA', 2)).toBeCloseTo(1.408, 3);
    expect(r('AKs', 2)).toBeCloseTo(0.672, 3);
    expect(r('AKo', 2)).toBeCloseTo(0.603, 3);
    expect(r('33', 2)).toBeLessThan(0.1);
    expect(preflopPreview(req('72o')).options[0]!.tier).toBe('blunder');
  });
  it('classifies hole cards', () => {
    expect(preflopClass([48, 49])).toBe('AA');
    expect(preflopClass([44, 49])).toBe('AKo');
    expect(preflopClass([44, 48])).toBe('AKs');
    expect(preflopClass([0, 4])).toBe('32s');
  });
  it('Why rows: raise rows sum to the EV; check rows to the check EV', () => {
    for (const name of ['AA', 'T9s', '72o', 'K5o']) {
      const p = preflopPreview(req(name));
      for (const o of p.options) {
        expect(toRatio(sum(o.why.rows.map((x) => x.contribution)))).toBe(toRatio(o.ev));
      }
      expect(p.options[0]!.why.rows.reduce((a, x) => a + x.count, 0n)).toBe(2_097_572_400n);
      expect(p.options[2]!.why.rows.reduce((a, x) => a + x.count, 0n)).toBe(21_187_600n);
    }
  });
});

describe('sampled exact recompute (decisions.md D22)', () => {
  /** Recompute the slice columns of one class from scratch with the JS enumerator. */
  function recompute(name: string): { sas: bigint; sps: bigint; scs: bigint } {
    const h = hole(name);
    const rem: number[] = [];
    for (let c = 0; c < 52; c++) if (c !== h[0] && c !== h[1]) rem.push(c);
    let sas = 0;
    let sps = 0;
    for (let a = 36; a < 50; a++)
      for (let b = a + 1; b < 50; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 50; d++)
            for (let e = d + 1; e < 50; e++) {
              const t = riverTotals(h, [rem[a]!, rem[b]!, rem[c]!, rem[d]!, rem[e]!], B);
              sas += t.a2;
              sps += t.p2;
            }
    let scs = 0;
    for (let x = 44; x < 50; x++)
      for (let y = x + 1; y < 50; y++)
        for (let z = y + 1; z < 50; z++) {
          let s2 = 0;
          let sc = 0;
          for (let u = 0; u < 50; u++) {
            if (u === x || u === y || u === z) continue;
            for (let v = u + 1; v < 50; v++) {
              if (v === x || v === y || v === z) continue;
              const t = riverTotals(h, [rem[x]!, rem[y]!, rem[z]!, rem[u]!, rem[v]!], B);
              s2 += t.a2 + 2 * t.p2;
              sc += Math.max(t.a2 + t.p2, FOLD_X2);
            }
          }
          scs += Math.max(s2, sc);
        }
    return { sas: BigInt(sas), sps: BigInt(sps), scs: BigInt(scs) };
  }
  it.each(['AA', 'AKs', '72o', 'T9s', 'K5o', 'Q6s', '33', 'J8s', '97o'])(
    '%s slice',
    (name) => {
      const r = preflopRow(B, name);
      expect(recompute(name)).toEqual({ sas: r.sas, sps: r.sps, scs: r.scs });
    },
    60_000,
  );
});
