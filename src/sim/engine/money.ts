import type { Cents } from './types';
/** Structural match for math's Fraction (engine must not import math). */
interface FractionLike {
  num: bigint;
  den: bigint;
}

/** "-$0.14" | "+$39" | "$1,250" (ASCII minus; cents omitted when zero unless < $1). */
export function formatMoney(cents: Cents, opts?: { sign?: boolean }): string {
  const c = Math.round(cents);
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const d = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = abs < 100 || rem !== 0 ? `${d}.${String(rem).padStart(2, '0')}` : d;
  const sign = c < 0 ? '-' : opts?.sign && c > 0 ? '+' : '';
  return `${sign}$${body}`;
}
/** "1.41%" (exact bigint rounding, half away from zero). */
export function formatPct(fraction: FractionLike, digits = 2): string {
  let { num: n, den: d } = fraction;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const num = (neg ? -n : n) * 100n * 10n ** BigInt(digits);
  const q = (2n * num + d) / (2n * d);
  const s = q.toString().padStart(digits + 1, '0');
  const int = s.slice(0, s.length - digits);
  const frac = digits > 0 ? `.${s.slice(s.length - digits)}` : '';
  return `${neg && q !== 0n ? '-' : ''}${int}${frac}%`;
}
