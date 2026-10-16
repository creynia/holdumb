// The 18 Drill categories (curriculum.md §9.1, decisions.md D33): classification of a spot.
import { handValueOf } from '../engine/evaluator';
import { RANK_CHARS } from '../engine/types';
import type { Card, DecisionStreet } from '../engine/types';
import { dealerOuts, flopMade, hiddenPairFlop, isHidden } from './predicates';
import { handClass, parseClass } from './ranks';
import type { DrillCategoryId } from './types';

export const DRILL_STREET_OF: Readonly<Record<DrillCategoryId, DecisionStreet>> = {
  'pre-premium': 'preflop',
  'pre-ace': 'preflop',
  'pre-king': 'preflop',
  'pre-queen-jack': 'preflop',
  'pre-small-pair': 'preflop',
  'pre-low': 'preflop',
  'flop-hidden-pair': 'flop',
  'flop-two-pair-plus': 'flop',
  'flop-board-pair': 'flop',
  'flop-flush-draw': 'flop',
  'flop-straight-draw': 'flop',
  'flop-nothing': 'flop',
  'flop-deuces': 'flop',
  'river-hidden-pair': 'river',
  'river-outs-low': 'river',
  'river-outs-edge': 'river',
  'river-outs-high': 'river',
  'river-board-plays': 'river',
};

/** Preflop: pairs 77+, AK-AT, KQ, KJs are premium; the rest of the kings are `pre-king`. */
export function preflopCategory(hole: readonly [Card, Card]): DrillCategoryId {
  const { hi, lo, suited, pair } = parseClass(handClass(hole));
  const r = (c: string): number => RANK_CHARS.indexOf(c);
  if (pair) return lo >= r('7') ? 'pre-premium' : 'pre-small-pair';
  if (hi === r('A')) return lo >= r('T') ? 'pre-premium' : 'pre-ace';
  if (hi === r('K')) return lo === r('Q') || (lo === r('J') && suited) ? 'pre-premium' : 'pre-king';
  if (hi === r('Q') || hi === r('J')) return 'pre-queen-jack';
  return 'pre-low';
}

/** True when hole + flop has a straight draw (4 of 5 consecutive ranks, ace high or low). */
function straightDraw(ranks: readonly number[]): boolean {
  const have = new Set(ranks);
  if (have.has(12)) have.add(-1);
  for (let s = -1; s <= 8; s++) {
    let n = 0;
    for (let r = s; r < s + 5; r++) if (have.has(r)) n++;
    if (n >= 4) return true;
  }
  return false;
}

export function flopCategory(hole: readonly Card[], flop: readonly Card[]): DrillCategoryId {
  if (hole[0]! >> 2 === 0 && hole[1]! >> 2 === 0) return 'flop-deuces';
  if (flopMade(hole, flop)) return 'flop-two-pair-plus';
  if (hiddenPairFlop(hole, flop, [0])) return 'flop-hidden-pair';
  const suits = [0, 0, 0, 0];
  for (const c of [...hole, ...flop]) suits[c & 3]!++;
  if (suits.some((n) => n >= 4)) return 'flop-flush-draw';
  const fr = flop.map((c) => c >> 2);
  if (fr[0] === fr[1] || fr[0] === fr[2] || fr[1] === fr[2]) return 'flop-board-pair';
  if (straightDraw([...hole, ...flop].map((c) => c >> 2))) return 'flop-straight-draw';
  return 'flop-nothing';
}

export function riverCategory(hole: readonly Card[], board: readonly Card[]): DrillCategoryId {
  if (handValueOf([...hole, ...board]) === handValueOf(board)) return 'river-board-plays';
  if (isHidden(hole, board)) return 'river-hidden-pair';
  const outs = dealerOuts(hole, board);
  return outs <= 18 ? 'river-outs-low' : outs <= 23 ? 'river-outs-edge' : 'river-outs-high';
}

/** Category of a spot by street (hole 2 cards; board 0, 3 or 5). */
export function categorize(hole: readonly [Card, Card], board: readonly Card[]): DrillCategoryId {
  if (board.length === 0) return preflopCategory(hole);
  if (board.length === 3) return flopCategory(hole, board);
  if (board.length === 5) return riverCategory(hole, board);
  throw new Error(`Bad board length ${board.length}`);
}
