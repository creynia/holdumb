import { describe, expect, it } from 'vitest';
import { checkToRiverHiddenOnly } from './d36.exact';

const slow = process.env.SLOW ? it : it.skip;
describe('D36 (slow, SLOW=1)', () => {
  slow(
    'check to the river, 1x only with a hidden pair',
    () => {
      const r = checkToRiverHiddenOnly();
      console.log('D36', r.num.toString(), r.den.toString(), Number(r.num) / Number(r.den));
      // -1070600065/2139523848 (50.0392%) per the curriculum solvers
      expect(r.num * 2139523848n).toBe(-1070600065n * r.den);
    },
    900_000,
  );
  slow(
    'self-check: always-1x and optimal river reproduce decisions.md',
    () => {
      const a = checkToRiverHiddenOnly('always');
      expect(a.num * 15803301150n).toBe(-6432686411n * a.den);
      const o = checkToRiverHiddenOnly('optimal');
      expect(o.num * 347672625300n).toBe(-111371309107n * o.den);
    },
    900_000,
  );
});
