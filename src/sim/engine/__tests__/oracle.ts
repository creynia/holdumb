/**
 * Textbook poker oracle. Deliberately independent of evaluator.ts: it sorts ranks, groups counts
 * and applies the rules in the order a rulebook states them. No bit tricks.
 * Returns an order key (larger = stronger) that is NOT the packed HandValue.
 */
const B = 13;

/** Strength key of exactly five cards (Card = rank * 4 + suit). */
export function oracleKey5(cards: readonly number[]): number {
  const ranks = cards.map((c) => Math.floor(c / 4)).sort((a, b) => b - a);
  const flush = cards.every((c) => c % 4 === cards[0]! % 4);
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks.join() === '12,3,2,1,0') straightHigh = 3; // wheel
  }
  // groups sorted by count desc then rank desc
  const groups = uniq
    .map((r) => ({ r, n: ranks.filter((x) => x === r).length }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const counts = groups.map((g) => g.n).join('');
  let cat: number;
  let tie: number[];
  if (straightHigh >= 0 && flush) {
    cat = straightHigh === 12 ? 9 : 8;
    tie = [straightHigh];
  } else if (counts === '41') {
    cat = 7;
    tie = groups.map((g) => g.r);
  } else if (counts === '32') {
    cat = 6;
    tie = groups.map((g) => g.r);
  } else if (flush) {
    cat = 5;
    tie = ranks;
  } else if (straightHigh >= 0) {
    cat = 4;
    tie = [straightHigh];
  } else if (counts === '311') {
    cat = 3;
    tie = groups.map((g) => g.r);
  } else if (counts === '221') {
    cat = 2;
    tie = groups.map((g) => g.r);
  } else if (counts === '2111') {
    cat = 1;
    tie = groups.map((g) => g.r);
  } else {
    cat = 0;
    tie = ranks;
  }
  let key = cat;
  for (let i = 0; i < 5; i++) key = key * B + (tie[i] ?? 0);
  return key;
}

export const ORACLE_CATEGORY_NAMES = [
  'high-card',
  'pair',
  'two-pair',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
  'royal-flush',
] as const;

export function oracleCategory(key: number): number {
  return Math.floor(key / B ** 5);
}

/** Best five of 5..7 cards by brute force over all 5-subsets. */
export function oracleKeyBest(cards: readonly number[]): number {
  const n = cards.length;
  let best = -1;
  const pick: number[] = [];
  const rec = (start: number): void => {
    if (pick.length === 5) {
      const k = oracleKey5(pick);
      if (k > best) best = k;
      return;
    }
    for (let i = start; i < n; i++) {
      pick.push(cards[i]!);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best;
}
