import { describe, expect, it } from 'vitest';
import { seedRng } from '../engine/rng';
import type { RngState } from '../engine/types';
import { categorize } from './categories';
import { preflopRow } from '../math/preflop';
import { previewJob } from '../math/preview';
import { gradeSpot, nextSpot, secondBestRegret, spotCode, spotFromCode } from './drill';
import { matchesAny } from './predicates';
import { handClass } from './ranks';
import { PREFLOP_4X_PERFECT, RULE_DEFS } from './rules';
import { DRILL_CATEGORY_IDS } from './types';
import type { DrillFilter, DrillSpot } from './types';
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
    expect(c('Td 4c', 'Ts Kh 7d 3s 2c')).toBe('river-hidden-pair');
    expect(c('Qc 7d', 'Kd Jh 9s 5c 2d')).toBe('river-outs-edge');
    expect(c('Jc 9d', '8s 8h 5c 3d 2s')).toBe('river-outs-edge');
    expect(c('8c 6d', 'Kh Qs 4d 3c 2h')).toBe('river-outs-high');
    expect(c('4c 3d', 'As Ks Qs Jd Th')).toBe('river-board-plays');
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
