// Exact river decision (990 dealer hands): play 1x iff EV(1x) > EV(fold) = -2 antes.
// Exact ties go to the smaller wager (fold), decisions.md §3.
import { BLIND_PAYTABLES } from '../engine/paytables';
import { evalMasks } from '../engine/evaluator';
import { HAND_CATEGORIES } from '../engine/types';
import type { BlindPaytableId, Card } from '../engine/types';

export interface RiverCounts {
  /** Showdown counts over the 990 dealer hands. */
  wq: number;
  wnq: number;
  lq: number;
  lnq: number;
  tie: number;
  /** Net of Ante+Blind+Play for playing 1x, summed over the 990 hands, in half-antes. */
  play1Half: number;
}

/** Twice the Blind multiple of a player's category (0 below a straight), exact for 3:2. */
export function blindHalf(category: number, id: BlindPaytableId = 'blind-standard'): number {
  const odds = BLIND_PAYTABLES[id].pays[HAND_CATEGORIES[category]!];
  return odds ? (2 * odds[0]) / odds[1] : 0;
}

export function riverCounts(
  hole: readonly Card[],
  board: readonly Card[],
  blind: BlindPaytableId = 'blind-standard',
): RiverCounts {
  const bm = [0, 0, 0, 0];
  for (const c of board) bm[c & 3]! |= 1 << (c >> 2);
  const pm = [bm[0]!, bm[1]!, bm[2]!, bm[3]!];
  for (const c of hole) pm[c & 3]! |= 1 << (c >> 2);
  const player = evalMasks(pm[0]!, pm[1]!, pm[2]!, pm[3]!);
  const bl = blindHalf(player >>> 20, blind);
  const used = new Set<number>([...hole, ...board]);
  const unseen: number[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) unseen.push(c);
  let wq = 0;
  let wnq = 0;
  let lq = 0;
  let lnq = 0;
  let tie = 0;
  const n = unseen.length;
  for (let i = 0; i < n; i++) {
    const a = unseen[i]!;
    const am = [bm[0]!, bm[1]!, bm[2]!, bm[3]!];
    am[a & 3]! |= 1 << (a >> 2);
    for (let j = i + 1; j < n; j++) {
      const b = unseen[j]!;
      const d = evalMasks(
        (b & 3) === 0 ? am[0]! | (1 << (b >> 2)) : am[0]!,
        (b & 3) === 1 ? am[1]! | (1 << (b >> 2)) : am[1]!,
        (b & 3) === 2 ? am[2]! | (1 << (b >> 2)) : am[2]!,
        (b & 3) === 3 ? am[3]! | (1 << (b >> 2)) : am[3]!,
      );
      const q = d >= 1 << 20;
      if (player > d) q ? wq++ : wnq++;
      else if (player < d) q ? lq++ : lnq++;
      else tie++;
    }
  }
  return {
    wq,
    wnq,
    lq,
    lnq,
    tie,
    play1Half: wq * (4 + bl) + wnq * (2 + bl) - 6 * lq - 4 * lnq,
  };
}

/** True when playing 1x strictly beats folding (-2 antes = -4 half-antes per dealer hand). */
export function riverPlays(
  hole: readonly Card[],
  board: readonly Card[],
  blind: BlindPaytableId = 'blind-standard',
): boolean {
  const c = riverCounts(hole, board, blind);
  const total = c.wq + c.wnq + c.lq + c.lnq + c.tie;
  return c.play1Half > -4 * total;
}
