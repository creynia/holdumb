import { RANK_CHARS, SUIT_CHARS } from './types';
import type { Card, CardCode, Rank, Suit } from './types';

const RANK_NAMES = [
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Jack',
  'Queen',
  'King',
  'Ace',
] as const;
const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

export const FULL_DECK: readonly Card[] = Array.from({ length: 52 }, (_, i) => i);

export function rankOf(card: Card): Rank {
  return (card >> 2) as Rank;
}
export function suitOf(card: Card): Suit {
  return (card & 3) as Suit;
}
export function makeCard(rank: Rank, suit: Suit): Card {
  return rank * 4 + suit;
}
export function cardCode(card: Card): CardCode {
  return `${RANK_CHARS.charAt(card >> 2)}${SUIT_CHARS.charAt(card & 3)}`;
}
/** 'Ace of spades' (for aria-labels). */
export function cardName(card: Card): string {
  return `${RANK_NAMES[card >> 2]} of ${SUIT_NAMES[card & 3]}`;
}

/** 'As' -> 51 - ... ; throws on anything that is not a rank char followed by a suit char. */
export function parseCard(code: CardCode): Card {
  if (code.length !== 2) throw new Error(`Bad card code "${code}"`);
  const r = RANK_CHARS.indexOf(code.charAt(0));
  const s = SUIT_CHARS.indexOf(code.charAt(1));
  if (r < 0 || s < 0) throw new Error(`Bad card code "${code}"`);
  return r * 4 + s;
}

/**
 * Parses 'As Kd', 'AsKd' or 'As,Kd' into cards. Whitespace and commas are separators and
 * optional. Throws on a malformed code or a duplicate card. Shared by content, URLs and tests.
 */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/[\s,]+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Bad card list "${text}"`);
  const cards: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    const card = parseCard(compact.slice(i, i + 2));
    if (cards.includes(card)) throw new Error(`Duplicate card "${compact.slice(i, i + 2)}"`);
    cards.push(card);
  }
  return cards;
}
