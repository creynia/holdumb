/**
 * Bitmask hand evaluator (simulator.md §1.7). No lookup tables, no allocation on the hot path.
 *
 * Ranks are bits 0..12 (deuce..ace) of four 13-bit suit masks. `HandValue` packs
 * `category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5`; larger wins, equal ties.
 * Key ranks per category: straight/straight flush/royal k1 = top rank (the wheel has top 3);
 * flush k1..k5; quads k1 quad, k2 kicker; full house k1 trips, k2 pair; trips k1 + two kickers;
 * two pair k1 high pair, k2 low pair, k3 kicker; pair k1 + three kickers; high card k1..k5.
 */
import { HAND_CATEGORIES } from './types';
import type { Card, EvaluatedHand, HandCategory, HandValue } from './types';

const CAT_SHIFT = 20;

/** Index of the highest set bit (m > 0). */
function top(m: number): number {
  return 31 - Math.clz32(m);
}

/** Top rank of the best straight in a 13-bit rank mask (wheel = 3), or -1. */
function straightTop(m: number): number {
  const a = (m << 1) | ((m >> 12) & 1); // bit 0 = ace-low, bit i+1 = rank i
  const s = a & (a >> 1) & (a >> 2) & (a >> 3) & (a >> 4);
  return s === 0 ? -1 : top(s) + 3;
}

/** Packs the highest `n` ranks of mask `m` into nibbles from shift 16 downwards. */
function kickers(m: number, n: number, shift: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const t = top(m);
    v |= t << shift;
    shift -= 4;
    m &= ~(1 << t);
  }
  return v;
}

/**
 * Evaluates 5..7 cards given as four 13-bit suit masks. This is the hot path for the EV module:
 * precompute the board masks once and OR two more cards in per dealer combination.
 * The optional fifth argument (per-rank counts) is accepted for API compatibility and ignored.
 */
export function evalMasks(
  s0: number,
  s1: number,
  s2: number,
  s3: number,
  _counts?: ArrayLike<number>,
): HandValue {
  // Flush (5+ in one suit). In <= 7 cards it excludes quads and full houses.
  let f = popAtLeast5(s0) ? s0 : 0;
  if (f === 0 && popAtLeast5(s1)) f = s1;
  if (f === 0 && popAtLeast5(s2)) f = s2;
  if (f === 0 && popAtLeast5(s3)) f = s3;
  if (f !== 0) {
    const st = straightTop(f);
    if (st >= 0) return ((st === 12 ? 9 : 8) << CAT_SHIFT) | (st << 16);
    return (5 << CAT_SHIFT) | kickers(f, 5, 16);
  }

  const or = s0 | s1 | s2 | s3;
  const p01 = s0 & s1;
  const p23 = s2 & s3;
  const m4 = p01 & p23;
  if (m4 !== 0) {
    const q = top(m4);
    return (7 << CAT_SHIFT) | (q << 16) | (top(or & ~(1 << q)) << 12);
  }
  const m3 = (p01 & (s2 | s3)) | (p23 & (s0 | s1));
  const m2 = p01 | p23 | ((s0 | s1) & (s2 | s3)); // rank has >= 2 cards (includes trips)
  if (m3 !== 0) {
    const t = top(m3);
    const rest = m2 & ~(1 << t);
    if (rest !== 0) return (6 << CAT_SHIFT) | (t << 16) | (top(rest) << 12);
  }
  const st = straightTop(or);
  if (st >= 0) return (4 << CAT_SHIFT) | (st << 16);
  if (m3 !== 0) {
    const t = top(m3);
    return (3 << CAT_SHIFT) | (t << 16) | kickers(or & ~(1 << t), 2, 12);
  }
  if (m2 !== 0) {
    const p1 = top(m2);
    const rest = m2 & ~(1 << p1);
    if (rest !== 0) {
      const p2 = top(rest);
      return (2 << CAT_SHIFT) | (p1 << 16) | (p2 << 12) | (top(or & ~((1 << p1) | (1 << p2))) << 8);
    }
    return (1 << CAT_SHIFT) | (p1 << 16) | kickers(or & ~(1 << p1), 3, 12);
  }
  return kickers(or, 5, 16);
}

/** True when the 13-bit mask has at least five bits set. */
function popAtLeast5(m: number): boolean {
  if (m === 0) return false;
  m &= m - 1;
  m &= m - 1;
  m &= m - 1;
  m &= m - 1;
  return m !== 0;
}

/** Hot path: packed value of 5..7 cards. */
export function handValueOf(cards: readonly Card[]): HandValue {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!;
    const b = 1 << (c >> 2);
    switch (c & 3) {
      case 0:
        s0 |= b;
        break;
      case 1:
        s1 |= b;
        break;
      case 2:
        s2 |= b;
        break;
      default:
        s3 |= b;
    }
  }
  return evalMasks(s0, s1, s2, s3);
}

export function categoryOf(value: HandValue): HandCategory {
  return HAND_CATEGORIES[value >>> CAT_SHIFT]!;
}

/** Key ranks (k1..k5) of a packed value. */
function keysOf(value: HandValue): number[] {
  return [16, 12, 8, 4, 0].map((s) => (value >>> s) & 15);
}

/** Picks `count` cards of `rank` (optionally only of `suit`) from `pool`, in suit order. */
function pick(pool: readonly Card[], rank: number, count: number, suit: number): Card[] {
  const out: Card[] = [];
  for (const c of pool) {
    if (out.length === count) break;
    if (c >> 2 === rank && (suit < 0 || (c & 3) === suit)) out.push(c);
  }
  return out;
}

function best5Of(cards: readonly Card[], value: HandValue): Card[] {
  const cat = value >>> CAT_SHIFT;
  const k = keysOf(value);
  // Highest ranks first within each group; the wheel's ace plays low.
  let spec: [number, number][];
  let suit = -1;
  if (cat === 8 || cat === 9 || cat === 5) {
    // Find the flush suit.
    const counts = [0, 0, 0, 0];
    for (const c of cards) counts[c & 3]!++;
    suit = counts.findIndex((n) => n >= 5);
  }
  switch (cat) {
    case 9:
    case 8:
    case 4: {
      const t = k[0]!;
      spec = [0, 1, 2, 3, 4].map((i) => [(t - i + 13) % 13, 1] as [number, number]);
      break;
    }
    case 5:
      spec = k.map((r) => [r, 1] as [number, number]);
      break;
    case 7:
      spec = [
        [k[0]!, 4],
        [k[1]!, 1],
      ];
      break;
    case 6:
      spec = [
        [k[0]!, 3],
        [k[1]!, 2],
      ];
      break;
    case 3:
      spec = [
        [k[0]!, 3],
        [k[1]!, 1],
        [k[2]!, 1],
      ];
      break;
    case 2:
      spec = [
        [k[0]!, 2],
        [k[1]!, 2],
        [k[2]!, 1],
      ];
      break;
    case 1:
      spec = [
        [k[0]!, 2],
        [k[1]!, 1],
        [k[2]!, 1],
        [k[3]!, 1],
      ];
      break;
    default:
      spec = k.map((r) => [r, 1] as [number, number]);
  }
  const out: Card[] = [];
  for (const [rank, n] of spec) out.push(...pick(cards, rank, n, suit));
  return out;
}

/** Full result with `best5` (UI, tests, settlement). Accepts 5..7 distinct cards. */
export function evaluateN(cards: readonly Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateN needs 5 to 7 cards, got ${cards.length}`);
  }
  const value = handValueOf(cards);
  return { value, category: categoryOf(value), best5: best5Of(cards, value) };
}
/** Same as `evaluateN`, named for the 7-card (hole + board) case. */
export function evaluate7(cards: readonly Card[]): EvaluatedHand {
  return evaluateN(cards);
}
export const evaluateHand = evaluateN;
/** Exactly five cards. */
export function evaluate5(cards: readonly Card[]): EvaluatedHand {
  if (cards.length !== 5) throw new Error(`evaluate5 needs 5 cards, got ${cards.length}`);
  return evaluateN(cards);
}

export function compareHands(a: { value: HandValue }, b: { value: HandValue }): number {
  return Math.sign(a.value - b.value);
}

const PLURAL = [
  'Twos',
  'Threes',
  'Fours',
  'Fives',
  'Sixes',
  'Sevens',
  'Eights',
  'Nines',
  'Tens',
  'Jacks',
  'Queens',
  'Kings',
  'Aces',
];
const SINGLE = [
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
const plural = (r: number): string => PLURAL[r]!.toLowerCase();

/** "Two pair, kings and sevens", "Straight, ten high". */
export function describeHand(h: { value: HandValue }): string {
  const k = keysOf(h.value);
  const k0 = k[0]!;
  const k1 = k[1]!;
  switch (h.value >>> CAT_SHIFT) {
    case 9:
      return 'Royal flush';
    case 8:
      return `Straight flush, ${SINGLE[k0]} high`;
    case 7:
      return `Four of a kind, ${plural(k0)}`;
    case 6:
      return `Full house, ${plural(k0)} full of ${plural(k1)}`;
    case 5:
      return `Flush, ${SINGLE[k0]} high`;
    case 4:
      return `Straight, ${SINGLE[k0]} high`;
    case 3:
      return `Three of a kind, ${plural(k0)}`;
    case 2:
      return `Two pair, ${plural(k0)} and ${plural(k1)}`;
    case 1:
      return `Pair of ${plural(k0)}`;
    default:
      return `${SINGLE[k0]!.replace(/^./, (c) => c.toUpperCase())} high`;
  }
}
