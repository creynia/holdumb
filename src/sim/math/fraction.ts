// Exact rationals on bigint (D13: wire format { num, den }). Always normalized: den > 0 and
// gcd(|num|, den) = 1, so deep equality and structuredClone round trips are meaningful.
import type { Fraction } from './types';

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Normalizing constructor. Accepts numbers or bigints (integers only for numbers). */
export function frac(num: bigint | number, den: bigint | number = 1n): Fraction {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new RangeError('Fraction with zero denominator');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return g > 1n ? { num: n / g, den: d / g } : { num: n, den: d };
}

export const ZERO: Fraction = { num: 0n, den: 1n };
export const ONE: Fraction = { num: 1n, den: 1n };

export const add = (a: Fraction, b: Fraction): Fraction =>
  frac(a.num * b.den + b.num * a.den, a.den * b.den);
export const sub = (a: Fraction, b: Fraction): Fraction =>
  frac(a.num * b.den - b.num * a.den, a.den * b.den);
export const mul = (a: Fraction, b: Fraction): Fraction => frac(a.num * b.num, a.den * b.den);
export const div = (a: Fraction, b: Fraction): Fraction => {
  if (b.num === 0n) throw new RangeError('Fraction division by zero');
  return frac(a.num * b.den, a.den * b.num);
};
export const neg = (a: Fraction): Fraction => ({ num: -a.num, den: a.den });
export const abs = (a: Fraction): Fraction => (a.num < 0n ? neg(a) : a);
export const scale = (a: Fraction, k: bigint | number): Fraction => frac(a.num * BigInt(k), a.den);

/** -1, 0 or 1. */
export function cmp(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
}
export const eq = (a: Fraction, b: Fraction): boolean => cmp(a, b) === 0;
export const lt = (a: Fraction, b: Fraction): boolean => cmp(a, b) < 0;
export const lte = (a: Fraction, b: Fraction): boolean => cmp(a, b) <= 0;
export const gt = (a: Fraction, b: Fraction): boolean => cmp(a, b) > 0;
export const gte = (a: Fraction, b: Fraction): boolean => cmp(a, b) >= 0;
export const sign = (a: Fraction): -1 | 0 | 1 => (a.num < 0n ? -1 : a.num > 0n ? 1 : 0);
export const isZero = (a: Fraction): boolean => a.num === 0n;
export const max = (a: Fraction, b: Fraction): Fraction => (cmp(a, b) >= 0 ? a : b);
export const min = (a: Fraction, b: Fraction): Fraction => (cmp(a, b) <= 0 ? a : b);

/** Sum of a list (exact; one gcd at the end). */
export function sum(list: readonly Fraction[]): Fraction {
  let n = 0n;
  let d = 1n;
  for (const f of list) {
    n = n * f.den + f.num * d;
    d *= f.den;
  }
  return frac(n, d);
}

/** Nearest double. Exact enough for charts and sorting; never use it to compare. */
export function toNumber(a: Fraction): number {
  const neg_ = a.num < 0n;
  const n = neg_ ? -a.num : a.num;
  const whole = n / a.den;
  // 12 extra digits of fractional precision in bigint, then one division in doubles.
  const rem = ((n % a.den) * 10n ** 12n) / a.den;
  const v = Number(whole) + Number(rem) / 1e12;
  return neg_ ? -v : v;
}

/** Decimal string with `digits` places, rounding half away from zero, ASCII minus. */
export function toFixed(a: Fraction, digits: number): string {
  const neg_ = a.num < 0n;
  const n = neg_ ? -a.num : a.num;
  const p = 10n ** BigInt(digits);
  const q = (2n * n * p + a.den) / (2n * a.den);
  const s = q.toString().padStart(digits + 1, '0');
  const int = s.slice(0, s.length - digits);
  const dec = digits > 0 ? `.${s.slice(s.length - digits)}` : '';
  return `${neg_ && q !== 0n ? '-' : ''}${int}${dec}`;
}

/** '-23/90' or '5' (integers print without a denominator). */
export function toRatio(a: Fraction): string {
  return a.den === 1n ? a.num.toString() : `${a.num}/${a.den}`;
}

/** Whole cents, rounded half away from zero. For display only; EV itself stays exact. */
export function round(a: Fraction): number {
  const neg_ = a.num < 0n;
  const n = neg_ ? -a.num : a.num;
  const q = (2n * n + a.den) / (2n * a.den);
  return Number(neg_ ? -q : q);
}
