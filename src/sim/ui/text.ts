// Presentational text helpers: money/EV formatting, button labels, hand and settlement prose.
import { formatMoney, formatPct } from '../engine';
import { RIVER_UNSEEN, classWeight, groupOuts } from '../math';
import type {
  Action,
  Card,
  Cents,
  DecisionAction,
  EvaluatedHand,
  HandResult,
  WagerSettlement,
} from '../engine';
import type {
  DecisionOption,
  DecisionPreview,
  DecisionTier,
  Fraction,
  OutGroup,
  RiverFacts,
  WagerTier,
} from '../math';
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
  fair: 'Fair',
  poor: 'Poor bet',
  avoid: 'Sucker bet',
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

// ---------- river dealer outs (decisions.md section 3; lesson 12) ----------

const SUIT_WORDS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
/** "Dealer outs: 19 of 45". */
export function dealerOutsLine(f: RiverFacts): string {
  return `Dealer outs: ${f.outs} of ${RIVER_UNSEEN}`;
}
/** "any king (3)" when every unseen king beats you; "the nine of clubs" (or "... of clubs or hearts") otherwise. */
export function outGroupText(g: OutGroup): string {
  const rank = RANK_SINGULAR[g.rank]!;
  if (g.all) return `any ${rank} (${g.cards.length})`;
  const suits = g.cards.map((c) => SUIT_WORDS[c & 3]);
  return `the ${rank} of ${suits.length === 1 ? suits[0] : `${suits.slice(0, -1).join(', ')} or ${suits[suits.length - 1]}`}`;
}
/** "any ace (4), any king (3), the nine of clubs", or "no single card beats you". */
export function outsDetailText(
  f: RiverFacts,
  hole: readonly [Card, Card],
  board: readonly Card[],
): string {
  if (f.outs === 0) return 'no single card beats you';
  return groupOuts(f.outCards, hole, board).map(outGroupText).join(', ');
}
/** "Hidden pair or better: yes/no" (`hidden` covers two pair and above too). */
export const hiddenPairLine = (f: RiverFacts): string =>
  `Hidden pair or better: ${f.hidden ? 'yes' : 'no'}`;
/** The basic card's river rule applied here: "Basic card: bet 1x (outs < 21)". */
export function basicRiverLine(f: RiverFacts): string {
  const why = f.hidden ? 'hidden pair' : f.outs < 21 ? 'outs < 21' : '21+ outs, no hidden pair';
  return `Basic card: ${f.basicAction === 'play' ? 'bet 1x' : 'fold'} (${why})`;
}

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

/** "a pair of kings", "two pair", "three queens", "ace high": the right article for a hand name. */
export function withArticle(name: string): string {
  return /^(pair|straight|flush|full house|royal flush)/.test(name) ? `a ${name}` : name;
}
/** Hands named in the plural ("three aces", "two pair", "kings and nines") take "beat", not "beats". */
const plural = (h: EvaluatedHand): boolean =>
  h.category === 'two-pair' || h.category === 'trips' || h.category === 'quads';

/** Rank index (0 = deuce .. 12 = ace) of kicker slot k (0 = k1 .. 4 = k5) of a packed HandValue. */
const slot = (value: number, k: number): number => (value >> (16 - 4 * k)) & 0xf;

/** First slot (0..4) where two same-category hands differ, or -1 when their values match. */
function firstDiff(a: number, b: number): number {
  for (let k = 0; k < 5; k++) if (slot(a, k) !== slot(b, k)) return k;
  return -1;
}

const listOf = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * The hand named down to the first card that differs from the other hand, so two hands in the
 * same category read as different: "king-queen high" vs "king-nine high", "pair of tens, ace
 * kicker", "kings and nines", "three queens, ace kicker", "king-high flush". Other categories and
 * equal values keep the short name from handName.
 */
export function handNameVs(h: EvaluatedHand, other: EvaluatedHand): string {
  if (h.category !== other.category) return handName(h);
  const d = firstDiff(h.value, other.value);
  if (d < 0) return handName(h);
  const v = h.value;
  const rank = (k: number) => slot(v, k);
  const kick = (k: number) => `${RANK_SINGULAR[rank(k)]} kicker`;
  // Kickers from the first down to the first difference: "ace kicker", "ace-eight kickers",
  // "ace-eight-four kickers". A first-kicker decider keeps the single-kicker wording.
  const kickersTo = (last: number) =>
    last === 1
      ? kick(1)
      : `${Array.from({ length: last }, (_, i) => RANK_SINGULAR[rank(i + 1)]).join('-')} kickers`;
  switch (h.category) {
    case 'high-card':
      return `${[0, 1, 2, 3, 4]
        .slice(0, d + 1)
        .map((k) => RANK_SINGULAR[rank(k)])
        .join('-')} high`;
    case 'flush':
      return `${[0, 1, 2, 3, 4]
        .slice(0, d + 1)
        .map((k) => RANK_SINGULAR[rank(k)])
        .join('-')}-high flush`;
    case 'straight':
      return `${RANK_SINGULAR[rank(0)]}-high straight`;
    case 'straight-flush':
      return `${RANK_SINGULAR[rank(0)]}-high straight flush`;
    case 'pair':
      return `pair of ${RANK_PLURAL[rank(0)]}${d >= 1 ? `, ${kickersTo(d)}` : ''}`;
    case 'two-pair':
      return `${RANK_PLURAL[rank(0)]} and ${RANK_PLURAL[rank(1)]}${d >= 2 ? `, ${kick(d)}` : ''}`;
    case 'trips':
      return `three ${RANK_PLURAL[rank(0)]}${d >= 1 ? `, ${kickersTo(d)}` : ''}`;
    case 'quads':
      return `four ${RANK_PLURAL[rank(0)]}${d >= 1 ? `, ${kick(d)}` : ''}`;
    case 'full-house':
      return `${RANK_PLURAL[rank(0)]} full of ${RANK_PLURAL[rank(1)]}`;
    default:
      return handName(h);
  }
}

/** Every rank of a hand, kickers included: "two pair, aces and kings, queen kicker". */
function describeAllRanks(h: EvaluatedHand): string {
  const v = h.value;
  const rank = (k: number) => slot(v, k);
  const kickers = (from: number, to: number): string[] =>
    Array.from({ length: to - from + 1 }, (_, i) => RANK_SINGULAR[rank(from + i)]!);
  const word = (n: number) => (n === 1 ? 'kicker' : 'kickers');
  switch (h.category) {
    case 'two-pair':
      return `two pair, ${RANK_PLURAL[rank(0)]} and ${RANK_PLURAL[rank(1)]}, ${listOf(kickers(2, 2))} kicker`;
    case 'pair':
      return `pair of ${RANK_PLURAL[rank(0)]}, ${listOf(kickers(1, 3))} ${word(3)}`;
    case 'trips':
      return `three ${RANK_PLURAL[rank(0)]}, ${listOf(kickers(1, 2))} ${word(2)}`;
    case 'quads':
      return `four ${RANK_PLURAL[rank(0)]}, ${listOf(kickers(1, 1))} kicker`;
    case 'high-card':
      return `${kickers(0, 4).join('-')} high`;
    case 'flush':
      return `${kickers(0, 4).join('-')}-high flush`;
    case 'straight':
      return `${RANK_SINGULAR[rank(0)]}-high straight`;
    case 'full-house':
      return `${RANK_PLURAL[rank(0)]} full of ${RANK_PLURAL[rank(1)]}`;
    default:
      return handName(h);
  }
}

/** The tie line: "Tie: you both play the board (two pair, aces and kings, queen kicker)." */
function tieLead(p: EvaluatedHand, d: EvaluatedHand): string {
  const sameCards = p.best5.length === d.best5.length && p.best5.every((c) => d.best5.includes(c));
  if (p.value === d.value && sameCards)
    return `Tie: you both play the board (${describeAllRanks(p)}).`;
  return 'Tie: same five-card hand.';
}

/** The result toast: "Your pair of kings beats the dealer's pair of nines. Ante +$10, ... Net +$50." */
export function describeResult(r: HandResult): string {
  let lead: string;
  if (r.outcome === 'win') {
    const p = handNameVs(r.player, r.dealer);
    lead = `Your ${p} ${plural(r.player) ? 'beat' : 'beats'} the dealer's ${handNameVs(r.dealer, r.player)}.`;
  } else if (r.outcome === 'lose') {
    const d = handNameVs(r.dealer, r.player);
    lead = `The dealer's ${d} ${plural(r.dealer) ? 'beat' : 'beats'} your ${handNameVs(r.player, r.dealer)}.`;
  } else if (r.outcome === 'tie') lead = tieLead(r.player, r.dealer);
  else lead = 'Folded.';
  const parts = r.wagers.map(describeSettlement).join(', ');
  return `${lead} ${parts}. Net ${formatMoney(r.net, { sign: true })}.`;
}

/** The one spoken fold announcement: the real net, then the reveal's dealer and would-have lines. */
export function foldAnnouncement(r: HandResult): string {
  return `You folded. Net ${formatMoney(r.net, { sign: true })}. ${foldRevealText(r)}`;
}

/**
 * D7: what the fold would have been. The money difference is ifPlayed.net minus the fold's ante and
 * blind result: positive means folding cost that much, negative means folding saved it.
 */
export function foldRevealText(r: HandResult): string {
  const d = handName(r.dealer);
  const q = r.dealerQualifies ? 'qualifies' : "doesn't qualify";
  const had = `The dealer had ${withArticle(d)} (${q}).`;
  if (!r.ifPlayed) return had;
  const { outcome, net } = r.ifPlayed;
  // Trips settles the same whether you fold or play, and ifPlayed leaves it out, so compare
  // against what the fold itself lost: ante + blind.
  const folded = r.wagers
    .filter((w) => w.wager === 'ante' || w.wager === 'blind')
    .reduce((s, w) => s + w.profit, 0);
  const diff = net - folded;
  const effect =
    diff < 0
      ? ` (folding saved ${formatMoney(-diff)})`
      : diff > 0
        ? ` (folding cost ${formatMoney(diff)})`
        : '';
  const would =
    outcome === 'win'
      ? `You would have won ${formatMoney(Math.abs(net))}${effect}.`
      : outcome === 'lose'
        ? `You would have lost ${formatMoney(Math.abs(net))}${effect}.`
        : `You would have pushed${effect}.`;
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

// ---------- rounded costs (the figures on screen must add up) ----------

/** Whole cents: round(best.evCents) − round(option.evCents), so shown EVs and shown costs agree. */
export function costCents(best: DecisionOption, o: DecisionOption): number {
  return Number(roundFraction(best.evCents) - roundFraction(o.evCents));
}
/** "$14.08", or "<$0.01" when a real cost rounds to nothing. */
export function fmtCostC(cents: number): string {
  return cents <= 0 ? '<$0.01' : formatMoney(cents);
}
/** "−$14.08" or "−<$0.01". */
export function fmtVsBestC(cents: number): string {
  return `\u2212${fmtCostC(cents)}`;
}

/** The ante in cents, recovered from a preview (evCents / ev of any option with a non-zero EV). */
export function anteOf(p: DecisionPreview): number | null {
  const o = p.options.find((x) => x.ev.num !== 0n);
  if (!o) return null;
  return Number((o.evCents.num * o.ev.den) / (o.evCents.den * o.ev.num));
}

/**
 * curriculum 8.1.4, preflop only: what getting this exact hand wrong every time it comes up costs
 * per hour = handsPerHour x P(class) x regret x Ante, with P(class) = combos / 1326.
 */
export function wrongEveryTimePerHour(
  p: DecisionPreview,
  o: DecisionOption,
  handsPerHour: number,
): string | null {
  if (p.street !== 'preflop' || !p.handClass) return null;
  const best = bestOf(p);
  if (o === best || o.tier === 'best') return null;
  const regretCents = sub(best.evCents, o.evCents);
  const perHour: Fraction = {
    num: regretCents.num * BigInt(handsPerHour) * BigInt(classWeight(p.handClass)),
    den: regretCents.den * 1326n,
  };
  return formatMoney(Number(roundFraction(perHour)));
}
