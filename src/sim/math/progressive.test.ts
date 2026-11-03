// I063: the progressive's exact EV re-derived: 5-card counts by an independent exhaustive count over
// C(52,5), the lesson 20 table's figures, and the break-even meter 3,050,080/19 dollars.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatMoney, formatPct } from '../engine/money';
import { frac, round, scale } from './fraction';
import {
  FIVE_CARD_COUNTS,
  FIVE_CARD_TOTAL,
  progressiveBreakEven,
  progressiveEdge,
  progressiveEv,
} from './progressive';

/** Independent 5-card category by rank/suit counting (card = rank * 4 + suit). */
function classify5(h: readonly number[]): string {
  const rc = new Array<number>(13).fill(0);
  let mask = 0;
  for (const c of h) {
    rc[c >> 2]! += 1;
    mask |= 1 << (c >> 2);
  }
  const flush = h.every((c) => (c & 3) === (h[0]! & 3));
  let top = -1;
  for (let t = 12; t >= 4 && top < 0; t--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!(mask & (1 << (t - k)))) ok = false;
    if (ok) top = t;
  }
  if (top < 0 && (mask & 0b1000000001111) === 0b1000000001111) top = 3;
  if (flush && top === 12) return 'royal-flush';
  if (flush && top >= 0) return 'straight-flush';
  const n = rc.filter(Boolean).sort((a, b) => b - a);
  if (n[0] === 4) return 'quads';
  if (n[0] === 3 && n[1] === 2) return 'full-house';
  if (flush) return 'flush';
  if (top >= 0) return 'straight';
  if (n[0] === 3) return 'trips';
  return 'other';
}

describe('progressive jackpot maths (I063)', () => {
  it('re-derives the 5-card counts over all C(52,5)', () => {
    const counts: Record<string, number> = {};
    let total = 0;
    const h = [0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 52; h[0]++)
      for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
        for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
          for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
            for (h[4] = h[3] + 1; h[4] < 52; h[4]++) {
              const c = classify5(h);
              counts[c] = (counts[c] ?? 0) + 1;
              total++;
            }
    expect(BigInt(total)).toBe(FIVE_CARD_TOTAL);
    for (const [cat, n] of Object.entries(FIVE_CARD_COUNTS))
      expect([cat, BigInt(counts[cat] ?? 0)]).toEqual([cat, n]);
  });

  it('EV per $1 = (fixed awards + meter shares) / 2,598,960 − 1, exactly', () => {
    // Fixed "for 1": quads 624 × $300 + FH 3,744 × $50 + flush 5,108 × $40 + straight 10,200 × $30
    // + trips 54,912 × $9 = $1,378,928; the meter adds (4 × 100% + 36 × 10%) = 7.6 per $.
    const ev = (m: number) => frac(10n * 1_378_928n + 76n * BigInt(m), 10n * 2_598_960n);
    for (const m of [10_000, 25_000, 50_000, 100_000, 160_530, 160_531, 300_000])
      expect(progressiveEv(m)).toEqual(frac(ev(m).num - ev(m).den, ev(m).den));
    expect(progressiveEv(25_000)).toEqual(frac(-21459n, 54145n));
    expect(progressiveEv(50_000)).toEqual(frac(-52502n, 162435n));
    expect(progressiveEv(100_000)).toEqual(frac(-9584n, 54145n));
  });

  it('breaks even at a meter of 3,050,080/19 ≈ $160,530.53', () => {
    expect(progressiveBreakEven()).toEqual(frac(3_050_080n, 19n));
    expect(round(scale(progressiveBreakEven(), 100))).toBe(16_053_053);
    expect(progressiveEdge(160_530).num > 0n).toBe(true);
    expect(progressiveEdge(160_531).num < 0n).toBe(true);
  });

  it("matches every figure in lesson 20's progressive table", () => {
    const md = readFileSync('content/lessons/20-other-side-bets.md', 'utf8');
    for (const m of [25_000, 50_000, 100_000]) {
      const e = progressiveEdge(m);
      const row = `| ${formatMoney(m * 100)} | ${formatPct(e, 1)} | ${formatMoney(round(scale(e, 3000)))} |`;
      expect(md).toContain(row);
    }
    expect(md).toContain(
      `| ≈ ${formatMoney(Math.round(160_530.53) * 100)} | 0% (break-even) | $0 |`,
    );
  });
});
