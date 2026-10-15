// Exact constants that do not depend on a decision (simulator.md §2.3, decisions.md §4).
import { TRIPS_PAYTABLES } from '../engine/paytables';
import type { HandCategory, TripsPaytableId } from '../engine/types';
import { frac, neg, scale } from './fraction';
import { wagerTier } from './tiers';
import type { Fraction, WagerEdge } from './types';

/** 7-card category counts over C(52,7) = 133,784,560 (verified by the engine's exhaustive test). */
export const SEVEN_CARD_TOTAL = 133_784_560n;
export const SEVEN_CARD_COUNTS: Readonly<Record<HandCategory, bigint>> = {
  'royal-flush': 4_324n,
  'straight-flush': 37_260n,
  quads: 224_848n,
  'full-house': 3_473_184n,
  flush: 4_047_644n,
  straight: 6_180_020n,
  trips: 6_461_620n,
  'two-pair': 31_433_400n,
  pair: 58_627_800n,
  'high-card': 23_294_460n,
};

/**
 * Trips edge for a paytable: −EV per unit wagered, P(win), exact. Trips pays on the player's
 * best 7-card hand alone (no dealer, no board-only exclusion).
 */
export function tripsEdge(id: TripsPaytableId): WagerEdge {
  const pays = TRIPS_PAYTABLES[id].pays;
  let won = 0n;
  let paid = 0n;
  for (const [cat, odds] of Object.entries(pays) as [HandCategory, readonly [number, number]][]) {
    const n = SEVEN_CARD_COUNTS[cat];
    won += n;
    paid += n * BigInt(odds[0]) * 1n;
    if (odds[1] !== 1) throw new Error('Trips odds must be N to 1');
  }
  const ev = frac(paid - (SEVEN_CARD_TOTAL - won), SEVEN_CARD_TOTAL);
  const edge = neg(ev);
  return { edge, tier: wagerTier(edge), pWin: frac(won, SEVEN_CARD_TOTAL) };
}

/** EV per hand (antes) under perfect play, Trips excluded (decisions.md §4). */
export const GAME_EV: Fraction = frac(-50643648973n, 2317817502000n);
/** House edge per Ante = −EV (2.18497%). */
export const GAME_EDGE: Fraction = neg(GAME_EV);
/** Expected total wager per hand (antes) under perfect play with the canonical tie rule. */
export const GAME_EXPECTED_WAGER: Fraction = frac(29163830173n, 7023689400n);
/** Element of risk = house edge / E[wager] = 50643648973/9624063957090 (0.52622%). */
export const GAME_ELEMENT_OF_RISK: Fraction = frac(50643648973n, 9624063957090n);
/** Dealer qualifies 789215/955604 of the time (82.588%). */
export const DEALER_QUALIFY_PROBABILITY: Fraction = frac(789215n, 955604n);
export const HANDS_PER_HOUR = 30; // D10

/**
 * Expected cost per hour in cents of a per-ante edge (D10): hands × ante × edge. `edge` may be
 * negative (a gain). Exact; round for display.
 */
export function perHour(
  edgePerAnte: Fraction,
  anteCents: number,
  handsPerHour: number = HANDS_PER_HOUR,
): Fraction {
  return scale(edgePerAnte, handsPerHour * anteCents);
}

/** Trips cost per hour in cents for a given Trips bet. */
export function tripsPerHour(
  id: TripsPaytableId,
  tripsCents: number,
  handsPerHour: number = HANDS_PER_HOUR,
): Fraction {
  return scale(tripsEdge(id).edge, handsPerHour * tripsCents);
}

