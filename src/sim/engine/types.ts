// ===== src/sim/engine/types.ts — FROZEN. Changes go through main. =====
export type Cents = number; // integer cents; $10 = 1000

// ---------- cards ----------
/** 0..51 = rank * 4 + suit. */
export type Card = number;
/** 0 = deuce … 8 = ten, 9 = jack, 10 = queen, 11 = king, 12 = ace. */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
/** 0 = spades, 1 = hearts, 2 = diamonds, 3 = clubs (the order of 'shdc'). */
export type Suit = 0 | 1 | 2 | 3;
/** 'As', 'Td', '7c' — rank char from '23456789TJQKA', suit char from 'shdc'. */
export type CardCode = string;
export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'shdc';

// ---------- hands ----------
export type HandCategory =
  | 'high-card' | 'pair' | 'two-pair' | 'trips' | 'straight'
  | 'flush' | 'full-house' | 'quads' | 'straight-flush' | 'royal-flush';
/** Index = category number packed into HandValue (0..9). */
export const HAND_CATEGORIES: readonly HandCategory[] = [
  'high-card', 'pair', 'two-pair', 'trips', 'straight',
  'flush', 'full-house', 'quads', 'straight-flush', 'royal-flush',
];
/** Packed: category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5. Larger wins; equal ties. */
export type HandValue = number;
export interface EvaluatedHand {
  value: HandValue;
  category: HandCategory;
  best5: readonly Card[]; // the five cards that make the hand, in display order
}

// ---------- paytables ----------
/** Payout "num to den" (3:2 = [3, 2]). */
export type Odds = readonly [number, number];
export interface Paytable {
  id: string;
  label: string; // 'Standard (500/50/10/3/3:2/1)'
  /** Categories not listed: Blind → push on a win; Trips → lose. */
  pays: Partial<Record<HandCategory, Odds>>;
}
export type BlindPaytableId = 'blind-standard';
export type TripsPaytableId = 'trips-8-6-5' | 'trips-9-7-4' | 'trips-8-7-4' | 'trips-7-6-5' | 'trips-8-6-4';
/** What Settings → Paytable stores (architecture.md Settings.paytable). */
export type PaytablePresetId = TripsPaytableId; // Blind has one preset in v1

export interface TableRules {
  blindPaytable: BlindPaytableId;   // 'blind-standard'
  tripsPaytable: TripsPaytableId;   // default 'trips-8-6-5'
  anteMin: Cents;                   // 500
  anteMax: Cents;                   // 50_000
  tripsMin: Cents;                  // 100
  tripsMax: Cents;                  // 10_000
  betUnit: Cents;                   // 100: ante and trips are whole dollars
  preflopMultiples: readonly (3 | 4)[]; // [4, 3]
  requireAnteForTrips: true;
}

// ---------- state ----------
export type Street = 'betting' | 'preflop' | 'flop' | 'river' | 'settled';
export type DecisionStreet = 'preflop' | 'flop' | 'river';
export type PlayMultiple = 1 | 2 | 3 | 4;
export type WagerId = 'ante' | 'blind' | 'play' | 'trips';

/** Any subset may be given; the rest is dealt from the seeded shuffle. */
export interface ForcedDeal {
  player?: readonly [CardCode, CardCode];
  dealer?: readonly [CardCode, CardCode];
  flop?: readonly [CardCode, CardCode, CardCode];
  turn?: CardCode;
  river?: CardCode;
}
/** A fully resolved deal (hidden from the UI and the EV module until revealed). */
export interface Deal {
  player: readonly [Card, Card];
  dealer: readonly [Card, Card];
  board: readonly [Card, Card, Card, Card, Card]; // flop, flop, flop, turn, river
  forced: boolean;
}

export interface HandState {
  n: number;                       // 1-based hand number in this session
  deal: Deal;
  /** Community cards shown: 0 (preflop), 3 (flop), 5 (river and settled). */
  boardShown: 0 | 3 | 5;
  play: { multiple: PlayMultiple; street: DecisionStreet } | null;
  folded: boolean;
  /** Decisions taken, in order (for the log, drill and session stats). */
  decisions: readonly { street: DecisionStreet; action: DecisionAction }[];
  result: HandResult | null;       // set when street becomes 'settled'
}

export interface HandResult {
  player: EvaluatedHand;
  dealer: EvaluatedHand;
  dealerQualifies: boolean;
  outcome: 'win' | 'lose' | 'tie' | 'fold';
  wagers: readonly WagerSettlement[];
  net: Cents;                      // sum of profits (losses negative), all wagers incl. trips
  /** Only when folded (D7): what playing 1x would have returned for ante+blind+play. */
  ifPlayed?: { outcome: 'win' | 'lose' | 'tie'; net: Cents };
}

export interface WagerSettlement {
  wager: WagerId;
  amount: Cents;
  result: 'win' | 'lose' | 'push';
  profit: Cents;                   // > 0 win, < 0 loss, 0 push
  reason:
    | 'beats-dealer' | 'dealer-wins' | 'tie' | 'folded'
    | 'dealer-not-qualified'       // ante push
    | 'blind-bonus' | 'blind-push-under-straight'
    | 'trips-pays' | 'trips-misses';
}

export interface SessionStats {
  hands: number;
  folds: number;
  wins: number; losses: number; ties: number;
  wagered: Record<WagerId, Cents>;  // total action per wager
  net: Record<WagerId, Cents>;      // total profit per wager
}

export interface RngState { s: readonly [number, number, number, number]; }

export interface GameState {
  version: 1;
  rules: TableRules;
  street: Street;
  bankroll: Cents;                 // money in the rack, NOT on the felt
  /**
   * Chips on the felt for the current hand (already out of `bankroll`); blind always equals ante.
   * In 'settled' it is the NEXT hand's intent, still counted in `bankroll` until `deal` re-bets
   * it (decisions.md D38).
   */
  /**
   * Before a deal and during a hand: chips on the felt (already out of `bankroll`). In 'settled':
   * the NEXT hand's intent, still counted in `bankroll` until `deal` re-bets them (decisions.md D38).
   */
  bets: Readonly<Record<WagerId, Cents>>;
  hand: HandState | null;          // null before the first deal / after 'clear'
  handCount: number;
  rng: RngState;
  seed: number;
  forcedDeals: readonly ForcedDeal[]; // FIFO, consumed by 'deal' before the RNG
  stats: SessionStats;
}

// ---------- actions ----------
export type DecisionAction =
  | { type: 'check' }                          // preflop, flop
  | { type: 'play'; multiple: PlayMultiple }   // preflop 4|3, flop 2, river 1
  | { type: 'fold' };                          // river only
export type Action =
  | { type: 'set-bet'; wager: 'ante' | 'trips'; amount: Cents } // betting/settled; 0 removes trips
  | { type: 'deal' }                // betting or settled (re-bets the same amounts); forced deal optional
  | { type: 'clear' }               // settled → betting (chips back to rack)
  | DecisionAction;
export type ActionType = Action['type'];

export type ValidationCode =
  | 'wrong-street' | 'bad-amount' | 'below-min' | 'above-max'
  | 'insufficient-funds'            // incl. not enough for the chosen Play multiple
  | 'needs-ante' | 'bad-multiple'
  | 'not-allowed-by-scene';          // scene layer only, never the engine
export type Validation =
  | { ok: true; warnings: Warning[] }
  | { ok: false; code: ValidationCode; message: string };
export interface Warning {
  code: 'cant-afford-max-raise';    // deal allowed, but bankroll < ante*6+trips (4x not affordable)
  message: string;
}

// ---------- events ----------
export type GameEvent =
  | { type: 'bet-set'; wager: WagerId; from: Cents; to: Cents }
  | { type: 'hand-started'; n: number; forced: boolean }
  | { type: 'player-dealt'; cards: readonly [Card, Card] }
  | { type: 'dealer-dealt' }                                   // face down: no cards in the event
  | { type: 'checked'; street: 'preflop' | 'flop' }
  | { type: 'played'; street: DecisionStreet; multiple: PlayMultiple; amount: Cents }
  | { type: 'folded' }
  | { type: 'board-dealt'; street: 'flop' | 'turn-river'; cards: readonly Card[] }
  | { type: 'dealer-revealed'; cards: readonly [Card, Card]; hand: EvaluatedHand; qualifies: boolean }
  | { type: 'showdown'; player: EvaluatedHand; dealer: EvaluatedHand; outcome: 'win' | 'lose' | 'tie' }
  | { type: 'wager-settled'; settlement: WagerSettlement }
  | { type: 'hand-settled'; result: HandResult }
  | { type: 'cleared' };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[]; warnings: Warning[] }
  | { ok: false; state: GameState; error: Extract<Validation, { ok: false }> };

/** What the player can see. The EV module and strategies only ever receive this. */
export interface VisibleView {
  street: Street;
  rules: TableRules;
  hole: readonly [Card, Card] | null;
  board: readonly Card[];          // length 0, 3 or 5
  bets: Readonly<Record<WagerId, Cents>>;
  bankroll: Cents;
  played: boolean;
}

// ---------- wager registry ----------
export interface WagerDef {
  id: WagerId;
  label: string;                   // 'Ante'
  kind: 'main' | 'side';
  describePayout(rules: TableRules): string; // 'Pays 1 to 1 if the dealer qualifies'
}

// ---------- log ----------
export interface LogEntry { seq: number; action: Action; events: GameEvent[] }
