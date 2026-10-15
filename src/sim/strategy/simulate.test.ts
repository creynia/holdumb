import { describe, expect, it } from 'vitest';
import { STRATEGY_CONSTANTS } from './constants';
import { fracToNumber } from './fraction';
import { simulateJob } from './simulate';
import type { SimulateRequest, SimulateResult, StrategyId } from './types';

function run(req: SimulateRequest): SimulateResult {
  const g = simulateJob(req);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
  }
}
const base = (id: StrategyId, over: Partial<SimulateRequest> = {}): SimulateRequest => ({
  strategy: { id, ante: 1000, trips: 0 },
  hands: 300,
  sessions: 1,
  seed: 7,
  bankroll: 100_000,
  ...over,
});

describe('simulate', () => {
  it('is deterministic per seed and sessions use seed + i', () => {
    const a = run(base('basic', { sessions: 3 })).series[0]!;
    const b = run(base('basic', { sessions: 3 })).series[0]!;
    expect([...a.finals]).toEqual([...b.finals]);
    const one = run(base('basic', { seed: 8 })).series[0]!;
    expect(one.equity![300]).toBe(a.finals[1]);
  });
  it('compare mode plays the same cards', () => {
    const r = run(base('basic', { compare: [{ id: 'always-max', ante: 1000, trips: 0 }] }));
    expect(r.series).toHaveLength(2);
    const [x, y] = r.series;
    // hand 1 is the same deal: the nets differ only by the play size, so signs mostly agree
    expect(x!.handsPlayed).toBe(300);
    expect(y!.handsPlayed).toBeLessThanOrEqual(300);
    expect(x!.byCategory.reduce((p, c) => p + c, 0)).toBe(300);
    // identical cards: the first hands' player categories agree (same deal, any decisions)
    const first = (id: StrategyId) =>
      run(base(id, { hands: 1, seed: 21 })).series[0]!.byCategory.findIndex((n) => n === 1);
    expect(first('basic')).toBe(first('always-max'));
    expect(first('basic')).toBe(first('check-to-river'));
  });
  it('busts per D32 and carries the flat line', () => {
    const r = run(base('always-max', { hands: 400, sessions: 20, bankroll: 10_000 })).series[0]!;
    expect(r.bustRate).toBeGreaterThan(0.5);
    expect(r.survival![0]).toBe(1);
    expect(r.survival![400]!).toBeCloseTo(1 - r.bustRate, 10);
    expect(Math.min(...r.finals)).toBeGreaterThanOrEqual(0);
    expect(r.p10).toBeDefined();
  });
  it('can be cancelled', () => {
    const g = simulateJob(base('expert', { hands: 5000 }));
    expect(g.next().done).toBe(false);
    expect(g.return(undefined as never).done).toBe(true);
  });
  it('100k expert hands under 5 s', () => {
    const t = Date.now();
    run(base('expert', { hands: 10_000, sessions: 10 }));
    expect(Date.now() - t).toBeLessThan(5000);
  }, 20_000);
});

describe('Monte Carlo agrees with the exact constants', () => {
  const cases: [StrategyId, number][] = [
    ['expert', 120_000],
    ['basic', 120_000],
    ['simple', 120_000],
    ['check-to-river', 60_000],
    ['never-fold', 60_000],
    ['always-max', 60_000],
    ['river-leak', 60_000],
  ];
  for (const [id, n] of cases) {
    it(`${id}: simulated EV within 4 sigma of the exact EV`, () => {
      const sessions = 20;
      const hands = n / sessions;
      const r = run(base(id, { hands, sessions, bankroll: 100_000_000, seed: 1000 })).series[0]!;
      const exact = fracToNumber(STRATEGY_CONSTANTS[id].ev) * 1000;
      const perHand = (r.meanFinal - 100_000_000) / hands;
      // 4 sigma of the mean of `sessions` finals, per hand
      const ci4 = ((r.meanFinalCi95 / 1.96) * 4) / hands;
      expect(Math.abs(perHand - exact)).toBeLessThan(ci4);
    }, 120_000);
  }
});
