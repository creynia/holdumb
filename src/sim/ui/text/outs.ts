// Text helpers (outs); re-exported unchanged by ../text.ts (I082 split).
import { RIVER_UNSEEN, groupOuts } from '../../math';
import type { Card } from '../../engine';
import type { OutGroup, RiverFacts } from '../../math';
import { RANK_SINGULAR } from './hands';

// ---------- river dealer outs (decisions.md section 3; lesson 12) ----------

const SUIT_WORDS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
/** "Dealer outs: 19 of 45". */
export function dealerOutsLine(f: RiverFacts): string {
  return `Dealer outs: ${f.outs} of ${RIVER_UNSEEN}`;
}
/** "any king (3)" when every unseen king beats you; "the nine of clubs" (or "... of clubs or hearts") otherwise. */
export function outGroupText(g: OutGroup): string {
  const rank = RANK_SINGULAR[g.rank]!;
  if (g.all) return `any ${rank} (${g.cards.length})`;
  const suits = g.cards.map((c) => SUIT_WORDS[c & 3]);
  return `the ${rank} of ${suits.length === 1 ? suits[0] : `${suits.slice(0, -1).join(', ')} or ${suits[suits.length - 1]}`}`;
}
/** "any ace (4), any king (3), the nine of clubs", or "no single card beats you". */
export function outsDetailText(
  f: RiverFacts,
  hole: readonly [Card, Card],
  board: readonly Card[],
): string {
  if (f.outs === 0) return 'no single card beats you';
  return groupOuts(f.outCards, hole, board).map(outGroupText).join(', ');
}
/** "Hidden pair or better: yes/no" (`hidden` covers two pair and above too). */
export const hiddenPairLine = (f: RiverFacts): string =>
  `Hidden pair or better: ${f.hidden ? 'yes' : 'no'}`;
/** The basic card's river rule applied here: "Basic card: bet 1x (outs < 21)". */
export function basicRiverLine(f: RiverFacts): string {
  const why = f.hidden ? 'hidden pair' : f.outs < 21 ? 'outs < 21' : '21+ outs, no hidden pair';
  return `Basic card: ${f.basicAction === 'play' ? 'bet 1x' : 'fold'} (${why})`;
}
