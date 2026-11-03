// An independent check of the basic flop rules (decisions.md section 3), written from the spec
// and not from flopRules.ts: its own tiny categoriser, its own suit and rank counting. It shares
// nothing with flopRules.ts; basicFlopRule is only the thing under test.
import { describe, expect, it } from 'vitest';
import type { Card } from '../engine/types';
import { basicFlopRule } from './alternatives';

const rankOf = (c: number): number => c >> 2; // 0 = deuce .. 12 = ace
const suitOf = (c: number): number => c & 3;

/** Category of five cards: 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush, 6 full house, 7 quads. */
function categoryOfFive(cards: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  if (groups[0] === 4) return 7;
  if (groups[0] === 3 && groups[1] === 2) return 6;
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  const wheel = ranks.join(',') === '0,1,2,3,12';
  const straight = ranks.length === 5 && (wheel || ranks[4]! - ranks[0]! === 4);
  if (flush) return 5;
  if (straight) return 4;
  if (groups[0] === 3) return 3;
  if (groups[0] === 2 && groups[1] === 2) return 2;
  if (groups[0] === 2) return 1;
  return 0;
}

/** Category of the three flop cards alone: trips 3, a pair 1, otherwise 0. */
function flopOwn(flop: readonly number[]): number {
  const r = flop.map(rankOf);
  if (r[0] === r[1] && r[1] === r[2]) return 3;
  return r[0] === r[1] || r[0] === r[2] || r[1] === r[2] ? 1 : 0;
}

/** The letter for one hole and flop, from the spec: (a), else (b), else (c), else none. */
function oracle(hole: readonly number[], flop: readonly number[]): 'a' | 'b' | 'c' | null {
  // (a) category of the best five of hole + flop is at least two pair and above the flop's own.
  const five = categoryOfFive([...hole, ...flop]);
  if (five >= 2 && five > flopOwn(flop)) return 'a';
  // (b) a pocket pair other than deuces, or a hole card matching a flop rank.
  const [h0, h1] = hole.map(rankOf) as [number, number];
  if (h0 === h1 && h0 !== 0) return 'b';
  if (flop.some((f) => rankOf(f) === h0 || rankOf(f) === h1)) return 'b';
  // (c) four of one suit among hole + flop, and a hole card of that suit is ten or higher.
  const suits = [0, 0, 0, 0];
  for (const c of [...hole, ...flop]) suits[suitOf(c)]!++;
  for (const c of hole) if (suits[suitOf(c)]! >= 4 && rankOf(c) >= 8) return 'c';
  return null;
}

/** Deterministic random five distinct cards from a 52-card deck, seeded so every run is the same. */
function deals(count: number, seed: number): [number[], number[]][] {
  // mulberry32: exact 32-bit integer maths (Math.imul), so the sequence does not degenerate.
  let s = seed >>> 0;
  const next = (m: number) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % m;
  };
  const out: [number[], number[]][] = [];
  for (let i = 0; i < count; i++) {
    const pick: number[] = [];
    while (pick.length < 5) {
      const c = next(52);
      if (!pick.includes(c)) pick.push(c);
    }
    out.push([pick.slice(0, 2), pick.slice(2, 5)]);
  }
  return out;
}

describe('basicFlopRule against an independent reading of decisions.md section 3', () => {
  it('gives the same rule letter as the spec on 5,000 random flops', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, none: 0 };
    for (const [hole, flop] of deals(5000, 20260304)) {
      const want = oracle(hole, flop);
      const got = basicFlopRule(hole as [Card, Card], flop).rule;
      counts[want ?? 'none']!++;
      expect(got, `hole ${hole.join(',')} flop ${flop.join(',')}`).toBe(want);
    }
    // every branch of the rule was exercised, so the agreement means something
    expect(counts.a!).toBeGreaterThan(50);
    expect(counts.b!).toBeGreaterThan(1000);
    expect(counts.c!).toBeGreaterThan(20);
    expect(counts.none!).toBeGreaterThan(1000);
  });
});
