import { describe, expect, it } from 'vitest';
import { seedRng, shuffle } from '../engine/rng';
import { createGame, applyAction, visibleView } from '../engine/game';
import { validateAction } from '../engine/validate';
import { flopFacts } from '../math/alternatives';
import { riverFacts } from '../math/alternatives';
import type { Card, RngState } from '../engine/types';
import { strategyChart } from './chart';
import { dealerOuts, flopMade, flushDrawFlop, hiddenPairFlop, isHidden } from './predicates';
import { STRATEGIES } from './presets';
import { riverCounts, riverPlays } from './river';
import { STRATEGY_IDS } from './ids';

function deck(r: RngState): [Card[], RngState] {
  return shuffle(
    r,
    Array.from({ length: 52 }, (_, i) => i),
  );
}

describe('predicates agree with math facts (decisions.md section 3)', () => {
  it('flop (a)(b)(c) and river hidden/outs on 3000 random deals', () => {
    let r = seedRng(11);
    for (let i = 0; i < 3000; i++) {
      let d: Card[];
      [d, r] = deck(r);
      const hole: [Card, Card] = [d[0]!, d[1]!];
      const f = flopFacts(hole, d.slice(2, 5));
      expect(flopMade(hole, d.slice(2, 5))).toBe(f.twoPairPlus);
      expect(hiddenPairFlop(hole, d.slice(2, 5), [0])).toBe(f.hiddenPair);
      expect(flushDrawFlop(hole, d.slice(2, 5), 4, 8)).toBe(f.flushDraw);
      const rf = riverFacts(hole, d.slice(2, 7));
      expect(isHidden(hole, d.slice(2, 7))).toBe(rf.hidden);
      expect(dealerOuts(hole, d.slice(2, 7))).toBe(rf.outs);
    }
  });
  it('river exact decision: play iff EV(1x) > fold; Monte Carlo of hidden-only (D36 sanity)', () => {
    let r = seedRng(3);
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      let d: Card[];
      [d, r] = deck(r);
      const hole: [Card, Card] = [d[0]!, d[1]!];
      const board = d.slice(2, 7);
      const c = riverCounts(hole, board);
      const total = c.wq + c.wnq + c.lq + c.lnq + c.tie;
      expect(total).toBe(990);
      expect(riverPlays(hole, board)).toBe(c.play1Half > -3960);
      sum += isHidden(hole, board) ? c.play1Half / 1980 : -2;
    }
    // exact: -69584314001/139069050120 = -0.500358; sampling error ~ 2.3/sqrt(n)
    expect(Math.abs(sum / n - -0.500358)).toBeLessThan(4 * (2.3 / Math.sqrt(n)));
  });
});

describe('strategies', () => {
  it('decide returns a legal action on random views', () => {
    for (const id of STRATEGY_IDS) {
      const strat = STRATEGIES[id];
      let s = createGame({ seed: 5, bankroll: 10_000_000, bets: { ante: 1000, trips: 0 } });
      for (let h = 0; h < 120; h++) {
        const dealt = applyAction(s, { type: 'deal' });
        if (!dealt.ok) throw new Error('deal');
        s = dealt.state;
        while (s.street === 'preflop' || s.street === 'flop' || s.street === 'river') {
          const v = visibleView(s);
          if (id === 'perfect' && s.street === 'flop') {
            expect(() => strat.decide(v)).toThrow();
            s = applyAction(s, { type: 'check' }).state;
            continue;
          }
          const a = strat.decide(v);
          expect(validateAction(s, a).ok).toBe(true);
          const next = applyAction(s, a);
          if (!next.ok) throw new Error('apply');
          s = next.state;
        }
      }
    }
  });
  it('chart data', () => {
    const c = strategyChart('basic');
    expect(c.fourXCount).toBe(69);
    expect(c.grid[0]![0]!).toEqual({ cls: 'AA', action: '4x' });
    expect(c.grid[0]![1]!).toEqual({ cls: 'AKs', action: '4x' });
    expect(c.grid[1]![0]!).toEqual({ cls: 'AKo', action: '4x' });
    expect(c.grid[12]![12]!).toEqual({ cls: '22', action: 'check' });
    expect(strategyChart('perfect').flop.rule).toBe('enumeration');
    expect(strategyChart('simple').fourXCount).toBe(68);
  });
});
