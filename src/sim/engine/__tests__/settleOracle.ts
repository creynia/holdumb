/**
 * Independent restatement of simulator.md §1.3 in plain code. Uses the textbook evaluator
 * (oracle.ts) and its own payout tables; imports nothing from wagers.ts / paytables.ts / evaluator.ts.
 */
import { oracleCategory, oracleKeyBest } from './oracle';

// Oracle category numbers: 0 high 1 pair 2 two-pair 3 trips 4 straight 5 flush 6 FH 7 quads 8 SF 9 royal.
const BLIND: Record<number, [number, number]> = {
  9: [500, 1],
  8: [50, 1],
  7: [10, 1],
  6: [3, 1],
  5: [3, 2],
  4: [1, 1],
};
export const TRIPS_TABLES: Record<string, Record<number, number>> = {
  'trips-8-6-5': { 9: 50, 8: 40, 7: 30, 6: 8, 5: 6, 4: 5, 3: 3 },
  'trips-9-7-4': { 9: 50, 8: 40, 7: 30, 6: 9, 5: 7, 4: 4, 3: 3 },
  'trips-8-7-4': { 9: 50, 8: 40, 7: 30, 6: 8, 5: 7, 4: 4, 3: 3 },
  'trips-7-6-5': { 9: 50, 8: 40, 7: 30, 6: 7, 5: 6, 4: 5, 3: 3 },
  'trips-8-6-4': { 9: 50, 8: 40, 7: 30, 6: 8, 5: 6, 4: 4, 3: 3 },
};

export type OraclePath = '4x' | '3x' | '2x' | '1x' | 'fold';
export interface OracleHands {
  player: number[]; // 2 hole cards
  dealer: number[];
  board: number[]; // 5
}

/** Net profit per wager (cents): {ante, blind, play, trips}. */
export function oracleSettle(
  h: OracleHands,
  path: OraclePath,
  ante: number,
  trips: number,
  tripsId: string,
): { ante: number; blind: number; play: number; trips: number } {
  const pk = oracleKeyBest([...h.player, ...h.board]);
  const dk = oracleKeyBest([...h.dealer, ...h.board]);
  const pc = oracleCategory(pk);
  const qualifies = oracleCategory(dk) >= 1;
  const cmp = Math.sign(pk - dk);
  const tripsProfit =
    trips === 0
      ? 0
      : TRIPS_TABLES[tripsId]![pc] !== undefined
        ? trips * TRIPS_TABLES[tripsId]![pc]
        : -trips;
  if (path === 'fold') return { ante: -ante, blind: -ante, play: 0, trips: tripsProfit };
  const mult = Number(path[0]);
  const play = mult * ante;
  if (cmp === 0) return { ante: 0, blind: 0, play: 0, trips: tripsProfit };
  if (cmp < 0)
    return { ante: qualifies ? -ante : 0, blind: -ante, play: -play, trips: tripsProfit };
  const bl = BLIND[pc];
  return {
    ante: qualifies ? ante : 0,
    blind: bl ? (ante * bl[0]) / bl[1] : 0,
    play,
    trips: tripsProfit,
  };
}
