// Gallery and test fixtures, shaped exactly like math's DecisionPreview and engine's HandResult.
// Every EV is an exact fraction from simulator.md section 2.5 (worked examples) or Appendix A
// (preflop AA: SA 3292247168, SP 2953693496, SC 91996341600), never an invented number.
// The gallery itself runs on the real engine and math; these are for component tests.
import { parseCards } from '../engine';
import type { Card, Cents, DecisionAction, EvaluatedHand, HandResult } from '../engine';
import { decisionTier } from '../math';
import type {
  DecisionOption,
  DecisionPreview,
  Fraction,
  WhyBreakdown,
  WhyRow,
  WhyRowId,
} from '../math';

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a;
};
export function frac(num: bigint | number, den: bigint | number = 1n): Fraction {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { num: n / g, den: d / g };
}
const sub = (a: Fraction, b: Fraction): Fraction =>
  frac(a.num * b.den - b.num * a.den, a.den * b.den);
const mul = (a: Fraction, k: number): Fraction => frac(a.num * BigInt(k), a.den);
const cmp = (a: Fraction, b: Fraction): number => Number(a.num * b.den - b.num * a.den);

/** The real D24 tiers from math. */
export const fixtureTier = decisionTier;

const row = (id: WhyRowId, label: string, count: number, outOf: number, net: number): WhyRow => ({
  id,
  label,
  count: BigInt(count),
  outOf: BigInt(outOf),
  probability: frac(count, outOf),
  netAnte: frac(net),
  contribution: frac(count * net, outOf),
});

function build(
  action: DecisionAction,
  label: string,
  ev: Fraction,
  best: Fraction,
  ante: Cents,
  why: WhyBreakdown,
  assumesBestLater = false,
): DecisionOption {
  const regret = sub(best, ev);
  return {
    action,
    label,
    ev,
    evCents: mul(ev, ante),
    regret,
    tier: fixtureTier(regret),
    assumesBestLater,
    why,
  };
}

function preview(
  street: DecisionPreview['street'],
  evs: {
    action: DecisionAction;
    label: string;
    ev: Fraction;
    why: WhyBreakdown;
    later?: boolean;
  }[],
  ante: Cents,
  extra: Partial<DecisionPreview>,
): DecisionPreview {
  // Exact tie -> the smaller wager, which is listed last in display order.
  let bestIndex = 0;
  evs.forEach((o, i) => {
    if (cmp(o.ev, evs[bestIndex]!.ev) >= 0) bestIndex = i;
  });
  const best = evs[bestIndex]!.ev;
  return {
    street,
    options: evs.map((o) => build(o.action, o.label, o.ev, best, ante, o.why, o.later)),
    bestIndex,
    exact: true,
    source: 'enumeration',
    showdowns: 0,
    ...extra,
  };
}

const cards = (s: string): Card[] => parseCards(s);

// ---------- river: A♠ 7♣ on K♦ 9♥ 5♣ 3♠ 2♦ (ace high). Raising costs less than folding. ----------
const riverAceHighWhy: WhyBreakdown = {
  rows: [
    row('win-nq', 'You win, dealer does not qualify', 308, 990, 1),
    row('win-q', 'You win, dealer qualifies', 0, 990, 3),
    row('tie', 'Tie', 9, 990, 0),
    row('lose-nq', 'You lose, dealer does not qualify', 48, 990, -2),
    row('lose-q', 'You lose, dealer qualifies', 625, 990, -3),
  ],
  casesLabel: 'dealer hands',
  formula: '(308×1 + 0×3 + 9×0 − 48×2 − 625×3)/990 = −1663/990 ≈ −1.680 antes',
};
const foldWhy: WhyBreakdown = {
  rows: [row('fold', 'You fold: the Ante and Blind are gone', 990, 990, -2)],
  casesLabel: 'dealer hands',
  formula: '−2 antes for sure',
};
export const RIVER_ACE_HIGH = {
  hole: cards('As 7c') as [Card, Card],
  board: cards('Kd 9h 5c 3s 2d'),
  preview: preview(
    'river',
    [
      {
        action: { type: 'play', multiple: 1 },
        label: 'Bet 1x',
        ev: frac(-1663, 990),
        why: riverAceHighWhy,
      },
      { action: { type: 'fold' }, label: 'Fold', ev: frac(-2), why: foldWhy },
    ],
    1000,
    { showdowns: 990 },
  ),
};

// ---------- river: 3♣ 4♦ on A♥ K♠ Q♦ 9♣ 7♥ (you play the board). Folding is right. ----------
export const RIVER_PLAY_BOARD = {
  hole: cards('3c 4d') as [Card, Card],
  board: cards('Ah Ks Qd 9c 7h'),
  preview: preview(
    'river',
    [
      {
        action: { type: 'play', multiple: 1 },
        label: 'Bet 1x',
        ev: frac(-467, 198),
        why: {
          rows: [
            row('tie', 'Tie', 129, 990, 0),
            row('lose-nq', 'You lose, dealer does not qualify', 248, 990, -2),
            row('lose-q', 'You lose, dealer qualifies', 613, 990, -3),
          ],
          casesLabel: 'dealer hands',
          formula: '(129×0 − 248×2 − 613×3)/990 = −467/198 ≈ −2.359 antes',
        },
      },
      { action: { type: 'fold' }, label: 'Fold', ev: frac(-2), why: foldWhy },
    ],
    1000,
    { showdowns: 990 },
  ),
};

// ---------- flop: A♥ 7♣ on 7♦ K♠ 2♣ (hidden pair of sevens) ----------
export const FLOP_HIDDEN_PAIR = {
  hole: cards('Ah 7c') as [Card, Card],
  board: cards('7d Ks 2c'),
  preview: preview(
    'flop',
    [
      {
        action: { type: 'play', multiple: 2 },
        label: 'Bet 2x',
        ev: frac(178661, 178365),
        why: {
          rows: [],
          casesLabel: 'turn-river cards × dealer hands',
          formula: '178661/178365 ≈ +1.002 antes',
          note: 'Assumes you play the river perfectly.',
        },
      },
      {
        action: { type: 'check' },
        label: 'Check',
        ev: frac(93143, 178365),
        why: {
          rows: [],
          casesLabel: 'turn-river cards × dealer hands',
          formula: '93143/178365 ≈ +0.522 antes',
          note: 'Assumes you play the river perfectly.',
        },
        later: true,
      },
    ],
    1000,
    { showdowns: 1_070_190 },
  ),
};

// ---------- preflop: A♠ A♥ (Appendix A: SA, SP, SC) ----------
const D = 4_195_144_800n;
const preflopRaise = (k: bigint) => frac(3_292_247_168n + k * 2_953_693_496n, D);
export const PREFLOP_AA = {
  hole: cards('As Ah') as [Card, Card],
  board: [] as Card[],
  preview: preview(
    'preflop',
    [
      {
        action: { type: 'play', multiple: 4 },
        label: 'Bet 4x',
        ev: preflopRaise(4n),
        why: {
          rows: [],
          casesLabel: 'deals',
          formula: '(3292247168 + 4×2953693496)/4195144800 ≈ +3.601 antes',
        },
      },
      {
        action: { type: 'play', multiple: 3 },
        label: 'Bet 3x',
        ev: preflopRaise(3n),
        why: {
          rows: [],
          casesLabel: 'deals',
          formula: '(3292247168 + 3×2953693496)/4195144800 ≈ +2.897 antes',
        },
      },
      {
        action: { type: 'check' },
        label: 'Check',
        ev: frac(91_996_341_600n, 41_951_448_000n),
        why: {
          rows: [],
          casesLabel: 'deals',
          formula: '91996341600/41951448000 ≈ +2.193 antes',
          note: 'Assumes you play the flop and river perfectly.',
        },
        later: true,
      },
    ],
    1000,
    { source: 'table', handClass: 'AA' },
  ),
};

// ---------- settled hands (shape only; hand values are placeholders for display) ----------
const hand = (category: EvaluatedHand['category'], best5: string): EvaluatedHand => ({
  value: 0,
  category,
  best5: cards(best5),
});

/** Folded on the river with A♠ 7♣; the dealer's T♦ T♠ would have beaten you (D7). */
export const FOLDED_RESULT: HandResult = {
  player: hand('high-card', 'As Kd 9h 7c 5c'),
  dealer: hand('pair', 'Td Ts Kd 9h 5c'),
  dealerQualifies: true,
  outcome: 'fold',
  wagers: [
    { wager: 'ante', amount: 1000, result: 'lose', profit: -1000, reason: 'folded' },
    { wager: 'blind', amount: 1000, result: 'lose', profit: -1000, reason: 'folded' },
  ],
  net: -2000,
  ifPlayed: { outcome: 'lose', net: -3000 },
};
export const FOLDED_DEALER_CARDS = cards('Td Ts') as [Card, Card];

/** A won hand: pair of kings beats the dealer's pair of nines; Blind pushes (needs a straight). */
export const WON_RESULT: HandResult = {
  player: hand('pair', 'Kd Kc Ah 9c 5d'),
  dealer: hand('pair', '9d 9s Kh Qc 5s'),
  dealerQualifies: true,
  outcome: 'win',
  wagers: [
    { wager: 'ante', amount: 1000, result: 'win', profit: 1000, reason: 'beats-dealer' },
    {
      wager: 'blind',
      amount: 1000,
      result: 'push',
      profit: 0,
      reason: 'blind-push-under-straight',
    },
    { wager: 'play', amount: 4000, result: 'win', profit: 4000, reason: 'beats-dealer' },
  ],
  net: 5000,
};

export const FIXTURES = {
  'river-ace-high': RIVER_ACE_HIGH,
  'river-play-board': RIVER_PLAY_BOARD,
  'flop-hidden-pair': FLOP_HIDDEN_PAIR,
  'preflop-aa': PREFLOP_AA,
} as const;
export type FixtureId = keyof typeof FIXTURES;
