// Decision and wager tiers (decisions.md D24, simulator.md §2.4). All comparisons are exact.
import { frac, lte, lt } from './fraction';
import type { DecisionTier, Fraction, WagerTier } from './types';

/** Regret (antes) at or below which an option counts as tied with the best. */
export const TIE_EPSILON: Fraction = frac(1n, 1_000_000_000n);
export const CLOSE_MAX: Fraction = frac(2n, 100n);
export const SMALL_MAX: Fraction = frac(10n, 100n);
/** The `blunder` threshold: one constant so decisions.md can move it. */
export const BLUNDER_MIN: Fraction = frac(50n, 100n);

export function decisionTier(regret: Fraction): DecisionTier {
  if (lte(regret, TIE_EPSILON)) return 'best';
  if (lte(regret, CLOSE_MAX)) return 'close';
  if (lte(regret, SMALL_MAX)) return 'small';
  if (lte(regret, BLUNDER_MIN)) return 'costly';
  return 'blunder';
}

const GOOD_MAX = frac(2n, 100n);
const FAIR_MAX = frac(5n, 100n);
const POOR_BELOW = frac(9n, 100n);

/** `edge` = −EV per unit wagered. */
export function wagerTier(edge: Fraction): WagerTier {
  if (lte(edge, frac(0))) return 'free';
  if (lte(edge, GOOD_MAX)) return 'good';
  if (lte(edge, FAIR_MAX)) return 'fair';
  if (lt(edge, POOR_BELOW)) return 'poor';
  return 'avoid';
}
