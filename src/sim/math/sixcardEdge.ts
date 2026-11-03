// I062 Six Card Bonus edge (D5a). Its own module so the Six Card tables stay out of the first-paint
// bundle: only the lazy Six Card panel, the table's Six Card rules and the worker import it.
import { SIX_CARD_PAYTABLES } from '../engine/sixcard';
import type { SixCardPaytableId } from '../engine/sixcard';
import type { HandCategory } from '../engine/types';
import { frac, neg } from './fraction';
import { wagerTier } from './tiers';
import type { WagerEdge } from './types';

/**
 * Best-5-of-6 category counts over C(52,6) = 20,358,520 (curriculum.md §7; re-derived by an
 * independent exhaustive count in sixcard.test.ts). Only the paying categories are needed.
 */
export const SIX_CARD_TOTAL = 20_358_520n;
export const SIX_CARD_COUNTS: Readonly<Partial<Record<HandCategory, bigint>>> = {
  'royal-flush': 188n,
  'straight-flush': 1_656n,
  quads: 14_664n,
  'full-house': 165_984n,
  flush: 205_792n,
  straight: 361_620n,
  trips: 732_160n,
};

/** Six Card Bonus edge (I062, D5a): −EV per unit wagered and P(win), exact. */
export function sixCardEdge(id: SixCardPaytableId): WagerEdge {
  let won = 0n;
  let paid = 0n;
  for (const [cat, to1] of Object.entries(SIX_CARD_PAYTABLES[id].pays) as [
    HandCategory,
    number,
  ][]) {
    const n = SIX_CARD_COUNTS[cat];
    if (n === undefined) throw new Error(`no 6-card count for ${cat}`);
    won += n;
    paid += n * BigInt(to1);
  }
  const edge = neg(frac(paid - (SIX_CARD_TOTAL - won), SIX_CARD_TOTAL));
  return { edge, tier: wagerTier(edge), pWin: frac(won, SIX_CARD_TOTAL) };
}
