import { describe, expect, it } from 'vitest';
import * as F from './fraction';

describe('Fraction', () => {
  it('normalizes sign and gcd', () => {
    expect(F.frac(6n, -4n)).toEqual({ num: -3n, den: 2n });
    expect(F.frac(0n, 7n)).toEqual({ num: 0n, den: 1n });
    expect(() => F.frac(1n, 0n)).toThrow();
  });
  it('arithmetic is exact', () => {
    const a = F.frac(1n, 3n);
    const b = F.frac(1n, 6n);
    expect(F.add(a, b)).toEqual(F.frac(1n, 2n));
    expect(F.sub(b, a)).toEqual(F.frac(-1n, 6n));
    expect(F.mul(a, b)).toEqual(F.frac(1n, 18n));
    expect(F.div(a, b)).toEqual(F.frac(2n));
    expect(F.sum([a, b, F.frac(1n, 2n)])).toEqual(F.ONE);
  });
  it('compares', () => {
    expect(F.cmp(F.frac(1n, 3n), F.frac(2n, 6n))).toBe(0);
    expect(F.lt(F.frac(-1n, 2n), F.frac(1n, 3n))).toBe(true);
    expect(F.max(F.frac(1n, 3n), F.frac(1n, 2n))).toEqual(F.frac(1n, 2n));
  });
  it('formats', () => {
    expect(F.toFixed(F.frac(-1663n, 990n), 3)).toBe('-1.680');
    expect(F.toFixed(F.frac(-1n, 10_000n), 2)).toBe('0.00');
    expect(F.toFixed(F.frac(5n, 2n), 0)).toBe('3');
    expect(F.toRatio(F.frac(-23n, 90n))).toBe('-23/90');
    expect(F.toRatio(F.frac(4n, 2n))).toBe('2');
    expect(F.round(F.frac(-5n, 2n))).toBe(-3);
    expect(F.toNumber(F.frac(-23n, 90n))).toBeCloseTo(-0.255556, 6);
  });
});
