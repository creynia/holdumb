import type { Card, Cents, DecisionAction, DecisionStreet, Rank, TableRules,
  VisibleView } from '../engine/types';
import type { Fraction, DecisionPreview } from '../math/types';

export type StrategyLens = 'perfect' | 'practical' | 'fun';
export type StrategyId =
  | 'perfect' | 'expert' | 'basic' | 'simple' | 'check-to-river' | 'never-fold' | 'always-max'
  | 'river-leak';                    // lesson-only. D15: renamed from 'riverLeak'
export interface StrategySpec { id: StrategyId; ante: Cents; trips: Cents }
export interface Strategy {
  id: StrategyId; name: string; lens: StrategyLens;
  /** Sync and pure. 'perfect' throws at the flop: callers use the preview job instead. */
  decide(view: VisibleView): DecisionAction;
  /** Exact EV per hand in ante units (Trips excluded), and E[total wagered] in ante units. */
  ev: Fraction; wager: Fraction;
}
export interface StrategyMetrics {
  edgePerAnte: Fraction; elementOfRisk: Fraction;
  evPerHandCents: Fraction; evPerHourCents: Fraction;   // uses handsPerHour
}

export interface SimulateRequest {
  strategy: StrategySpec;
  hands: number;                     // per session, ≤ 10_000
  sessions: number;                  // 1 | 100 (≤ 1000)
  seed: number;                      // session i uses seed + i
  bankroll: Cents;
  rules?: Partial<TableRules>;
  stopAtBust?: boolean;              // default true
  stopWin?: Cents; stopLoss?: Cents;
  /** Compare mode: run these too on the same seeds (same cards hand by hand). */
  compare?: StrategySpec[];
}
export interface SessionSeries {
  strategy: StrategySpec;
  /** One session: equity after each hand ([0] = start). Many: p10/p50/p90 per hand. */
  equity?: Int32Array; p10?: Float64Array; p50?: Float64Array; p90?: Float64Array;
  expected: Float64Array;            // exact EV line: start + i × evPerHand
  survival?: Float64Array;           // share of sessions not busted after hand i
  finals: Int32Array;                // final equity per session
  meanFinal: number; meanFinalCi95: number;  // ± half-width (estimate)
  bustRate: number; probAhead: number;
  handsPlayed: number;               // total over sessions
  outcomes: { win: number; lose: number; tie: number; fold: number };
  byCategory: Int32Array;            // final player hand category counts (10)
  blindBonusHits: number; tripsHits: number;
}
export interface SimulateResult { series: SessionSeries[]; ms: number }

// ---------- drill (architecture §2.1, Drill tab) ----------
/** D33: the 18 Drill categories (curriculum.md §9.1). */
export type DrillCategoryId =
  | 'pre-premium' | 'pre-ace' | 'pre-king' | 'pre-queen-jack' | 'pre-small-pair' | 'pre-low'
  | 'flop-hidden-pair' | 'flop-two-pair-plus' | 'flop-board-pair' | 'flop-flush-draw'
  | 'flop-straight-draw' | 'flop-nothing' | 'flop-deuces'
  | 'river-hidden-pair' | 'river-outs-low' | 'river-outs-edge' | 'river-outs-high'
  | 'river-board-plays';
export const DRILL_CATEGORY_IDS: readonly DrillCategoryId[] = [
  'pre-premium', 'pre-ace', 'pre-king', 'pre-queen-jack', 'pre-small-pair', 'pre-low',
  'flop-hidden-pair', 'flop-two-pair-plus', 'flop-board-pair', 'flop-flush-draw',
  'flop-straight-draw', 'flop-nothing', 'flop-deuces',
  'river-hidden-pair', 'river-outs-low', 'river-outs-edge', 'river-outs-high',
  'river-board-plays',
];

export interface DrillSpot {
  code: string;                      // 'f:Ah7c.7dKs2c' (street letter, hole, board)
  street: DecisionStreet;
  hole: readonly [Card, Card];
  board: readonly Card[];
  category: DrillCategoryId;         // D33
}
export interface DrillFilter {
  street: DecisionStreet | 'mixed';
  category?: DrillCategoryId;        // D33: restrict to one category (omit = any in the street)
  focus?: string[];                  // preflop classes ('AKs') or spot codes
  /** Prefer close spots: sample so that ~60% have regret(second-best) < 0.25 ante. */
  interesting?: boolean;
}
export interface DrillGrade {
  correct: boolean;
  chosen: DecisionAction; best: DecisionAction;
  regret: Fraction;                  // ante units (0 when correct)
  lens: 'perfect' | 'practical';
  chartCell?: string;                // 'AKs' preflop; rule id on flop/river ('flop-hidden-pair')
  preview: DecisionPreview;
}
// strategy/types.ts (part of §5.2): declarative practical strategies
export type HandPredicate =
  | { flopMade: 'two-pair-plus-hole-plays' }               // flop (a)
  | { hiddenPair: { exceptPocket?: Rank[] } }              // flop (b); basic/simple exclude [0] (22)
  | { flushDraw: { minCards: 4; minHoleRank: Rank } }      // flop (c): T = 8
  | { hidden: true }                                       // river
  | { dealerOutsBelow: number }                            // river: 21
  | { any: HandPredicate[] };
export interface RuleStrategyDef {
  id: StrategyId;
  preflop4x: readonly string[];      // class list ('33'…'AA','AKs',…); others check (3x never)
  flop2x: readonly HandPredicate[];  // any match → bet 2x, else check
  river1x: readonly HandPredicate[] | 'always' | 'perfect';
}
