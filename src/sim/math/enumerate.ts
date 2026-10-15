// Exact enumeration of the river (990 dealer hands) and the flop (1,081 runouts × 990 dealer
// hands = 1,070,190 showdowns). simulator.md §2.3. All sums are integers in half-antes (×2) so the
// 3:2 flush Blind stays integral; callers turn them into Fractions.
import { BLIND_PAYTABLES } from '../engine/paytables';
import { HAND_CATEGORIES } from '../engine/types';
import type { BlindPaytableId, Card } from '../engine/types';
import type { Progress } from '../engine/job';
import { makeScratch, riverCounts } from './showdown';
import type { RiverCounts } from './showdown';

export const DEALER_HANDS = 990; // C(45,2)
export const RUNOUTS = 1081; // C(47,2)
export const FLOP_SHOWDOWNS = DEALER_HANDS * RUNOUTS; // 1,070,190
/** Fold at the river: Ante + Blind lost = −2 antes = −4 half-antes per dealer hand. */
export const FOLD_X2 = -4 * DEALER_HANDS;

const b2Cache = new Map<BlindPaytableId, readonly number[]>();
/** 2 × the Blind multiple won by a player holding each category (0 below a straight). */
export function blindX2(id: BlindPaytableId): readonly number[] {
  const hit = b2Cache.get(id);
  if (hit) return hit;
  const table = BLIND_PAYTABLES[id];
  const out = HAND_CATEGORIES.map((cat) => {
    const odds = table.pays[cat];
    if (!odds) return 0;
    const v = (2 * odds[0]) / odds[1];
    if (!Number.isInteger(v)) throw new Error(`Blind ${id} pays ${odds.join(':')} on ${cat}`);
    return v;
  });
  b2Cache.set(id, out);
  return out;
}

export function deadMask(cards: readonly Card[]): Uint8Array {
  const dead = new Uint8Array(52);
  for (const c of cards) {
    if (!Number.isInteger(c) || c < 0 || c > 51) throw new RangeError(`Bad card ${c}`);
    if (dead[c]) throw new Error(`Duplicate card ${c}`);
    dead[c] = 1;
  }
  return dead;
}

/** One final board. */
export interface RiverTotals extends RiverCounts {
  /** 2 × the Blind multiple the player's hand earns on a win. */
  b2: number;
  /** Σ over the 990 dealer hands of the half-ante net of Ante+Blind with a Play of 0. */
  a2: number;
  /** Σ of 2 × (win − loss): each unit of Play adds p2 half-antes. */
  p2: number;
}

export function riverTotals(
  hole: readonly [Card, Card],
  board: readonly Card[],
  blind: BlindPaytableId,
): RiverTotals {
  if (board.length !== 5) throw new Error('river needs a 5-card board');
  const dead = deadMask([...hole, ...board]);
  const c = riverCounts(makeScratch(), hole[0], hole[1], board, dead);
  const b2 = blindX2(blind)[c.category] as number;
  const wins = c.wq + c.wnq;
  const losses = c.lq + c.lnq;
  return {
    ...c,
    b2,
    a2: wins * b2 + 2 * c.wq - 2 * losses - 2 * c.lq,
    p2: 2 * (wins - losses),
  };
}

/** Raw sums of the flop enumeration (all integers, half-antes unless noted). */
export interface FlopTotals {
  runouts: number;
  /** Showdown counts over all 1,070,190 (runout, dealer hand) cases. */
  wq: number;
  wnq: number;
  tie: number;
  lq: number;
  lnq: number;
  /** Σ over winning showdowns of 2 × Blind multiple, split by dealer qualifying. */
  bb2q: number;
  bb2nq: number;
  /** Σ over runouts of A2 + 2·P2: the whole-hand value of Bet 2x. */
  sum2x: number;
  /** Σ over runouts of max(A2 + P2, fold): the value of Check with a perfect river. */
  sumCheck: number;
  /** Runouts where Bet 1x beats Fold (strictly), and their Σ of A2 + P2. */
  playRunouts: number;
  sumPlay: number;
  /** Runouts where Fold is at least as good (ties go to the smaller wager). */
  foldRunouts: number;
}

export interface FlopRequest {
  hole: readonly [Card, Card];
  flop: readonly [Card, Card, Card] | readonly Card[];
  blind: BlindPaytableId;
}

/** Yields progress every 32 runouts (~34 k showdowns). Pure; allocates its scratch once. */
export function* flopTotalsJob(
  req: FlopRequest,
): Generator<Progress | undefined, FlopTotals, void> {
  const { hole, flop, blind } = req;
  if (flop.length !== 3) throw new Error('flop needs 3 cards');
  const dead = deadMask([...hole, ...flop]);
  const b2tab = blindX2(blind);
  const unseen: number[] = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) unseen.push(c);
  const scratch = makeScratch();
  const board = [flop[0], flop[1], flop[2], 0, 0];
  const t: FlopTotals = {
    runouts: 0,
    wq: 0,
    wnq: 0,
    tie: 0,
    lq: 0,
    lnq: 0,
    bb2q: 0,
    bb2nq: 0,
    sum2x: 0,
    sumCheck: 0,
    playRunouts: 0,
    sumPlay: 0,
    foldRunouts: 0,
  };
  const n = unseen.length; // 47
  for (let i = 0; i < n - 1; i++) {
    const turn = unseen[i] as number;
    dead[turn] = 1;
    board[3] = turn;
    for (let j = i + 1; j < n; j++) {
      const river = unseen[j] as number;
      dead[river] = 1;
      board[4] = river;
      const c = riverCounts(scratch, hole[0], hole[1], board, dead);
      dead[river] = 0;
      const b2 = b2tab[c.category] as number;
      const wins = c.wq + c.wnq;
      const losses = c.lq + c.lnq;
      const a2 = wins * b2 + 2 * c.wq - 2 * losses - 2 * c.lq;
      const p2 = 2 * (wins - losses);
      t.wq += c.wq;
      t.wnq += c.wnq;
      t.tie += c.tie;
      t.lq += c.lq;
      t.lnq += c.lnq;
      t.bb2q += c.wq * b2;
      t.bb2nq += c.wnq * b2;
      t.sum2x += a2 + 2 * p2;
      const play = a2 + p2;
      if (play > FOLD_X2) {
        t.sumCheck += play;
        t.sumPlay += play;
        t.playRunouts++;
      } else {
        t.sumCheck += FOLD_X2;
        t.foldRunouts++;
      }
      t.runouts++;
      if (t.runouts % 32 === 0) yield { done: t.runouts, total: RUNOUTS };
    }
    dead[turn] = 0;
  }
  return t;
}
