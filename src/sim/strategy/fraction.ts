// Exact rational helpers for strategy constants and metrics (bigint, normalized).
import type { Fraction } from '../math/types';

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** Normalized fraction: den > 0, gcd(|num|, den) = 1. */
export function frac(num: bigint | number, den: bigint | number = 1n): Fraction {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new Error('frac: zero denominator');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return g > 1n ? { num: n / g, den: d / g } : { num: n, den: d };
}
export const fracAdd = (a: Fraction, b: Fraction): Fraction =>
  frac(a.num * b.den + b.num * a.den, a.den * b.den);
export const fracSub = (a: Fraction, b: Fraction): Fraction =>
  frac(a.num * b.den - b.num * a.den, a.den * b.den);
export const fracMul = (a: Fraction, b: Fraction): Fraction => frac(a.num * b.num, a.den * b.den);
export const fracDiv = (a: Fraction, b: Fraction): Fraction => frac(a.num * b.den, a.den * b.num);
export const fracNeg = (a: Fraction): Fraction => ({ num: -a.num, den: a.den });
export const fracEq = (a: Fraction, b: Fraction): boolean => a.num === b.num && a.den === b.den;
/** Lossy: for display and Monte Carlo comparisons only. */
export function fracToNumber(a: Fraction): number {
  const scale = 1n << 53n;
  // Keep precision for huge operands: scale the numerator before dividing.
  return Number((a.num * scale) / a.den) / Number(scale);
}
