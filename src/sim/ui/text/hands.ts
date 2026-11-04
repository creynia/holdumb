// Text helpers (hands); re-exported unchanged by ../text.ts (I082 split).
import type { EvaluatedHand } from '../../engine';

// ---------- hands and settlements ----------

export const CATEGORY_NAME: Record<EvaluatedHand['category'], string> = {
  'high-card': 'high card',
  pair: 'pair',
  'two-pair': 'two pair',
  trips: 'three of a kind',
  straight: 'straight',
  flush: 'flush',
  'full-house': 'full house',
  quads: 'four of a kind',
  'straight-flush': 'straight flush',
  'royal-flush': 'royal flush',
};
const RANK_PLURAL = [
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'sevens',
  'eights',
  'nines',
  'tens',
  'jacks',
  'queens',
  'kings',
  'aces',
];
export const RANK_SINGULAR = [
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'jack',
  'queen',
  'king',
  'ace',
];

/** "pair of kings", "straight", "ace high" (the lead card of best5 names pairs, trips and quads). */
export function handName(h: EvaluatedHand): string {
  const lead = h.best5[0];
  const rank = lead === undefined ? -1 : lead >> 2;
  if (rank >= 0) {
    if (h.category === 'pair') return `pair of ${RANK_PLURAL[rank]}`;
    if (h.category === 'trips') return `three ${RANK_PLURAL[rank]}`;
    if (h.category === 'quads') return `four ${RANK_PLURAL[rank]}`;
    if (h.category === 'high-card') return `${RANK_SINGULAR[rank]} high`;
  }
  return CATEGORY_NAME[h.category];
}
export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function withArticle(name: string): string {
  return /^(pair|straight|flush|full house|royal flush)/.test(name) ? `a ${name}` : name;
}
/** Hands named in the plural ("three aces", "two pair", "kings and nines") take "beat", not "beats". */
export const plural = (h: EvaluatedHand): boolean =>
  h.category === 'two-pair' || h.category === 'trips' || h.category === 'quads';

/** Rank index (0 = deuce .. 12 = ace) of kicker slot k (0 = k1 .. 4 = k5) of a packed HandValue. */
const slot = (value: number, k: number): number => (value >> (16 - 4 * k)) & 0xf;

/** First slot (0..4) where two same-category hands differ, or -1 when their values match. */
function firstDiff(a: number, b: number): number {
  for (let k = 0; k < 5; k++) if (slot(a, k) !== slot(b, k)) return k;
  return -1;
}

const listOf = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * The hand named down to the first card that differs from the other hand, so two hands in the
 * same category read as different: "king-queen high" vs "king-nine high", "pair of tens, ace
 * kicker", "kings and nines", "three queens, ace kicker", "king-high flush". Other categories and
 * equal values keep the short name from handName.
 */
export function handNameVs(h: EvaluatedHand, other: EvaluatedHand): string {
  if (h.category !== other.category) return handName(h);
  const d = firstDiff(h.value, other.value);
  if (d < 0) return handName(h);
  const v = h.value;
  const rank = (k: number) => slot(v, k);
  const kick = (k: number) => `${RANK_SINGULAR[rank(k)]} kicker`;
  // Kickers from the first down to the first difference: "ace kicker", "ace-eight kickers",
  // "ace-eight-four kickers". A first-kicker decider keeps the single-kicker wording.
  const kickersTo = (last: number) =>
    last === 1
      ? kick(1)
      : `${Array.from({ length: last }, (_, i) => RANK_SINGULAR[rank(i + 1)]).join('-')} kickers`;
  switch (h.category) {
    case 'high-card':
      return `${[0, 1, 2, 3, 4]
        .slice(0, d + 1)
        .map((k) => RANK_SINGULAR[rank(k)])
        .join('-')} high`;
    case 'flush':
      return `${[0, 1, 2, 3, 4]
        .slice(0, d + 1)
        .map((k) => RANK_SINGULAR[rank(k)])
        .join('-')}-high flush`;
    case 'straight':
      return `${RANK_SINGULAR[rank(0)]}-high straight`;
    case 'straight-flush':
      return `${RANK_SINGULAR[rank(0)]}-high straight flush`;
    case 'pair':
      return `pair of ${RANK_PLURAL[rank(0)]}${d >= 1 ? `, ${kickersTo(d)}` : ''}`;
    case 'two-pair':
      return `${RANK_PLURAL[rank(0)]} and ${RANK_PLURAL[rank(1)]}${d >= 2 ? `, ${kick(d)}` : ''}`;
    case 'trips':
      return `three ${RANK_PLURAL[rank(0)]}${d >= 1 ? `, ${kickersTo(d)}` : ''}`;
    case 'quads':
      return `four ${RANK_PLURAL[rank(0)]}${d >= 1 ? `, ${kick(d)}` : ''}`;
    case 'full-house':
      return `${RANK_PLURAL[rank(0)]} full of ${RANK_PLURAL[rank(1)]}`;
    default:
      return handName(h);
  }
}

/** Every rank of a hand, kickers included: "two pair, aces and kings, queen kicker". */
export function describeAllRanks(h: EvaluatedHand): string {
  const v = h.value;
  const rank = (k: number) => slot(v, k);
  const kickers = (from: number, to: number): string[] =>
    Array.from({ length: to - from + 1 }, (_, i) => RANK_SINGULAR[rank(from + i)]!);
  const word = (n: number) => (n === 1 ? 'kicker' : 'kickers');
  switch (h.category) {
    case 'two-pair':
      return `two pair, ${RANK_PLURAL[rank(0)]} and ${RANK_PLURAL[rank(1)]}, ${listOf(kickers(2, 2))} kicker`;
    case 'pair':
      return `pair of ${RANK_PLURAL[rank(0)]}, ${listOf(kickers(1, 3))} ${word(3)}`;
    case 'trips':
      return `three ${RANK_PLURAL[rank(0)]}, ${listOf(kickers(1, 2))} ${word(2)}`;
    case 'quads':
      return `four ${RANK_PLURAL[rank(0)]}, ${listOf(kickers(1, 1))} kicker`;
    case 'high-card':
      return `${kickers(0, 4).join('-')} high`;
    case 'flush':
      return `${kickers(0, 4).join('-')}-high flush`;
    case 'straight':
      return `${RANK_SINGULAR[rank(0)]}-high straight`;
    case 'full-house':
      return `${RANK_PLURAL[rank(0)]} full of ${RANK_PLURAL[rank(1)]}`;
    default:
      return handName(h);
  }
}

/** The tie line: "Tie: you both play the board (two pair, aces and kings, queen kicker)." */
