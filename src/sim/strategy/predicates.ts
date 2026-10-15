// Hand predicates (decisions.md §3): flop rules (a)(b)(c), river "hidden" and dealer outs.
import { handValueOf } from '../engine/evaluator';
import type { Card } from '../engine/types';
import { riverFacts } from '../math/alternatives';
import type { HandPredicate } from './types';

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
  if (ra === rb) return !exceptPocket.includes(ra);
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

/** River "hidden" (math/alternatives riverFacts: the single source for decisions.md §3). */
export function isHidden(hole: readonly Card[], board: readonly Card[]): boolean {
  return riverFacts(hole as readonly [Card, Card], board).hidden;
}

/** River dealer outs of the 45 unseen cards. */
export function dealerOuts(hole: readonly Card[], board: readonly Card[]): number {
  return riverFacts(hole as readonly [Card, Card], board).outs;
}

/** Evaluates one predicate at the decision street implied by the board length. */
export function matches(p: HandPredicate, hole: readonly Card[], board: readonly Card[]): boolean {
  if ('flopMade' in p) return board.length === 3 && flopMade(hole, board);
  if ('hiddenPair' in p)
    return board.length === 3 && hiddenPairFlop(hole, board, p.hiddenPair.exceptPocket);
  if ('flushDraw' in p)
    return (
      board.length === 3 &&
      flushDrawFlop(hole, board, p.flushDraw.minCards, p.flushDraw.minHoleRank)
    );
  if ('hidden' in p) return board.length === 5 && isHidden(hole, board);
  if ('dealerOutsBelow' in p)
    return board.length === 5 && dealerOuts(hole, board) < p.dealerOutsBelow;
  return p.any.some((q) => matches(q, hole, board));
}
export const matchesAny = (
  ps: readonly HandPredicate[],
  hole: readonly Card[],
  board: readonly Card[],
): boolean => ps.some((p) => matches(p, hole, board));
