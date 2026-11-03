// I063 Progressive jackpot (lesson 20; D5: explained, not dealt). Exact EV per $1 of lesson 20's
// illustrative $1 table as a function of the meter, and its break-even meter. The bet is on your two
// hole cards plus the flop (5 cards); awards are paid "for 1" (the $1 is kept), so EV per $1 is
// Σ P(hand) × award − 1. Royal pays 100% of the meter, straight flush 10%, the rest fixed dollars.
import type { HandCategory } from '../engine/types';
import { frac, sub } from './fraction';
import type { Fraction } from './types';

/** 5-card category counts over C(52,5) = 2,598,960 (curriculum.md §7; re-derived in the test). */
export const FIVE_CARD_TOTAL = 2_598_960n;
export const FIVE_CARD_COUNTS: Readonly<Partial<Record<HandCategory, bigint>>> = {
  'royal-flush': 4n,
  'straight-flush': 36n,
  quads: 624n,
  'full-house': 3_744n,
  flush: 5_108n,
  straight: 10_200n,
  trips: 54_912n,
};

export interface ProgressiveTable {
  /** Share of the meter, in tenths (10 = 100%, 1 = 10%). */
  meterTenths: Partial<Record<HandCategory, number>>;
  /** Fixed awards in whole dollars, "for 1". */
  fixed: Partial<Record<HandCategory, number>>;
}

/** Lesson 20's example $1 table (illustrative, not a specific casino's; curriculum.md sources). */
export const PROGRESSIVE_EXAMPLE: ProgressiveTable = {
  meterTenths: { 'royal-flush': 10, 'straight-flush': 1 },
  fixed: { quads: 300, 'full-house': 50, flush: 40, straight: 30, trips: 9 },
};

function sums(t: ProgressiveTable): { fixed: bigint; meterTenths: bigint } {
  let fixed = 0n;
  let meterTenths = 0n;
  const count = (c: string) => {
    const n = FIVE_CARD_COUNTS[c as HandCategory];
    if (n === undefined) throw new Error(`no 5-card count for ${c}`);
    return n;
  };
  for (const [c, d] of Object.entries(t.fixed)) fixed += count(c) * BigInt(d);
  for (const [c, k] of Object.entries(t.meterTenths)) meterTenths += count(c) * BigInt(k);
  return { fixed, meterTenths };
}

/** Exact EV per $1 for a meter of `meterDollars` (whole dollars). Negative = house edge. */
export function progressiveEv(
  meterDollars: number,
  t: ProgressiveTable = PROGRESSIVE_EXAMPLE,
): Fraction {
  const s = sums(t);
  const ret = frac(10n * s.fixed + s.meterTenths * BigInt(meterDollars), 10n * FIVE_CARD_TOTAL);
  return sub(ret, frac(1n));
}

/** House edge per $1 (−EV): positive below break-even, negative (a player edge) above it. */
export function progressiveEdge(
  meterDollars: number,
  t: ProgressiveTable = PROGRESSIVE_EXAMPLE,
): Fraction {
  const ev = progressiveEv(meterDollars, t);
  return { num: -ev.num, den: ev.den };
}

/** The meter (dollars, exact) at which EV is 0: (1 − fixed return) / (meter return per $). */
export function progressiveBreakEven(t: ProgressiveTable = PROGRESSIVE_EXAMPLE): Fraction {
  const s = sums(t);
  return frac(10n * FIVE_CARD_TOTAL - 10n * s.fixed, s.meterTenths);
}

/**
 * The meter (dollars, exact) at which the house edge equals `edge` (a fraction of the $1 bet):
 * (1 − edge − fixed return) / (meter return per $). Break-even is edge 0; lesson 21's "loses a third
 * or more" line is edge 1/3 (884,280/19 ≈ $46,541.05).
 */
export function progressiveMeterForEdge(
  edge: Fraction,
  t: ProgressiveTable = PROGRESSIVE_EXAMPLE,
): Fraction {
  const s = sums(t);
  // 1 − edge = (10·fixed + tenths·M) / (10·N)  ⇒  M = (10·N·(1 − edge) − 10·fixed) / tenths
  const keep = sub(frac(1n), edge);
  return frac(
    10n * FIVE_CARD_TOTAL * keep.num - 10n * s.fixed * keep.den,
    s.meterTenths * keep.den,
  );
}
