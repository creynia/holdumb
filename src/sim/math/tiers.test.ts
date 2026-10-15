import { describe, expect, it } from 'vitest';
import { frac } from './fraction';
import { decisionTier, wagerTier } from './tiers';

describe('decisionTier (D24)', () => {
  const t = (n: bigint, d: bigint) => decisionTier(frac(n, d));
  it('boundaries are inclusive on the lower tier', () => {
    expect(t(0n, 1n)).toBe('best');
    expect(t(1n, 1_000_000_000n)).toBe('best');
    expect(t(2n, 1_000_000_000n)).toBe('close');
    expect(t(1n, 50n)).toBe('close');
    expect(t(1n, 49n)).toBe('small');
    expect(t(1n, 10n)).toBe('small');
    expect(t(11n, 100n)).toBe('costly');
    expect(t(1n, 2n)).toBe('costly');
    expect(t(501n, 1000n)).toBe('blunder');
  });
  it('matches the calibration examples', () => {
    expect(t(81n, 1000n)).toBe('small'); // 33 checked/raised, 0.081
    expect(t(1408n, 1000n)).toBe('blunder'); // check AA
    expect(t(479n, 1000n)).toBe('costly'); // check a hidden pair
  });
});

describe('wagerTier', () => {
  it('uses crappy thresholds', () => {
    expect(wagerTier(frac(0n))).toBe('free');
    expect(wagerTier(frac(-1n, 100n))).toBe('free');
    expect(wagerTier(frac(2n, 100n))).toBe('good');
    expect(wagerTier(frac(21n, 1000n))).toBe('fair');
    expect(wagerTier(frac(5n, 100n))).toBe('fair');
    expect(wagerTier(frac(89n, 1000n))).toBe('poor');
    expect(wagerTier(frac(9n, 100n))).toBe('avoid');
  });
});
