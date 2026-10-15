import { FULL_DECK, parseCard } from './cards';
import { shuffle } from './rng';
import type { Card, Deal, ForcedDeal, RngState } from './types';

/**
 * Resolves a (possibly partial) ForcedDeal into a full Deal. Forced cards are removed from the
 * 52, the rest is Fisher-Yates shuffled from `r` (exactly 52 - |forced| - 1 randBelow calls), and
 * free slots are filled in the order player 1-2, dealer 1-2, flop 1-3, turn, river.
 * Throws on a malformed or duplicate card code.
 */
export function dealHand(r: RngState, forced?: ForcedDeal): [Deal, RngState] {
  const slots: (Card | undefined)[] = new Array<Card | undefined>(9).fill(undefined);
  const put = (i: number, code: string | undefined): void => {
    if (code !== undefined) slots[i] = parseCard(code);
  };
  if (forced) {
    forced.player?.forEach((c, i) => put(i, c));
    forced.dealer?.forEach((c, i) => put(2 + i, c));
    forced.flop?.forEach((c, i) => put(4 + i, c));
    put(7, forced.turn);
    put(8, forced.river);
  }
  const used = slots.filter((c): c is Card => c !== undefined);
  if (new Set(used).size !== used.length) throw new Error('Duplicate card in forced deal');
  const rest = FULL_DECK.filter((c) => !used.includes(c));
  const [shuffled, next] = shuffle(r, rest);
  let k = 0;
  const cards = slots.map((c) => c ?? shuffled[k++]!);
  return [
    {
      player: [cards[0]!, cards[1]!],
      dealer: [cards[2]!, cards[3]!],
      board: [cards[4]!, cards[5]!, cards[6]!, cards[7]!, cards[8]!],
      forced: used.length > 0,
    },
    next,
  ];
}
