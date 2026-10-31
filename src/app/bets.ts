import { HAND_CATEGORIES } from '../sim/engine';
import type { HandCategory, Odds, Paytable } from '../sim/engine';
import type { Fraction } from '../sim/math';
import type { Tier } from '../content/types';

/**
 * House edge of each Trips preset, per unit wagered (decisions.md D6b; exact fractions verified
 * by two solvers). TODO(math): read these from the math module once it exposes wager edges.
 */
export const TRIPS_EDGE: Record<string, Fraction> = {
  'trips-9-7-4': { num: 301629n, den: 33446140n },
  'trips-8-6-5': { num: 48987n, den: 2572780n },
  'trips-8-7-4': { num: 233985n, den: 6689228n },
  'trips-7-6-5': { num: 115779n, den: 2572780n },
  'trips-8-6-4': { num: 545459n, den: 8361535n },
};

/** Wager tiers (D24): free <= 0, good <= 2%, fair <= 5%, poor < 9%, avoid >= 9%. */
export function wagerTierOf(edge: Fraction): Tier {
  const e = Number(edge.num) / Number(edge.den);
  if (e <= 0) return 'free';
  if (e <= 0.02) return 'good';
  if (e <= 0.05) return 'fair';
  if (e < 0.09) return 'poor';
  return 'avoid';
}

export const fmtOdds = ([n, d]: Odds) => (d === 1 ? `${n} to 1` : `${n} to ${d}`);

/** Paytable rows, best hand first. */
export function payRows(t: Paytable): { category: HandCategory; pays: string }[] {
  return [...HAND_CATEGORIES].reverse().flatMap((c) => {
    const o = t.pays[c];
    return o ? [{ category: c, pays: fmtOdds(o) }] : [];
  });
}
