// "Why?" rows (simulator.md §2.5). Rows are exact; they sum to the option's EV.
import { add, frac, sum, toFixed, toRatio, ZERO } from './fraction';
import type { Fraction, WhyBreakdown, WhyRow, WhyRowId } from './types';

const MINUS = '−';

/** '-3' → '−3'. */
export function signed(text: string): string {
  return text.replace(/^-/, MINUS);
}
/** '+1.002' / '−0.256' with the unicode minus. */
export function fmtAntes(f: Fraction, digits = 3, plus = false): string {
  const s = toFixed(f, digits);
  return s.startsWith('-') ? signed(s) : plus && f.num > 0n ? `+${s}` : s;
}

const LABELS: Record<WhyRowId, string> = {
  'win-q': 'You win, dealer qualifies',
  'win-nq': "You win, dealer doesn't qualify",
  tie: 'Tie',
  'lose-q': 'You lose, dealer qualifies',
  'lose-nq': "You lose, dealer doesn't qualify",
  fold: 'Fold',
  'later-raise': 'Later you bet 2x',
  'later-play': 'Later you bet 1x',
  'later-fold': 'Later you fold',
};

/** A row from its exact contribution (Σ of nets / outOf), the count and the case total. */
export function makeRow(
  id: WhyRowId,
  count: bigint,
  outOf: bigint,
  /** Σ of the nets of this row's cases, in antes (exact). */
  netSum: Fraction,
  /** Net shown when the row is empty. */
  emptyNet: Fraction,
  blindBonusSum?: Fraction,
  label: string = LABELS[id],
): WhyRow {
  const probability = frac(count, outOf);
  const netAnte = count === 0n ? emptyNet : frac(netSum.num, netSum.den * count);
  const row: WhyRow = {
    id,
    label,
    count,
    outOf,
    probability,
    netAnte,
    contribution: frac(netSum.num, netSum.den * outOf),
  };
  if (blindBonusSum && count > 0n && blindBonusSum.num > 0n) {
    row.blindBonusAnte = frac(blindBonusSum.num, blindBonusSum.den * count);
  }
  return row;
}

export interface ShowdownTotals {
  wq: bigint;
  wnq: bigint;
  tie: bigint;
  lq: bigint;
  lnq: bigint;
  /** Σ of 2 × Blind multiple over winning showdowns, by dealer qualifying. */
  bb2q: bigint;
  bb2nq: bigint;
  outOf: bigint;
}

/** The five showdown rows of a Play of `k` units (k = 4, 3, 2 or 1). */
export function showdownRows(t: ShowdownTotals, k: bigint): WhyRow[] {
  const bq = frac(t.bb2q, 2n);
  const bnq = frac(t.bb2nq, 2n);
  const K = (n: bigint) => frac(n);
  return [
    makeRow('win-q', t.wq, t.outOf, add(K(t.wq * (1n + k)), bq), K(1n + k), bq),
    makeRow('win-nq', t.wnq, t.outOf, add(K(t.wnq * k), bnq), K(k), bnq),
    makeRow('tie', t.tie, t.outOf, ZERO, ZERO),
    makeRow('lose-q', t.lq, t.outOf, K(-t.lq * (2n + k)), K(-2n - k)),
    makeRow('lose-nq', t.lnq, t.outOf, K(-t.lnq * (1n + k)), K(-1n - k)),
  ];
}

export function totalOf(rows: readonly WhyRow[]): Fraction {
  return sum(rows.map((r) => r.contribution));
}

function factor(f: Fraction): string {
  const s = signed(toRatio(f));
  return f.num < 0n ? `(${s})` : s;
}

/** '308/990 × 1 + … = −1663/990 ≈ −1.680 antes'. Big denominators print as decimals. */
export function formulaFor(rows: readonly WhyRow[], ev: Fraction): string {
  const terms = rows
    .filter((r) => r.count > 0n)
    .map((r) => {
      const small = r.probability.den < 10_000n && r.netAnte.den < 10_000n;
      return small
        ? `${toRatio(r.probability)} × ${factor(r.netAnte)}`
        : `${toFixed(r.probability, 4)} × ${fmtAntes(r.netAnte)}`;
    });
  const body = terms.length ? terms.join(' + ') : '0';
  return `${body} = ${signed(toRatio(ev))} ≈ ${fmtAntes(ev)} antes`;
}

export function breakdown(
  rows: WhyRow[],
  casesLabel: string,
  note?: string,
): WhyBreakdown {
  const ev = totalOf(rows);
  const out: WhyBreakdown = { rows, casesLabel, formula: formulaFor(rows, ev) };
  if (note) out.note = note;
  return out;
}

