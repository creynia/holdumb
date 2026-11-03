// Near-miss notes for the player's seven cards (I005): "four clubs, one short of a flush".
// Pure and display-only: it never feeds evaluation, payouts or EV.
import type { Card, HandCategory } from './types';
import { HAND_CATEGORIES } from './types';

/** Suit index (card & 3, SUIT_CHARS 'shdc') -> plural name. The single source for suit words. */
export const SUIT_PLURAL = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

const rankOfCategory = (c: HandCategory): number => HAND_CATEGORIES.indexOf(c);
const FLUSH = rankOfCategory('flush');
const STRAIGHT = rankOfCategory('straight');

/** True when `ranks` (0 = two .. 12 = ace) hold 4 distinct values of one 5-rank window (wheel too). */
function fourInWindow(ranks: Iterable<number>): boolean {
  const have = new Set(ranks);
  if (have.has(12)) have.add(-1);
  for (let s = -1; s <= 8; s++) {
    let n = 0;
    for (let r = s; r < s + 5; r++) if (have.has(r)) n++;
    if (n >= 4) return true;
  }
  return false;
}

/**
 * At most one note for the seven cards: the strongest category above the made hand that is one
 * card short. Straight-flush draw beats flush beats straight. Full house or better never notes.
 */
export function nearMisses(seven: readonly Card[], category: HandCategory): string[] {
  const made = rankOfCategory(category);
  if (made > FLUSH) return []; // full house, quads, straight flush, royal
  const suits: number[][] = [[], [], [], []];
  for (const c of seven) suits[c & 3]!.push(c >> 2);
  if (suits.some((ranks) => fourInWindow(ranks) && ranks.length >= 4))
    return ['four to a straight flush, one short'];
  if (made < FLUSH) {
    const s = suits.findIndex((ranks) => ranks.length === 4);
    if (s >= 0) return [`four ${SUIT_PLURAL[s]}, one short of a flush`];
  }
  if (made < STRAIGHT && fourInWindow(seven.map((c) => c >> 2)))
    return ['four to a straight, one short'];
  return [];
}
