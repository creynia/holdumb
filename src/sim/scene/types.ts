// src/sim/scene/types.ts — frozen with the engine contract
import type { Action, ActionType, Cents, DecisionStreet, ForcedDeal, GameEvent, PlayMultiple,
  Street, TableRules, TripsPaytableId, WagerId } from '../engine/types';
import type { StrategyId, StrategySpec } from '../strategy/types';

/** D26: the four bet circles on the felt (same ids as ui/layouts' CircleId). */
export type CircleId = 'trips' | 'ante' | 'blind' | 'play';

export type OptionKey = 'check' | 'play-4' | 'play-3' | 'play-2' | 'play-1' | 'fold';

export interface SceneConfig {
  id: string;                         // 'lesson-07-flop-pair'
  version: 1;
  title?: string;
  rules?: Partial<Pick<TableRules, 'anteMin' | 'anteMax' | 'tripsMin' | 'tripsMax'>> & { trips?: TripsPaytableId };
  bankroll?: Cents;                   // default 50_000
  bets?: { ante?: Cents; trips?: Cents };  // preset chips on the felt
  seed?: number;                      // default 1 in guided scenes, random in free ones
  deals?: ForcedDeal[];               // scene-level queue for successive 'deal's
  onDealsExhausted?: 'random' | 'block';   // default 'random'
  startAt?: { street: DecisionStreet; deal: ForcedDeal; play?: PlayMultiple }; // mid-hand start
  allowedActions?: ActionType[];      // default all
  allowedOptions?: OptionKey[];       // finer: e.g. hide 3x
  highlight?: (WagerId | OptionKey)[];
  showEV?: boolean;                   // default true
  evDetail?: 'basic' | 'full';        // basic = EV + badge; full = + alternative + Why?
  whyOpen?: boolean;
  revealDealer?: boolean;             // teaching: dealer cards face up from the deal (EV still ignores them)
  practice?: boolean;                 // hide EV until confirm (D11 behaviour)
  ui?: {
    orientation?: 'auto' | 'portrait' | 'landscape';
    chips?: Cents[]; defaultChip?: Cents;
    showChipRack?: boolean; showBankroll?: boolean; showHistory?: boolean;
    showSettings?: boolean;           // default false in scenes
    showSession?: boolean;            // D26: show the session panel
    speed?: 'normal' | 'fast' | 'instant';
    compact?: boolean;
  };
  autoPlay?: {
    enabled: boolean;
    strategies?: StrategyId[];
    defaultStrategy?: StrategySpec;
    handOptions?: number[];           // default [30, 300, 3000]
    sessions?: number[];              // default [1, 100]
    compare?: StrategySpec[];         // side-by-side on the same seed
  };
  steps?: SceneStep[];
}

export interface SceneStep {
  id: string;
  text: string;                       // **bold**, _italic_, {{As Kd}} inline cards
  hint?: string;                      // after a rejected action or 20 s idle
  math?: string;                      // "Show the math" body
  setup?: { bankroll?: Cents; bets?: { ante?: Cents; trips?: Cents } };
  /** Replaces the deal queue at step start. Put the forced deal ON THE STEP THAT DEALS (playbook §9). */
  deals?: ForcedDeal[];
  /** Jump straight into a hand (replaces the current one). */
  startAt?: SceneConfig['startAt'];
  allowedActions?: ActionType[];
  allowedOptions?: OptionKey[];
  highlight?: SceneConfig['highlight'];
  expect?: ActionMatcher[];           // only matching actions are accepted
  completeWhen: Condition;
  advance?: 'auto' | 'button';        // default 'auto'
  showEV?: boolean;
  revealDealer?: boolean;
}

export interface ActionMatcher {
  type: ActionType;
  option?: OptionKey | OptionKey[];
  wager?: 'ante' | 'trips';
  amount?: Cents; minAmount?: Cents; maxAmount?: Cents;
  /** The chosen option must be the EV-best one (container supplies wasBest from the preview). */
  best?: boolean;
}

export type Condition =
  | { all: Condition[] } | { any: Condition[] }
  | { action: ActionMatcher; count?: number }               // confirmed since step start
  | { event: GameEvent['type']; count?: number }
  | { hands: number }                                       // hands settled since step start
  | { street: Street }
  | { handResult: { outcome?: 'win' | 'lose' | 'tie' | 'fold'; minNet?: Cents } }
  | { betOnFelt: { wager: WagerId; minAmount?: Cents } }
  | { bankrollAtLeast: Cents } | { bankrollAtMost: Cents }
  | { previewed: { option?: OptionKey; whyOpened?: boolean } }
  | { bestDecisions: { count: number; street?: DecisionStreet } } // drill-like scenes
  | { autoPlayCompleted: { minHands?: number; strategy?: StrategyId } }
  | { acknowledged: true }
  | { tapped: CircleId | 'session' };   // D26: circle / session-panel tap, even when set-bet is gated

export interface SceneRuntime {
  stepIndex: number; stepStartHand: number; counters: Record<string, number>;
  done: boolean; satisfied?: boolean;
}
export type SceneInput =
  | { kind: 'action'; action: Action; events: GameEvent[]; wasBest?: boolean }
  | { kind: 'previewed'; option: OptionKey; whyOpened: boolean }
  | { kind: 'acknowledged' }
  | { kind: 'tapped'; target: CircleId | 'session' } // D26
  | { kind: 'auto-play-completed'; hands: number; strategy: StrategyId };
