// ===== src/sim/math/types.ts — FROZEN (payloads of worker/protocol.ts) =====
import type {
  BlindPaytableId, Card, Cents, DecisionAction, DecisionStreet,
} from '../engine/types';

/** Exact rational, normalized: den > 0, gcd(|num|, den) = 1. Structured-cloneable. */
export interface Fraction { num: bigint; den: bigint }

export interface PreviewRequest {
  street: DecisionStreet;
  hole: readonly [Card, Card];
  board: readonly Card[];          // 0 (preflop), 3 (flop) or 5 (river) cards
  blindPaytable: BlindPaytableId;
  ante: Cents;                     // for the $ figures only; EV itself is in ante units
}

/** Regret tiers for decisions (§2.4). */
export type DecisionTier = 'best' | 'close' | 'small' | 'costly' | 'blunder';
/** Edge tiers for wagers (crappy's decisions.md scheme). */
export type WagerTier = 'free' | 'good' | 'fair' | 'poor' | 'avoid';

export interface DecisionOption {
  action: DecisionAction;
  label: string;                   // 'Bet 4x' | 'Bet 3x' | 'Check' | 'Bet 2x' | 'Bet 1x' | 'Fold' (D31: never 'Raise')
  /** Expected net of Ante + Blind + Play for the rest of the hand, in ante units (Trips excluded). */
  ev: Fraction;
  evCents: Fraction;               // ev × ante
  /** best.ev − this.ev, ≥ 0, ante units. */
  regret: Fraction;
  tier: DecisionTier;
  /** True when later decisions inside this option are assumed to be played perfectly. */
  assumesBestLater: boolean;
  why: WhyBreakdown;
}

export interface DecisionPreview {
  street: DecisionStreet;
  /** Display order: preflop [4x, 3x, check]; flop [2x, check]; river [1x, fold]. */
  options: DecisionOption[];
  bestIndex: number;               // exact EV tie → the option with the smaller total wager (check / fold)
  exact: true;                     // every decision preview is exact (see §2.6)
  source: 'table' | 'enumeration';
  /** Showdowns enumerated (0 for the table): river 990, flop 1,070,190. */
  showdowns: number;
  handClass?: string;              // preflop only: 'AKs', '72o', 'TT'
}

export type WhyRowId =
  | 'win-q' | 'win-nq' | 'tie' | 'lose-q' | 'lose-nq'   // showdown outcome × dealer qualifies?
  | 'fold'                                             // the fold option itself
  | 'later-raise' | 'later-play' | 'later-fold';       // what best play does later (check options)
export interface WhyRow {
  id: WhyRowId;
  label: string;                   // 'You win, dealer qualifies'
  count: bigint;                   // how many equally likely cases
  outOf: bigint;                   // 990 | 1,070,190 | 2,097,572,400 | 21,187,600 …
  probability: Fraction;
  /** Average net of Ante+Blind+Play in this row, in ante units. */
  netAnte: Fraction;
  /** probability × netAnte. Rows sum to the option's ev. */
  contribution: Fraction;
  /** Blind bonus share inside netAnte (straight or better), shown as a sub-line when > 0. */
  blindBonusAnte?: Fraction;
}
export interface WhyBreakdown {
  rows: WhyRow[];
  casesLabel: string;              // 'dealer hands' | 'turn-river cards × dealer hands' | 'deals'
  formula: string;                 // '611/990 × … = −23/90 ≈ −0.256 antes'
  note?: string;                   // 'Assumes you play the river perfectly.'
}

export interface WagerEdge {
  edge: Fraction;                  // −EV per unit wagered
  tier: WagerTier;
  pWin: Fraction;
}
