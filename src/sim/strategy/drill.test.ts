import { describe, expect, it } from 'vitest';
import { seedRng } from '../engine/rng';
import type { Card, RngState } from '../engine/types';
import { categorize } from './categories';
import { preflopRow } from '../math/preflop';
import { previewJob } from '../math/preview';
import {
  MIXED_STREET_WEIGHTS,
  gradeSpot,
  nextSpot,
  pickOutsCategory,
  secondBestRegret,
  spotCode,
  spotFromCode,
} from './drill';
import { classRep, classWeight } from './ranks';
import { matchesAny } from './predicates';
import { handClass } from './ranks';
import { PREFLOP_4X_PERFECT, RULE_DEFS } from './rules';
import { DRILL_CATEGORY_IDS } from './types';
import type { DrillCategoryId, DrillFilter, DrillSpot } from './types';
import { riverFacts } from '../math/alternatives';
import { parseCards } from '../engine/cards';

function many(filter: DrillFilter, n: number, seed = 1): DrillSpot[] {
  let r: RngState = seedRng(seed);
  const out: DrillSpot[] = [];
  for (let i = 0; i < n; i++) {
    let s: DrillSpot;
    [s, r] = nextSpot(r, filter);
    out.push(s);
  }
  return out;
}

describe('drill', () => {
  it('codes round-trip', () => {
    for (const s of many({ street: 'mixed' }, 150)) expect(spotFromCode(s.code)).toEqual(s);
    const hole = parseCards('Ah7c');
    const board = parseCards('7dKs2c');
    expect(
      spotCode({ street: 'flop', hole: [hole[0]!, hole[1]!], board, category: 'flop-nothing' }),
    ).toBe('f:Ah7c.7dKs2c');
    expect(spotFromCode('p:AhKd.').board).toEqual([]);
  });
  it('is seeded', () => {
    expect(many({ street: 'mixed' }, 20, 5).map((s) => s.code)).toEqual(
      many({ street: 'mixed' }, 20, 5).map((s) => s.code),
    );
  });
  it('every one of the 18 categories can be drawn and matches its filter', () => {
    for (const category of DRILL_CATEGORY_IDS) {
      const spots = many({ street: 'mixed', category }, 6, 3);
      for (const s of spots) {
        expect(s.category).toBe(category);
        expect(categorize(s.hole, s.board)).toBe(category);
      }
    }
  });
  it('flop spots come only from chart-check hands; river also from flop-check hands', () => {
    const chart = new Set(PREFLOP_4X_PERFECT);
    for (const s of many({ street: 'flop' }, 300)) {
      expect(s.board).toHaveLength(3);
      expect(chart.has(handClass(s.hole))).toBe(false);
    }
    for (const s of many({ street: 'river' }, 150)) {
      expect(s.board).toHaveLength(5);
      expect(chart.has(handClass(s.hole))).toBe(false);
      expect(matchesAny(RULE_DEFS.basic.flop2x, s.hole, s.board.slice(0, 3))).toBe(false);
    }
  });
  it('pinned category examples (curriculum 9.1)', () => {
    const c = (h: string, b: string) => {
      const hole = parseCards(h);
      return categorize([hole[0]!, hole[1]!], parseCards(b));
    };
    expect(c('Ah Kd', '')).toBe('pre-premium');
    expect(c('Ac 2d', '')).toBe('pre-ace');
    expect(c('Kc 4d', '')).toBe('pre-king');
    expect(c('Qc 8d', '')).toBe('pre-queen-jack');
    expect(c('2c 2d', '')).toBe('pre-small-pair');
    expect(c('Ts 9s', '')).toBe('pre-low');
    expect(c('9s 7d', '9h Kc 2s')).toBe('flop-hidden-pair');
    expect(c('Qc 5d', 'Qs 5h 9d')).toBe('flop-two-pair-plus');
    expect(c('9c 8d', 'Ks Kd 4c')).toBe('flop-board-pair');
    expect(c('Th 4h', 'Jh 8h 2c')).toBe('flop-flush-draw');
    expect(c('9c 8d', 'Ts 7h 2c')).toBe('flop-straight-draw');
    expect(c('Kc 3d', '8s 5h 2c')).toBe('flop-nothing');
    expect(c('2c 2d', '9s 9h 5c')).toBe('flop-deuces');
    expect(c('2c 2d', '9s 7h 5c')).toBe('flop-deuces');
    expect(c('2c 2d', '2s 9h 5c')).toBe('flop-two-pair-plus');
    expect(c('Td 4c', 'Ts Kh 7d 3s 2c')).toBe('river-hidden-pair');
    expect(c('Qc 7d', 'Kd Jh 9s 5c 2d')).toBe('river-outs-edge');
    expect(c('Jc 9d', '8s 8h 5c 3d 2s')).toBe('river-outs-edge');
    expect(c('8c 6d', 'Kh Qs 4d 3c 2h')).toBe('river-outs-high');
    expect(c('4c 3d', 'As Ks Qs Jd Th')).toBe('river-board-plays');
  });
  it('flop deuces: exact previews pin the reminder (check, check, 2x on a set)', () => {
    const ev = (hole: string, flop: string, multiple: number) => {
      const g = previewJob({
        street: 'flop',
        hole: parseCards(hole) as [Card, Card],
        board: parseCards(flop),
        blindPaytable: 'blind-standard',
        ante: 1000,
      });
      let s = g.next();
      while (!s.done) s = g.next();
      const o = s.value.options.find(
        (x) =>
          x.action.type === (multiple ? 'play' : 'check') &&
          (!multiple || (x.action as { multiple?: number }).multiple === multiple),
      )!;
      return o.ev;
    };
    const eq = (a: { num: bigint; den: bigint }, n: bigint, d: bigint) =>
      expect(a.num * d).toBe(n * a.den);
    eq(ev('2c 2d', '9s 9h 5c', 0), -23377n, 178365n);
    eq(ev('2c 2d', '9s 9h 5c', 2), -6749n, 23782n);
    eq(ev('2c 2d', '9s 7h 5c', 0), -216725n, 214038n);
    eq(ev('2c 2d', '9s 7h 5c', 2), -651571n, 535095n);
    eq(ev('2c 2d', '2s 9h 5c', 2), 84915n, 23782n);
    eq(ev('2c 2d', '2s 9h 5c', 0), 320527n, 118910n);
  });
  it('interesting spots: about 60% close', () => {
    let tableReady = true;
    try {
      preflopRow('blind-standard', 'AA');
      preflopRow('blind-standard', '88');
    } catch {
      tableReady = false; // preflop table not generated yet (math WP)
    }
    for (const street of tableReady ? (['preflop', 'river'] as const) : (['river'] as const)) {
      const spots = many({ street, interesting: true }, 400, 9);
      let close = 0;
      for (const sp of spots) {
        const g = previewJob({
          street,
          hole: sp.hole,
          board: sp.board,
          blindPaytable: 'blind-standard',
          ante: 100,
        });
        let st = g.next();
        while (!st.done) st = g.next();
        if (secondBestRegret(st.value) < 0.25) close++;
      }
      expect(close / 400).toBeGreaterThan(0.5);
      expect(close / 400).toBeLessThan(0.7);
    }
  });
});

describe('grading', () => {
  it('correct iff best or close; practical grades against the basic card', () => {
    const spot = spotFromCode('r:Qc7d.KdJh9s5c2d');
    const g = previewJob({
      street: 'river',
      hole: spot.hole,
      board: spot.board,
      blindPaytable: 'blind-standard',
      ante: 1000,
    });
    let st = g.next();
    while (!st.done) st = g.next();
    const preview = st.value;
    const best = preview.options[preview.bestIndex]!.action;
    const other = preview.options.find((o) => o.action.type !== best.type)!.action;
    expect(gradeSpot(spot, best, preview, 'perfect').correct).toBe(true);
    const bad = gradeSpot(spot, other, preview, 'perfect');
    expect(bad.correct).toBe(bad.regret.num === 0n || bad.regret.num * 50n < bad.regret.den);
    expect(gradeSpot(spot, { type: 'play', multiple: 1 }, preview, 'practical').correct).toBe(true);
    expect(gradeSpot(spot, { type: 'fold' }, preview, 'practical').correct).toBe(false);
    expect(gradeSpot(spot, best, preview, 'perfect').chartCell).toBe('river-outs-edge');
  });
});

describe('interesting + category', () => {
  it('never throws, for all 18 categories x 4 seeds', () => {
    for (const category of DRILL_CATEGORY_IDS)
      for (const seed of [1, 2, 3, 4]) {
        const [s] = nextSpot(seedRng(seed), { street: 'mixed', category, interesting: true });
        expect(s.category).toBe(category);
      }
  }, 120_000);
});

describe('preflop classes match curriculum 9.1', () => {
  // Copied from docs/design/curriculum.md §9.1: pre-premium is "pairs 77+, AK–AT, KQ, KJs";
  // pre-king is "K2–KJ offsuit, K2–KT suited" (KJo is pre-king, KJs is premium).
  const PREMIUM = new Set([
    'AA',
    'KK',
    'QQ',
    'JJ',
    'TT',
    '99',
    '88',
    '77',
    'AKs',
    'AKo',
    'AQs',
    'AQo',
    'AJs',
    'AJo',
    'ATs',
    'ATo',
    'KQs',
    'KQo',
    'KJs',
  ]);
  const KING = new Set([
    ...[...'23456789TJ'].map((r) => `K${r}o`),
    ...[...'23456789T'].map((r) => `K${r}s`),
  ]);
  it('gives every one of the 169 classes one category, and the doc places the kings', () => {
    const R = '23456789TJQKA';
    const classes: string[] = [];
    for (let i = 0; i < 13; i++) {
      for (let j = 0; j <= i; j++) {
        const hi = R[i]!;
        const lo = R[j]!;
        if (i === j) {
          classes.push(hi + lo);
          continue;
        }
        classes.push(`${hi}${lo}s`, `${hi}${lo}o`);
      }
    }
    expect(new Set(classes).size).toBe(169);
    expect(PREMIUM.size).toBe(19);
    expect(KING.size).toBe(19);
    expect(KING.has('KJo')).toBe(true);
    expect(KING.has('KJs')).toBe(false);
    for (const cls of classes) {
      const suited = cls.endsWith('s');
      const pair = cls.length === 2;
      const hole = parseCards(
        pair ? `${cls[0]}h ${cls[1]}d` : suited ? `${cls[0]}h ${cls[1]}h` : `${cls[0]}h ${cls[1]}d`,
      );
      const cat = categorize([hole[0]!, hole[1]!], []);
      if (PREMIUM.has(cls)) expect(cat, cls).toBe('pre-premium');
      else if (KING.has(cls)) expect(cat, cls).toBe('pre-king');
      else expect(cat, cls).not.toMatch(/^pre-(premium|king)$/);
    }
    const kjo = parseCards('Kh Jd');
    expect(categorize([kjo[0]!, kjo[1]!], [])).toBe('pre-king');
  });
});

describe('Close calls (I068)', () => {
  const regret = (sp: DrillSpot): number => {
    const g = previewJob({
      street: sp.street,
      hole: sp.hole,
      board: sp.board,
      blindPaytable: 'blind-standard',
      ante: 100,
    });
    let st = g.next();
    while (!st.done) st = g.next();
    return secondBestRegret(st.value);
  };
  it('500 seeded preflop spots: 55-65% have a second-best regret under 0.25 antes', () => {
    const spots = many({ street: 'preflop', interesting: true }, 500, 2024);
    const close = spots.filter((sp) => regret(sp) < 0.25).length;
    expect(close / 500).toBeGreaterThanOrEqual(0.55);
    expect(close / 500).toBeLessThanOrEqual(0.65);
  });

  it('Mixed street weights are the exact real-play frequencies', () => {
    // The chart checks every class it does not 4x; combos over C(52,2) = 1,326.
    const all = new Set<string>();
    const RANKS = 'AKQJT98765432';
    for (let i = 0; i < 13; i++)
      for (let j = i; j < 13; j++) {
        if (i === j) all.add(`${RANKS[i]}${RANKS[j]}`);
        else {
          all.add(`${RANKS[i]}${RANKS[j]}s`);
          all.add(`${RANKS[i]}${RANKS[j]}o`);
        }
      }
    const fourX = new Set(PREFLOP_4X_PERFECT);
    let check = 0;
    for (const c of all) if (!fourX.has(c)) check += classWeight(c);
    expect(all.size).toBe(169);
    expect(check).toBe(826);
    // P(check preflop) = 826/1326 = 413/663; P(4x) = 250/663 (decisions.md)
    const D = 6_497_400n; // 663 x 9,800
    expect(BigInt(MIXED_STREET_WEIGHTS.preflop)).toBe(D);
    expect(BigInt(MIXED_STREET_WEIGHTS.flop) * 1326n).toBe(D * 826n);
    // River spots need a preflop check and then a flop check under the basic card. P(check
    // preflop AND the basic flop rule bets 2x) is enumerated over the check classes (suit
    // symmetry: one representative hole per class, weighted by its combos) x all 19,600 flops.
    let fires = 0;
    for (const c of all) {
      if (fourX.has(c)) continue;
      const hole = classRep(c);
      const rest: number[] = [];
      for (let k = 0; k < 52; k++) if (k !== hole[0] && k !== hole[1]) rest.push(k);
      let n = 0;
      for (let a = 0; a < rest.length; a++)
        for (let b = a + 1; b < rest.length; b++)
          for (let d = b + 1; d < rest.length; d++)
            if (matchesAny(RULE_DEFS.basic.flop2x, hole, [rest[a]!, rest[b]!, rest[d]!])) n++;
      fires += classWeight(c) * n;
    }
    expect(fires).toBe(5_527_172); // of 1,326 x 19,600 = 25,989,600 = 4 x 6,497,400
    expect(MIXED_STREET_WEIGHTS.river).toBe(MIXED_STREET_WEIGHTS.flop - fires / 4);
    expect(MIXED_STREET_WEIGHTS.river).toBe(2_665_607);
  });

  it('Mixed with close calls draws streets by those weights', () => {
    const n = 1200;
    const counts = { preflop: 0, flop: 0, river: 0 };
    for (const sp of many({ street: 'mixed', interesting: true }, n, 77)) counts[sp.street]++;
    const total = 6_497_400 + 4_047_400 + 2_665_607;
    for (const st of ['preflop', 'flop', 'river'] as const) {
      const p = MIXED_STREET_WEIGHTS[st] / total;
      // river and flop are accepted by closeness, which skews the mix a little: a wide band
      expect(Math.abs(counts[st] / n - p)).toBeLessThan(0.08);
    }
    expect(counts.river).toBeLessThan(counts.preflop);
  });

  it('toggle off keeps the pre-I068 sequences (fixed seed 12345)', () => {
    const seq = (street: 'mixed' | 'preflop') => many({ street }, 8, 12345).map((sp) => sp.code);
    // Captured from the generator before the change.
    expect(seq('mixed')).toEqual([
      'p:JhAc.',
      'p:KsQs.',
      'f:4h6c.8sKd4d',
      'f:Qh2c.Kc6sAh',
      'f:3sJd.5cAsAc',
      'p:6h9s.',
      'f:2s7c.6sQcJc',
      'f:5c4c.TdAh6d',
    ]);
    expect(seq('preflop')).toEqual([
      'p:8cAc.',
      'p:4h5h.',
      'p:KsQs.',
      'p:5sAd.',
      'p:6d3c.',
      'p:3hAh.',
      'p:Qh2h.',
      'p:4sQd.',
    ]);
  });
});

describe('count the outs spots (I060)', () => {
  it('the band mix is seeded and puts at least 40% in the 19-23 edge band', () => {
    const run = (seed: number) => {
      let r = seedRng(seed);
      const out: string[] = [];
      for (let i = 0; i < 4000; i++) {
        let c: string;
        [c, r] = pickOutsCategory(r) as [string, RngState];
        out.push(c);
      }
      return out;
    };
    const a = run(60);
    expect(run(60)).toEqual(a); // a seed replays
    const share = (id: string) => a.filter((c) => c === id).length / a.length;
    expect(share('river-outs-edge')).toBeGreaterThanOrEqual(0.4);
    expect(share('river-outs-low')).toBeGreaterThan(0.2);
    expect(share('river-outs-high')).toBeGreaterThan(0.2);
    expect(new Set(a)).toEqual(new Set(['river-outs-edge', 'river-outs-low', 'river-outs-high']));
  });
  it('spots drawn from the mix have no hidden pair and the right number of outs', () => {
    let r = seedRng(61);
    const bands: Record<string, [number, number]> = {
      'river-outs-low': [0, 18],
      'river-outs-edge': [19, 23],
      'river-outs-high': [24, 45],
    };
    let edge = 0;
    for (let i = 0; i < 120; i++) {
      let cat: DrillCategoryId;
      [cat, r] = pickOutsCategory(r);
      let s: DrillSpot;
      [s, r] = nextSpot(r, { street: 'river', category: cat });
      expect(s.category).toBe(cat);
      const f = riverFacts(s.hole, s.board);
      expect(f.hidden).toBe(false);
      const [lo, hi] = bands[cat]!;
      expect(f.outs).toBeGreaterThanOrEqual(lo);
      expect(f.outs).toBeLessThanOrEqual(hi);
      if (cat === 'river-outs-edge') edge++;
    }
    expect(edge / 120).toBeGreaterThanOrEqual(0.3); // 45% expected; wide margin for 120 draws
  });
});
