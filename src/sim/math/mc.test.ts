// Monte Carlo cross-checks (simulator.md §6.3): fixed seeds, 4 sigma, independent of the exact code.
import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine/cards';
import { evaluateHand } from '../engine/evaluator';
import { TRIPS_PAYTABLES } from '../engine/paytables';
import type { Card, TripsPaytableId } from '../engine/types';
import { tripsEdge } from './edges';
import { toNumber } from './fraction';
import { previewJob, preflopPreview } from './preview';
import { mulberry32, netAntes } from './__tests__/reference';
import type { PreviewRequest } from './types';

function shuffled(rnd: () => number, exclude: readonly Card[] = []): Card[] {
  const deck = Array.from({ length: 52 }, (_, i) => i).filter((c) => !exclude.includes(c));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}
function stats(xs: number[]): { mean: number; se: number } {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(v / n) };
}
function exact(req: PreviewRequest) {
  const g = previewJob(req);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}

describe('Trips mean vs exact edge', () => {
  it.each(Object.keys(TRIPS_PAYTABLES) as TripsPaytableId[])(
    '%s',
    (id) => {
      const rnd = mulberry32(1234);
      const pays = TRIPS_PAYTABLES[id].pays;
      const xs: number[] = [];
      for (let i = 0; i < 400_000; i++) {
        const d = shuffled(rnd).slice(0, 7);
        const odds = pays[evaluateHand(d).category];
        xs.push(odds ? odds[0] / odds[1] : -1);
      }
      const { mean, se } = stats(xs);
      const ev = -toNumber(tripsEdge(id).edge);
      expect(Math.abs(mean - ev)).toBeLessThan(4 * se);
    },
    120_000,
  );
});

describe('flop preview vs sampled (runout, dealer) cases', () => {
  it.each([
    ['Ah 7c', '7d Ks 2c'],
    ['9s 8d', 'Ks Kd 4c'],
    ['Th 4h', 'Jh 8h 2c'],
  ])(
    '%s on %s',
    (holeS, flopS) => {
      const hole = parseCards(holeS) as [Card, Card];
      const flop = parseCards(flopS);
      const p = exact({
        street: 'flop',
        hole,
        board: flop,
        blindPaytable: 'blind-standard',
        ante: 1000,
      });
      const rnd = mulberry32(5);
      const two: number[] = [];
      for (let i = 0; i < 60_000; i++) {
        const deck = shuffled(rnd, [...hole, ...flop]);
        const board = [...flop, deck[0]!, deck[1]!];
        const dealer = [deck[2]!, deck[3]!];
        two.push(netAntes(hole, dealer, board, 2));
      }
      const s2 = stats(two);
      expect(Math.abs(s2.mean - toNumber(p.options[0]!.ev))).toBeLessThan(4 * s2.se);
      // Check: sample runouts, take the exact best river EV on each, compare with the exact mean.
      const best: number[] = [];
      for (let i = 0; i < 3000; i++) {
        const deck = shuffled(rnd, [...hole, ...flop]);
        const r = exact({
          street: 'river',
          hole,
          board: [...flop, deck[0]!, deck[1]!],
          blindPaytable: 'blind-standard',
          ante: 1000,
        });
        best.push(toNumber(r.options[r.bestIndex]!.ev));
      }
      const sc = stats(best);
      expect(Math.abs(sc.mean - toNumber(p.options[1]!.ev))).toBeLessThan(4 * sc.se);
    },
    120_000,
  );
});

describe('preflop table vs sampled boards', () => {
  it.each(['AA', 'AKs', '72o', 'T9s', 'K5o', 'Q6s'])(
    'Bet 4x %s',
    (name) => {
      const suited = name.endsWith('s');
      const r1 = '23456789TJQKA'.indexOf(name[0]!);
      const r2 = '23456789TJQKA'.indexOf(name[1]!);
      const hole: [Card, Card] = [r1 * 4, r2 * 4 + (name.length === 2 ? 1 : suited ? 0 : 1)];
      const p = preflopPreview({
        street: 'preflop',
        hole,
        board: [],
        blindPaytable: 'blind-standard',
        ante: 1000,
      });
      const rnd = mulberry32(11);
      const xs: number[] = [];
      for (let i = 0; i < 150_000; i++) {
        const d = shuffled(rnd, hole);
        xs.push(netAntes(hole, [d[0]!, d[1]!], d.slice(2, 7), 4));
      }
      const s = stats(xs);
      expect(Math.abs(s.mean - toNumber(p.options[0]!.ev))).toBeLessThan(4 * s.se);
    },
    120_000,
  );
});
