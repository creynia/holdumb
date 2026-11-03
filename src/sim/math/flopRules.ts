// The basic flop rules (a)(b)(c) of decisions.md section 3, in one place. `strategy/predicates.ts`
// re-exports these for the rule-based presets and `alternatives.ts` builds the EV sheet's facts on
// them, so the card, the charts and the sheet cannot disagree.
import { handValueOf } from '../engine/evaluator';
import type { Card } from '../engine/types';

const CAT = (v: number): number => v >>> 20;

/** Category of just the flop's three cards: trips 3, pair 1, high card 0 (as the solver counts it). */
export function flopOwnCategory(flop: readonly Card[]): number {
  const a = flop[0]! >> 2;
  const b = flop[1]! >> 2;
  const c = flop[2]! >> 2;
  if (a === b && b === c) return 3;
  return a === b || a === c || b === c ? 1 : 0;
}

/** Rule (a): category(best5 of hole + flop) >= two pair and > the flop's own category. */
export function flopMade(hole: readonly Card[], flop: readonly Card[]): boolean {
  const cat = CAT(handValueOf([hole[0]!, hole[1]!, flop[0]!, flop[1]!, flop[2]!]));
  return cat >= 2 && cat > flopOwnCategory(flop);
}

/** Rule (b): a pocket pair (except `exceptPocket` ranks), or a hole card matching a flop rank. */
export function hiddenPairFlop(
  hole: readonly Card[],
  flop: readonly Card[],
  exceptPocket: readonly number[] = [],
): boolean {
  const ra = hole[0]! >> 2;
  const rb = hole[1]! >> 2;
  if (ra === rb && !exceptPocket.includes(ra)) return true;
  for (const f of flop) {
    const r = f >> 2;
    if (r === ra || r === rb) return true;
  }
  return false;
}

/** Rule (c): >= minCards of one suit among hole + flop, with a hole card of that suit >= minHoleRank. */
export function flushDrawFlop(
  hole: readonly Card[],
  flop: readonly Card[],
  minCards: number,
  minHoleRank: number,
): boolean {
  const n = [0, 0, 0, 0];
  for (const c of hole) n[c & 3]!++;
  for (const c of flop) n[c & 3]!++;
  for (const c of hole) if (n[c & 3]! >= minCards && c >> 2 >= minHoleRank) return true;
  return false;
}
