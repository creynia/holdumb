import { describe, expect, it } from 'vitest';
import { costVsPerfectPerHour } from './metrics';
import { fracToNumber } from './fraction';

describe('costVsPerfectPerHour (decisions section 4)', () => {
  const cents = (id: 'expert' | 'basic' | 'simple' | 'perfect', ante = 1000, h = 30) =>
    Math.round(fracToNumber(costVsPerfectPerHour({ id, ante, trips: 0 }, h)));
  it('pins expert / basic / simple at $10 x 30 an hour', () => {
    expect([cents('expert'), cents('basic'), cents('simple')]).toEqual([26, 59, 157]);
  });
  it('is zero for perfect and scales with ante and hands', () => {
    expect(cents('perfect')).toBe(0);
    expect(cents('basic', 2000, 30)).toBe(118);
    expect(cents('basic', 1000, 60)).toBe(118);
  });
});
