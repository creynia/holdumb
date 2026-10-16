// Presentational text helpers: money/EV formatting, button labels, hand and settlement prose.
import { formatMoney, formatPct } from '../engine';
import type {
  Action,
  Cents,
  DecisionAction,
  EvaluatedHand,
  HandResult,
  WagerSettlement,
} from '../engine';
import type { DecisionOption, DecisionPreview, DecisionTier, Fraction, WagerTier } from '../math';
import type { OptionKey } from '../scene';

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

// ---------- option labels (D31: never "Raise") ----------

export const OPTION_LABELS: Record<OptionKey, string> = {
  'play-4': 'Bet 4x',
  'play-3': 'Bet 3x',
  check: 'Check',
  'play-2': 'Bet 2x',
  'play-1': 'Bet 1x',
  fold: 'Fold',
};
/** The order buttons appear in everywhere (D31). */
export const OPTION_ORDER: readonly OptionKey[] = [
  'play-4',
  'play-3',
  'check',
  'play-2',
  'play-1',
  'fold',
];

export function optionKeyOf(a: DecisionAction): OptionKey {
  if (a.type === 'check') return 'check';
  if (a.type === 'fold') return 'fold';
  return `play-${a.multiple}` as OptionKey;
}
export function actionOfKey(k: OptionKey): Extract<Action, { type: 'check' | 'play' | 'fold' }> {
  if (k === 'check') return { type: 'check' };
  if (k === 'fold') return { type: 'fold' };
  return { type: 'play', multiple: Number(k.slice(5)) as 1 | 2 | 3 | 4 };
}

// ---------- tiers ----------

export const DECISION_TIER_LABEL: Record<DecisionTier, string> = {
  best: 'Best play',
  close: 'Close',
  small: 'Small mistake',
  costly: 'Mistake',
  blunder: 'Big mistake',
};
export const WAGER_TIER_LABEL: Record<WagerTier, string> = {
  free: 'Free bet',
  good: 'Good bet',
  fair: 'Fair bet',
  poor: 'Poor bet',
  avoid: 'Avoid',
};
/** Short word for crowded places (action buttons). */
export const DECISION_TIER_SHORT: Record<DecisionTier, string> = {
  best: 'Best',
  close: 'Close',
  small: 'Small',
  costly: 'Mistake',
  blunder: 'Big mistake',
};

export function bestOf(preview: DecisionPreview): DecisionOption {
  return preview.options[preview.bestIndex]!;
}

/** "Bet 4x: +$36.01 · Best play" */
export function headline(preview: DecisionPreview, index: number): string {
  const o = preview.options[index]!;
  return `${o.label}: ${fmtCentsFraction(o.evCents)} · ${DECISION_TIER_LABEL[o.tier]}`;
}

/** Spoken name of an action button: "Bet 4x, EV plus $5.21, best play". */
export function ariaForOption(o: DecisionOption): string {
  const money = fmtCentsFraction(o.evCents).replace('+', 'plus ').replace('-', 'minus ');
  return `${o.label}, EV ${money}, ${DECISION_TIER_LABEL[o.tier].toLowerCase()}`;
}

// ---------- hands and settlements ----------

const CATEGORY_NAME: Record<EvaluatedHand['category'], string> = {
  'high-card': 'high card',
  pair: 'pair',
  'two-pair': 'two pair',
  trips: 'three of a kind',
  straight: 'straight',
  flush: 'flush',
  'full-house': 'full house',
  quads: 'four of a kind',
  'straight-flush': 'straight flush',
  'royal-flush': 'royal flush',
};
const RANK_PLURAL = [
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'sevens',
  'eights',
  'nines',
  'tens',
  'jacks',
  'queens',
  'kings',
  'aces',
];
const RANK_SINGULAR = [
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'jack',
  'queen',
  'king',
  'ace',
];

/** "pair of kings", "straight", "ace high" (the lead card of best5 names pairs, trips and quads). */
export function handName(h: EvaluatedHand): string {
  const lead = h.best5[0];
  const rank = lead === undefined ? -1 : lead >> 2;
  if (rank >= 0) {
    if (h.category === 'pair') return `pair of ${RANK_PLURAL[rank]}`;
    if (h.category === 'trips') return `three ${RANK_PLURAL[rank]}`;
    if (h.category === 'quads') return `four ${RANK_PLURAL[rank]}`;
    if (h.category === 'high-card') return `${RANK_SINGULAR[rank]} high`;
  }
  return CATEGORY_NAME[h.category];
}
export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const WAGER_NAME = { ante: 'Ante', blind: 'Blind', play: 'Play', trips: 'Trips' } as const;

function describeSettlement(s: WagerSettlement): string {
  const name = WAGER_NAME[s.wager];
  if (s.result === 'push') {
    const why =
      s.reason === 'blind-push-under-straight'
        ? ' (needs a straight)'
        : s.reason === 'dealer-not-qualified'
          ? " (dealer doesn't qualify)"
          : '';
    return `${name} push${why}`;
  }
  return `${name} ${formatMoney(s.profit, { sign: true })}`;
}

/** The result toast: "Your pair of kings beats the dealer's pair of nines. Ante +$10, ... Net +$50." */
export function describeResult(r: HandResult): string {
  const p = handName(r.player);
  const d = handName(r.dealer);
  let lead: string;
  if (r.outcome === 'win') lead = `Your ${p} beats the dealer's ${d}.`;
  else if (r.outcome === 'lose') lead = `The dealer's ${d} beats your ${p}.`;
  else if (r.outcome === 'tie') lead = `Tie: you and the dealer both have a ${p}.`;
  else lead = `You folded. The dealer had a ${d}.`;
  const parts = r.wagers.map(describeSettlement).join(', ');
  return `${lead} ${parts}. Net ${formatMoney(r.net, { sign: true })}.`;
}

/** D7: what the fold would have been. */
export function foldRevealText(r: HandResult): string {
  const d = handName(r.dealer);
  const q = r.dealerQualifies ? 'qualifies' : "doesn't qualify";
  const had = `The dealer had a ${d} (${q}).`;
  if (!r.ifPlayed) return had;
  const { outcome, net } = r.ifPlayed;
  const would =
    outcome === 'win'
      ? `You would have won ${formatMoney(Math.abs(net))}.`
      : outcome === 'lose'
        ? `You would have lost ${formatMoney(Math.abs(net))}.`
        : 'You would have pushed.';
  return `${had} ${would}`;
}

export function money(c: Cents, sign = false): string {
  return formatMoney(c, { sign });
}

export type EvStatus = 'pending' | 'ready' | 'error';

/**
 * A preview is usable only if it has options and is not an all-zero placeholder (e.g. from a
 * missing table). Anything else must show "Calculating…" or "EV not available", never a tier.
 */
export function isUsablePreview(p: DecisionPreview | null | undefined): p is DecisionPreview {
  if (!p || p.options.length === 0) return false;
  const frac = (f: unknown): boolean =>
    !!f && typeof (f as Fraction).num === 'bigint' && (f as Fraction).den !== 0n;
  if (p.options.some((o) => !frac(o.ev) || !frac(o.evCents) || !o.label || !o.tier)) return false;
  return !p.options.every((o) => o.ev.num === 0n);
}
