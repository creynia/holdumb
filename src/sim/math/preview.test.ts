import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine/cards';
import { betterAlternative } from './alternatives';
import { frac, sum, toRatio } from './fraction';
import { previewJob } from './preview';
import { flopEvNaive, mulberry32, riverEv } from './__tests__/reference';
import type { DecisionPreview, PreviewRequest } from './types';
import type { Card } from '../engine/types';
import { settleHand } from '../engine/wagers';
import { DEFAULT_RULES } from '../engine/rules';
import type { Fraction } from './types';

export function runPreview(req: PreviewRequest): DecisionPreview {
  const g = previewJob(req);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}
const req = (street: PreviewRequest['street'], hole: string, board = ''): PreviewRequest => ({
  street,
  hole: parseCards(hole) as [Card, Card],
  board: board ? parseCards(board) : [],
  blindPaytable: 'blind-standard',
  ante: 1000,
});
const evs = (p: DecisionPreview) => p.options.map((o) => toRatio(o.ev));

describe('river examples (simulator.md §2.5)', () => {
  it('ace high: raising beats folding by 317/990', () => {
    const p = runPreview(req('river', 'As 7c', 'Kd 9h 5c 3s 2d'));
    expect(evs(p)).toEqual(['-1663/990', '-2']);
    expect(p.bestIndex).toBe(0);
    expect(toRatio(p.options[1]!.regret)).toBe('317/990');
    expect(p.options[1]!.tier).toBe('costly');
    const rows = p.options[0]!.why.rows;
    expect(rows.map((r) => Number(r.count))).toEqual([0, 308, 9, 625, 48]);
    expect(rows.map((r) => toRatio(r.netAnte))).toEqual(['2', '1', '0', '-3', '-2']); // the spec table's +3 on the empty win-q row is a typo: 1 + 1 = 2
  });
  it('board plays: raising costs 71/198, so fold is best', () => {
    const p = runPreview(req('river', '3c 4d', 'Ah Ks Qd 9c 7h'));
    expect(evs(p)).toEqual(['-467/198', '-2']);
    expect(p.bestIndex).toBe(1);
    expect(toRatio(p.options[0]!.regret)).toBe('71/198');
    const rows = p.options[0]!.why.rows;
    expect(rows.map((r) => Number(r.count))).toEqual([0, 0, 129, 613, 248]);
  });
  it('a weak pair', () => {
    const p = runPreview(req('river', '8h 4h', '8c Kd Ts 6s 2c'));
    expect(toRatio(p.options[0]!.ev)).toBe('-23/90');
    const rows = p.options[0]!.why.rows;
    expect(rows.map((r) => Number(r.count))).toEqual([207, 611 - 207, 22, 357, 0]);
  });
});

describe('flop example (simulator.md §2.5)', () => {
  const p = runPreview(req('flop', 'Ah 7c', '7d Ks 2c'));
  it('hidden pair of sevens', () => {
    expect(evs(p)).toEqual(['178661/178365', '93143/178365']);
    expect(toRatio(p.options[1]!.regret)).toBe('28506/59455');
    expect(p.options[1]!.tier).toBe('costly');
    expect(p.options[1]!.assumesBestLater).toBe(true);
    expect(p.showdowns).toBe(1_070_190);
    expect(p.source).toBe('enumeration');
  });
  it('why rows sum exactly to the EV, with the cases total', () => {
    for (const o of p.options) {
      expect(toRatio(sum(o.why.rows.map((r) => r.contribution)))).toBe(toRatio(o.ev));
    }
    expect(p.options[0]!.why.rows.reduce((a, r) => a + r.count, 0n)).toBe(1_070_190n);
    expect(p.options[1]!.why.rows.reduce((a, r) => a + r.count, 0n)).toBe(1081n);
  });
});

describe('agreement with a naive loop over the engine evaluator', () => {
  it('200 random rivers', () => {
    const rnd = mulberry32(7);
    for (let n = 0; n < 200; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      const hole = deck.slice(0, 2) as [Card, Card];
      const board = deck.slice(2, 7);
      const p = runPreview({
        street: 'river',
        hole,
        board,
        blindPaytable: 'blind-standard',
        ante: 500,
      });
      expect(toRatio(p.options[0]!.ev)).toBe(toRatio(riverEv(hole, board, 1)));
      expect(p.options[1]!.ev).toEqual(frac(-2));
      expect(toRatio(sum(p.options[0]!.why.rows.map((r) => r.contribution)))).toBe(
        toRatio(p.options[0]!.ev),
      );
    }
  });
  it('3 random flops (3.2 M showdowns)', () => {
    const rnd = mulberry32(99);
    for (let n = 0; n < 3; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      const hole = deck.slice(0, 2) as [Card, Card];
      const flop = deck.slice(2, 5);
      const p = runPreview({
        street: 'flop',
        hole,
        board: flop,
        blindPaytable: 'blind-standard',
        ante: 500,
      });
      const [e2, ec] = flopEvNaive(hole, flop);
      expect([toRatio(p.options[0]!.ev), toRatio(p.options[1]!.ev)]).toEqual([
        toRatio(e2),
        toRatio(ec),
      ]);
    }
  }, 120_000);
});

describe('contract', () => {
  it('structuredClone round trip of a DecisionPreview', () => {
    const p = runPreview(req('river', 'As 7c', 'Kd 9h 5c 3s 2d'));
    expect(structuredClone(p)).toEqual(p);
  });
  it('evCents is ev × ante', () => {
    const p = runPreview(req('river', 'As 7c', 'Kd 9h 5c 3s 2d'));
    expect(toRatio(p.options[1]!.evCents)).toBe('-2000');
  });
  it('rejects bad requests', () => {
    expect(() => runPreview(req('flop', 'As 7c', 'Kd 9h'))).toThrow(/3 board cards/);
    expect(() => runPreview(req('river', 'As 7c', 'Kd 9h 5c 3s 7c'))).toThrow();
  });
  it('yields progress during the flop job', () => {
    const g = previewJob(req('flop', 'Ah 7c', '7d Ks 2c'));
    let seen = 0;
    let s = g.next();
    while (!s.done) {
      if (s.value) seen++;
      s = g.next();
    }
    expect(seen).toBeGreaterThanOrEqual(30);
  });
});

describe('better alternatives', () => {
  it('flop check of a made straight or flush uses flop-check-made', () => {
    let r = req('flop', '6h 5d', '7c 8s 9d');
    let p = runPreview(r);
    let a = betterAlternative(r, p, 1);
    expect(a?.copyKey).toBe('flop-check-made');
    expect(a?.vars).toEqual({ made: 'straight' });
    r = req('flop', 'Ah Th', '2h 7h Kh');
    p = runPreview(r);
    a = betterAlternative(r, p, 1);
    expect(a?.copyKey).toBe('flop-check-made');
    expect(a?.vars.made).toBe('flush');
    expect(a?.vars.flopReason).toBeUndefined();
  });
  it('river fold with a hidden pair', () => {
    const r = req('river', 'Td 4c', 'Ts Kh 7d 3s 2c');
    const p = runPreview(r);
    const a = betterAlternative(r, p, 1);
    expect(a?.copyKey).toBe('river-fold-hidden');
    expect(betterAlternative(r, p, p.bestIndex)).toBeNull();
  });
  it('river fold with few outs / board plays / many outs', () => {
    let r = req('river', 'As 7c', 'Kd 9h 5c 3s 2d');
    let p = runPreview(r);
    expect(betterAlternative(r, p, 1)?.copyKey).toBe('river-fold-low-outs');
    r = req('river', '4c 3d', 'As Ks Qs Jd Th');
    p = runPreview(r);
    expect(p.bestIndex).toBe(0);
    expect(betterAlternative(r, p, 1)?.copyKey).toBe('river-fold-board-plays');
    r = req('river', '3c 4d', 'Ah Ks Qd 9c 7h');
    p = runPreview(r);
    expect(betterAlternative(r, p, 0)?.copyKey).toBe('river-1x-high-outs');
  });
  it('flop check of a hidden pair names the pair', () => {
    const r = req('flop', 'Ah 7c', '7d Ks 2c');
    const p = runPreview(r);
    const a = betterAlternative(r, p, 1);
    expect(a?.copyKey).toBe('flop-check-hidden');
    expect(a?.vars.pairRank).toBe('7');
    expect(a?.basicException).toBeUndefined();
  });
});

describe('agreement with the engine settlement (settleHand)', () => {
  const ANTE = 200;
  const net = (hole: Card[], dealer: Card[], board: Card[], play: 1 | 2 | null): number =>
    settleHand(
      {
        player: hole as [Card, Card],
        dealer: dealer as [Card, Card],
        board: board as never,
        forced: false,
      },
      { ante: ANTE, blind: ANTE, trips: 0 },
      play ? { multiple: play } : null,
      play === null,
      DEFAULT_RULES,
    ).net;
  function deckWithout(dead: Card[]): Card[] {
    return Array.from({ length: 52 }, (_, i) => i).filter((c) => !dead.includes(c));
  }
  function riverAvg(hole: Card[], board: Card[], play: 1 | null): Fraction {
    const rest = deckWithout([...hole, ...board]);
    let total = 0;
    for (let i = 0; i < rest.length; i++)
      for (let j = i + 1; j < rest.length; j++)
        total += net(hole, [rest[i]!, rest[j]!], board, play);
    return frac(total, 990 * ANTE);
  }
  it('200 random rivers: both options equal the mean of settleHand', () => {
    const rnd = mulberry32(31);
    for (let n = 0; n < 200; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      const hole = deck.slice(0, 2) as [Card, Card];
      const board = deck.slice(2, 7);
      const p = runPreview({
        street: 'river',
        hole,
        board,
        blindPaytable: 'blind-standard',
        ante: ANTE,
      });
      expect(toRatio(p.options[0]!.ev)).toBe(toRatio(riverAvg(hole, board, 1)));
      expect(toRatio(p.options[1]!.ev)).toBe(toRatio(riverAvg(hole, board, null)));
    }
  });
  it('a flop: all 1,070,190 settleHand cases, 2x and check (best river play)', () => {
    const hole = parseCards('Ah 7c') as [Card, Card];
    const flop = parseCards('7d Ks 2c');
    const rest = deckWithout([...hole, ...flop]);
    let s2 = 0;
    let sc = 0;
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        const board = [...flop, rest[i]!, rest[j]!];
        const left = deckWithout([...hole, ...board]);
        let t2 = 0;
        let t1 = 0;
        for (let a = 0; a < left.length; a++) {
          for (let b = a + 1; b < left.length; b++) {
            const d = [left[a]!, left[b]!];
            t2 += net(hole, d, board, 2);
            t1 += net(hole, d, board, 1);
          }
        }
        s2 += t2;
        sc += Math.max(t1, -2 * ANTE * 990);
      }
    }
    const p = runPreview({
      street: 'flop',
      hole,
      board: flop,
      blindPaytable: 'blind-standard',
      ante: ANTE,
    });
    const d = 990 * 1081 * ANTE;
    expect([toRatio(p.options[0]!.ev), toRatio(p.options[1]!.ev)]).toEqual([
      toRatio(frac(s2, d)),
      toRatio(frac(sc, d)),
    ]);
  }, 120_000);
});
