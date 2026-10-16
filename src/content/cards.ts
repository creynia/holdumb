// Inline card notation shared by the build-time compiler and the runtime components.
// `{{As Kd}}` -> a group of cards. Validation uses the engine's parseCards (one definition).
import { cardName, parseCards, rankOf, suitOf } from '../sim/engine';
import type { Card } from '../sim/engine';

export type SuitLetter = 's' | 'h' | 'd' | 'c';
const SUIT_LETTERS: readonly SuitLetter[] = ['s', 'h', 'd', 'c'];
const GLYPH: Record<SuitLetter, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_LABEL = '23456789TJQKA';
/** U+FE0E asks for the text (not emoji) presentation, so Android does not draw coloured hearts. */
const TEXT_PRESENTATION = '︎';

export interface CardFace {
  rank: string; // '2'..'9', '10', 'J', 'Q', 'K', 'A'
  suit: SuitLetter;
  glyph: string; // suit glyph + text-presentation selector
  name: string; // 'Ace of spades'
}

export function cardFace(card: Card): CardFace {
  const r = RANK_LABEL.charAt(rankOf(card));
  const suit = SUIT_LETTERS[suitOf(card)] ?? 's';
  return {
    rank: r === 'T' ? '10' : r,
    suit,
    glyph: GLYPH[suit] + TEXT_PRESENTATION,
    name: cardName(card),
  };
}

/** Parses one group's codes; throws a readable error on empty / malformed / duplicate cards. */
export function parseGroup(codes: string): Card[] {
  if (codes.trim() === '') throw new Error('empty card group {{}}');
  try {
    return parseCards(codes);
  } catch (e) {
    throw new Error(`bad card group {{${codes}}}: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }
}

/** HTML for a validated group; the same structure the <Cards> component renders. */
export function cardsHtml(codes: string): string {
  const faces = parseGroup(codes).map(cardFace);
  const label = faces.map((f) => f.name).join(', ');
  const inner = faces
    .map((f) => `<span class="pc suit-${f.suit}" aria-hidden="true">${f.rank}${f.glyph}</span>`)
    .join('');
  return `<span class="cards" role="img" aria-label="${label}">${inner}</span>`;
}

export type InlineSeg = { t: 'text'; text: string } | { t: 'cards'; codes: string; cards: Card[] };

const GROUP = /\{\{([^{}]*)\}\}/g;

/** Splits plain text around `{{cards}}` groups. Throws on a malformed group. */
export function splitInline(text: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  let last = 0;
  for (const m of text.matchAll(GROUP)) {
    const codes = m[1] ?? '';
    if (m.index > last) out.push({ t: 'text', text: text.slice(last, m.index) });
    out.push({ t: 'cards', codes, cards: parseGroup(codes) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}

/** Build-time check for text that is rendered at runtime (quiz text, scene step text). */
export function checkInline(text: string, what: string): void {
  try {
    splitInline(text);
  } catch (e) {
    throw new Error(`${what}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

const RANKS = '23456789TJQKA';
/** Hand class: pair '77', suited 'AKs', offsuit 'T9o' (high rank first, no duplicates for s/o). */
export function isHandClass(s: string): boolean {
  if (s.length === 2) return RANKS.includes(s.charAt(0)) && s.charAt(0) === s.charAt(1);
  if (s.length !== 3) return false;
  const a = RANKS.indexOf(s.charAt(0));
  const b = RANKS.indexOf(s.charAt(1));
  return a > b && b >= 0 && 'so'.includes(s.charAt(2));
}
