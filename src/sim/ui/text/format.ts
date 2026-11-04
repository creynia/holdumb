// Text helpers (format); re-exported unchanged by ../text.ts (I082 split).
import { formatMoney, formatPct } from '../../engine';
import type { Fraction } from '../../math';

// ---------- exact fractions -> text ----------

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/** Round half away from zero to an integer. */
export function roundFraction(f: Fraction): bigint {
  const n = absBig(f.num);
  const q = (2n * n + f.den) / (2n * f.den);
  return f.num < 0n ? -q : q;
}

/** Fixed-point text of an exact fraction, rounded half away from zero. */
export function fmtFixed(f: Fraction, digits: number, opts?: { sign?: boolean }): string {
  const scale = 10n ** BigInt(digits);
  const q = roundFraction({ num: f.num * scale, den: f.den });
  const neg = q < 0n;
  const s = absBig(q)
    .toString()
    .padStart(digits + 1, '0');
  const int = s.slice(0, s.length - digits);
  const frac = digits > 0 ? `.${s.slice(s.length - digits)}` : '';
  const sign = neg ? '-' : opts?.sign && q !== 0n ? '+' : '';
  return `${sign}${int}${frac}`;
}

export const sub = (a: Fraction, b: Fraction): Fraction => ({
  num: a.num * b.den - b.num * a.den,
  den: a.den * b.den,
});
export const mulInt = (a: Fraction, k: number): Fraction => ({
  num: a.num * BigInt(k),
  den: a.den,
});
export const isZero = (f: Fraction): boolean => f.num === 0n;

/** "+3.601" (ante units, three decimals; simulator.md 2.6). */
export function fmtAnteUnits(f: Fraction, sign = true): string {
  return fmtFixed(f, 3, { sign });
}
/** "+$36.01" from a fraction of cents (rounded to the cent). */
export function fmtCentsFraction(f: Fraction, sign = true): string {
  return formatMoney(Number(roundFraction(f)), { sign });
}
/** A cost: "$14.08", or "less than 1¢" when it rounds to nothing. */
export function fmtCost(regretCents: Fraction): string {
  if (isZero(regretCents)) return '$0';
  if (roundFraction(regretCents) === 0n) return 'less than 1¢';
  return formatMoney(Number(roundFraction(regretCents)));
}
/** "−$14.08" for a cost against the best option; "less than 1¢" when it rounds to nothing. */
export function fmtVsBest(costCents: Fraction): string {
  const c = fmtCost(costCents);
  return isZero(costCents) || roundFraction(costCents) === 0n ? c : `\u2212${c}`;
}
/** The "minus" sign used in prose is a real minus (U+2212). */
export const typographic = (s: string): string => s.replace(/^-/, '−').replace(/ -/g, ' −');
export const fmtPct = (f: Fraction, digits = 1): string => formatPct(f, digits);
