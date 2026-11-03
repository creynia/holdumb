// Hand predicates (decisions.md §3): flop rules (a)(b)(c), river "hidden" and dealer outs.
import type { Card } from '../engine/types';
import { riverFacts } from '../math/alternatives';
import { flopMade, flushDrawFlop, hiddenPairFlop } from '../math/flopRules';
import type { HandPredicate } from './types';

export { flopMade, flopOwnCategory, flushDrawFlop, hiddenPairFlop } from '../math/flopRules';

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
