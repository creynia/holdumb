// Independent reference for the math tests: plain loops over the engine's evaluator and the
// engine's paytables. It shares no code with showdown.ts / enumerate.ts.
import { evaluateHand } from '../../engine/evaluator';
import { BLIND_PAYTABLES } from '../../engine/paytables';
import type { Card } from '../../engine/types';
import { frac } from '../fraction';
import type { Fraction } from '../types';

/** mulberry32 by Tommy Ettinger (public domain); tests only. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Net of Ante + Blind + Play (k units) in antes, for one final board and dealer hand. */
export function netAntes(
  hole: readonly Card[],
  dealer: readonly Card[],
  board: readonly Card[],
  k: number,
): number {
  const p = evaluateHand([...hole, ...board]);
  const d = evaluateHand([...dealer, ...board]);
  const qualifies = d.category !== 'high-card';
  if (p.value === d.value) return 0;
  const odds = BLIND_PAYTABLES['blind-standard'].pays[p.category];
  const bonus = odds ? odds[0] / odds[1] : 0;
  if (p.value > d.value) return (qualifies ? 1 : 0) + bonus + k;
  return -(qualifies ? 1 : 0) - 1 - k;
}

export function unseen(...groups: (readonly Card[])[]): Card[] {
  const dead = new Set(groups.flat());
  return Array.from({ length: 52 }, (_, i) => i).filter((c) => !dead.has(c));
}

/** Σ over the 990 dealer hands of the net, in antes, as an exact count of halves. */
export function riverSumX2(hole: readonly Card[], board: readonly Card[], k: number): number {
  const rest = unseen(hole, board);
  let s = 0;
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      s += Math.round(2 * netAntes(hole, [rest[i]!, rest[j]!], board, k));
    }
  }
  return s;
}

export function riverEv(hole: readonly Card[], board: readonly Card[], k: number): Fraction {
  return frac(riverSumX2(hole, board, k), 2 * 990);
}

/** Naive flop: 1,081 runouts × river-perfect play. Returns [Bet 2x, Check] exactly. */
export function flopEvNaive(hole: readonly Card[], flop: readonly Card[]): [Fraction, Fraction] {
  const rest = unseen(hole, flop);
  let s2 = 0;
  let sc = 0;
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const board = [...flop, rest[i]!, rest[j]!];
      s2 += riverSumX2(hole, board, 2);
      sc += Math.max(riverSumX2(hole, board, 1), -4 * 990);
    }
  }
  const d = 2 * 990 * 1081;
  return [frac(s2, d), frac(sc, d)];
}
