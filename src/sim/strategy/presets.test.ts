import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine/cards';
import type { Card } from '../engine/types';
import { STRATEGY_CONSTANTS, TRIPS_EDGE } from './constants';
import { fracToNumber } from './fraction';
import { strategyMetrics } from './metrics';
import { strategyAction } from './presets';
import { PREFLOP_4X_PERFECT, PREFLOP_4X_SIMPLE } from './rules';
import type { StrategyId } from './types';

const h = (s: string): [Card, Card] => parseCards(s) as [Card, Card];
const act = (id: StrategyId, hole: string, board = '') =>
  strategyAction(id, h(hole), parseCards(board));
const fr = (id: StrategyId) => `${STRATEGY_CONSTANTS[id].ev.num}/${STRATEGY_CONSTANTS[id].ev.den}`;

describe('constants (decisions.md section 4)', () => {
  it('pins every preset', () => {
    expect(fr('perfect')).toBe('-50643648973/2317817502000');
    expect(fr('expert')).toBe('-106357031/4682459600');
    expect(fr('basic')).toBe('-54758439/2299422125');
    expect(fr('simple')).toBe('-47068162901/1738363126500');
    expect(fr('river-leak')).toBe('-6205519211/38630291700');
    expect(fr('check-to-river')).toBe('-111371309107/347672625300');
    expect(fr('never-fold')).toBe('-6432686411/15803301150');
    expect(fr('always-max')).toBe(fr('never-fold'));
    const w = STRATEGY_CONSTANTS.perfect.wager;
    expect(`${w.num}/${w.den}`).toBe('29163830173/7023689400');
    const edge = (id: StrategyId) =>
      fracToNumber(strategyMetrics({ id, ante: 1000, trips: 0 }).edgePerAnte);
    expect(edge('perfect')).toBeCloseTo(0.0218497, 6);
    expect(edge('expert')).toBeCloseTo(0.022714, 6);
    expect(edge('basic')).toBeCloseTo(0.023814, 6);
    expect(edge('simple')).toBeCloseTo(0.0270761, 6);
    expect(edge('river-leak')).toBeCloseTo(0.1606387, 6);
    expect(edge('check-to-river')).toBeCloseTo(0.320334, 6);
    expect(edge('never-fold')).toBeCloseTo(0.407047, 6);
  });
  it('element of risk and per-hour figures', () => {
    const m = strategyMetrics({ id: 'perfect', ante: 1000, trips: 0 });
    expect(fracToNumber(m.elementOfRisk)).toBeCloseTo(0.0052622, 6);
    expect(fracToNumber(m.evPerHourCents)).toBeCloseTo(-655.49, 1);
    const t = strategyMetrics({ id: 'perfect', ante: 1000, trips: 500 });
    expect(fracToNumber(t.evPerHourCents)).toBeCloseTo(-655.49 - 285.6, 0);
    expect(TRIPS_EDGE['trips-8-6-5'].den).toBe(2572780n);
    const cost = (id: StrategyId) =>
      -fracToNumber(strategyMetrics({ id, ante: 1000, trips: 0 }).evPerHourCents) - 655.49;
    expect(cost('expert')).toBeCloseTo(26, 0);
    expect(cost('basic')).toBeCloseTo(59, 0);
    expect(cost('simple')).toBeCloseTo(157, 0);
  });
});

describe('rule data', () => {
  it('class counts', () => {
    expect(PREFLOP_4X_PERFECT).toHaveLength(69);
    expect(new Set(PREFLOP_4X_PERFECT).size).toBe(69);
    expect(PREFLOP_4X_SIMPLE).toHaveLength(68);
  });
});

const four = { type: 'play', multiple: 4 };
const check = { type: 'check' };
describe('basic spots', () => {
  it('preflop chart edges', () => {
    expect(act('basic', '3s3h')).toEqual(four);
    expect(act('basic', '2s2h')).toEqual(check);
    expect(act('basic', 'Ks5h')).toEqual(four);
    expect(act('basic', 'Ks4h')).toEqual(check);
    expect(act('basic', 'Qs6s')).toEqual(four);
    expect(act('basic', 'Qs5s')).toEqual(check);
    expect(act('basic', 'Qs8h')).toEqual(four);
    expect(act('basic', 'Qs7h')).toEqual(check);
    expect(act('basic', 'Js8s')).toEqual(four);
    expect(act('basic', 'JsTh')).toEqual(four);
    expect(act('basic', 'Js9h')).toEqual(check);
    expect(act('simple', 'Ks2h')).toEqual(four);
    expect(act('simple', 'Qs8h')).toEqual(four);
  });
  it('flop', () => {
    const two = { type: 'play', multiple: 2 };
    expect(act('basic', 'Th4h', 'Jh8h2c')).toEqual(two);
    expect(act('basic', '9h4h', 'Jh8h2c')).toEqual(check);
    expect(act('basic', '9s7d', '9hKc2s')).toEqual(two);
    expect(act('basic', '2c2d', '9s9h5c')).toEqual(two); // rule (a): two pair
    expect(act('basic', '2c2d', 'Ks9h5c')).toEqual(check);
    expect(act('basic', '9c8d', 'KsKd4c')).toEqual(check);
    expect(act('basic', 'Kc3d', '8s5h2c')).toEqual(check);
    expect(act('river-leak', '2c2d', 'Ks9h5c')).toEqual(two);
  });
  it('river', () => {
    const one = { type: 'play', multiple: 1 };
    expect(act('basic', 'Td4c', 'TsKh7d3s2c')).toEqual(one);
    expect(act('basic', 'Qc7d', 'KdJh9s5c2d')).toEqual(one); // 19 outs
    expect(act('basic', 'Jc9d', '8s8h5c3d2s')).toEqual({ type: 'fold' }); // 23 outs
    expect(act('basic', '8c6d', 'KhQs4d3c2h')).toEqual({ type: 'fold' });
    expect(act('basic', '4c3d', 'AsKsQsJdTh')).toEqual(one);
    expect(act('river-leak', 'Qc7d', 'KdJh9s5c2d')).toEqual({ type: 'fold' });
  });
});
