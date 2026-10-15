# holdumb: Simulator Design

Status: design spike, ready for reconciliation. Owner: simulator track.
Related: `architecture.md` (app shell, EV worker transport, build, WPs),
`curriculum.md` (lessons that embed scenes), `decisions.md` (wins over all).
Reference implementation: crappy `src/sim/**` and its `docs/design/simulator.md`.

The simulator is a phone-first Ultimate Texas Hold'em (UTH) table: one player
against the dealer. You set the Ante (the Blind is matched automatically) and an
optional Trips, then deal. At each decision (preflop, flop, river) every option
shows its **exact expected value before you confirm**, together with a tier
badge, the cost against the best option, and a "Why?" breakdown. The same
component runs as the free sandbox (Play tab), inside lessons as guided
**scenes** with forced decks, and as an **auto-play** runner for strategy and
bankroll lessons. Drill (a tab) reuses the engine, the EV client and the EV sheet.

**Every number in this document was verified** by exhaustive enumeration in C
and/or exact rationals in Python. The scratch code is in
`/tmp/holdumb-scratch/simulator/` (`eval.h`, `counts.c`, `strat.c`, `oracle.py`,
`flopcheck.py`, `trips.py`, `bench.mjs`; results in `strat.csv`).

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Money | Integer **cents** everywhere in the engine. EV math in exact `bigint` fractions `{num, den}` (D13). |
| Engine | Pure, immutable, framework-free TS in `src/sim/engine/`. No DOM, no `Math.random`, no `Date`. |
| Rules | Standard UTH (D9): Ante = Blind, Play 4x/3x preflop, 2x flop, 1x river, fold only at the river. Dealer qualifies with a pair or better; if not, the Ante pushes. The Trips bet stays in action when you fold. |
| Paytables | Config in a registry. **Blind**: one preset, `blind-standard` 500/50/10/3/3:2/1 (D12). **Trips**: `trips-8-6-5` (default, D6) plus `trips-9-7-4`, `trips-8-7-4`, `trips-7-6-5`, `trips-8-6-4`. Types and generator are parameterised by the Blind table so presets can be added later. |
| Side bets | Trips only (D5). The `SideBetDef` interface lets 6-Card Bonus etc. be added later as a contract extension. |
| Cards | `Card = rank*4 + suit` (0..51), rank 0 = deuce .. 12 = ace, suit order `s h d c`. Text codes `As`, `Td` via `parseCards` (shared with content and URLs). |
| RNG | crappy's `xoshiro128**` seeded through `splitmix32`, plus `randBelow(n)` with rejection sampling. Each hand gets a Fisher-Yates shuffle of the cards not forced. RNG state lives in `GameState`, so play is replayable. |
| Forced decks | `ForcedDeal` lists any subset of player / dealer / flop / turn / river cards as codes. The rest is shuffled from the seed. A queue is kept per scene and per step. |
| Evaluator | Bitmask 7-card evaluator with no lookup tables (about 2 kB of code). Exhaustively tested against the 133,784,560 / 2,598,960 category counts and the 4,824 / 7,462 distinct-rank counts. |
| EV, river | **Exact** enumeration of the C(45,2) = **990** dealer hands. Under 5 ms. |
| EV, flop | **Exact** enumeration of 1,081 turn/river runouts × 990 dealer hands = **1,070,190** showdowns, with optimal river play inside the Check branch. About 100 ms in desktop Node, est. 400–600 ms on the phone in the Web Worker, started speculatively when the flop is dealt. |
| EV, preflop | **Exact precomputed table**: 169 starting classes × {Raise EV as `A + k·P`, Check EV under optimal later play, breakdown counts}. Generated offline, about 8 kB, committed, verified against the independent C run. Lookup is under 1 ms. |
| Exact vs estimate | Every decision EV, every paytable edge and every strategy's EV per hand is **exact**. Only multi-hand simulation results (bankroll paths, percentiles, bust rates) are **estimates**, and they are labelled "≈ … simulated". §2.6. |
| Primary metric | EV of the decision for the hand as a whole (Ante + Blind + Play) in **ante units and $**, plus the **cost against the best option**. The house edge is quoted **per Ante** (2.185%), with element of risk as the secondary metric. |
| Tiers | Decisions get a regret tier (`best/close/small/costly/blunder`); only `blunder` (red) needs a second tap. The Trips wager gets an edge tier (crappy's `free/good/fair/poor/avoid`). §2.4. |
| Transport | All EV goes through architecture.md's `EvClient` (`preview`, `simulate` jobs, generator-based, cancellable, worker with in-thread fallback). |
| Rendering | SVG felt, data-driven layouts for portrait (390×844) and landscape (844×390), HTML action bar and EV sheet. Every target is at least 44 px. |
| Fold reveal | When you fold, the dealer's cards are revealed with "You would have won $X / lost $Y" (D7). |
| Practice mode | A sandbox toggle, off by default, that hides EV until you confirm and then grades the move (D11). |
| Strategies | Ladder `perfect` → `basic` → `simple` (D16), plus `expert` (fast perfect for sims), `check-to-river`, `never-fold`, `always-max`, and lesson-only `riverLeak`, each with an **exact** EV per hand and a Trips amount. Multi-session sims with charts. |

---

## 1. Game engine (`src/sim/engine/`)

### 1.1 Files

```
src/sim/engine/
  types.ts        // frozen contract, verbatim from §1.2
  cards.ts        // parseCard(s), cardCode, rankOf, suitOf, FULL_DECK, cardName (a11y)
  rng.ts          // seedRng, nextU32, randBelow, shuffle (copied from crappy rng.ts + 2 fns)
  deck.ts         // dealHand(rng, forced): resolves a ForcedDeal into a full Deal
  evaluator.ts    // evaluate7, evaluate5, evaluateN, categoryOf, describeHand, best5
  paytables.ts    // BLIND_PAYTABLES, TRIPS_PAYTABLES, PAYTABLE_PRESETS, blindPay, tripsPay
  rules.ts        // DEFAULT_RULES, resolveRules
  wagers.ts       // WAGERS registry (WagerDef per WagerId), settleHand (pure resolution)
  validate.ts     // validateAction, legalActions, maxAnte
  game.ts         // createGame, applyAction, replay, visibleView, equity
  money.ts        // formatMoney, formatPct (copied from crappy)
  index.ts
```

### 1.2 `types.ts` (frozen contract: WP0 copies it verbatim)

```ts
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
  /** Chips on the felt for the current/next hand. blind always equals ante. */
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
```

`game.ts` signatures (not frozen beyond these):

```ts
export interface CreateGameOptions {
  rules?: Partial<TableRules>;
  bankroll?: Cents;                 // default 50_000
  seed?: number;                    // UI seeds once from crypto.getRandomValues
  bets?: { ante?: Cents; trips?: Cents };
  forcedDeals?: ForcedDeal[];
  /** Start mid-hand (lessons, drill "play it out", ?street= URLs). Deal must cover the visible cards. */
  startAt?: { street: DecisionStreet; deal: ForcedDeal; play?: PlayMultiple };
}
export function createGame(opts?: CreateGameOptions): GameState; // throws on invalid opts
export function applyAction(state: GameState, action: Action): ApplyResult;
export function replay(initial: GameState, actions: readonly Action[]): GameState;
export function visibleView(state: GameState): VisibleView;
export function equity(state: GameState): Cents; // bankroll + chips on the felt
export function legalActions(state: GameState): Action[];
```

### 1.3 Rules and the wager registry

| Wager | When placed | Settles | Pays |
|---|---|---|---|
| `ante` | betting; amount = `a` | showdown | Player wins and the dealer qualifies: +a (1:1). Dealer doesn't qualify: **push**, win or lose. Player loses and the dealer qualifies: −a. Tie: push. Fold: −a. |
| `blind` | automatically = ante | showdown | Player wins: paid by the Blind paytable if straight or better, otherwise **push**. Player loses: −a (qualification is irrelevant). Tie: push. Fold: −a. |
| `play` | at the decision: 4a/3a preflop, 2a flop, 1a river | showdown | Win +amount, lose −amount, tie push. Qualification is irrelevant. |
| `trips` | betting; optional; needs an ante | end of hand, **even after a fold** | Trips paytable on the player's best 5 of 7. Below trips: lose. Independent of the dealer. |

The Play bet can be made only once. After a Play, the engine deals the
remaining board, reveals and settles in the **same** `applyAction` (the UI
paces the events, as in crappy). A check advances one street. At the river the
only actions are `play 1` and `fold`.

**Paytables** (`paytables.ts`; payouts "to 1" unless shown):

| id | Royal | SF | Quads | FH | Flush | Straight | Trips | House edge (exact) |
|---|---|---|---|---|---|---|---|---|
| `blind-standard` | 500 | 50 | 10 | 3 | 3:2 | 1 | push | (part of the game EV) |
| `trips-8-6-5` (default) | 50 | 40 | 30 | 8 | 6 | 5 | 3 | 48987/2572780 = **1.904%** |
| `trips-9-7-4` | 50 | 40 | 30 | 9 | 7 | 4 | 3 | 301629/33446140 = 0.902% |
| `trips-8-7-4` | 50 | 40 | 30 | 8 | 7 | 4 | 3 | 233985/6689228 = 3.498% |
| `trips-7-6-5` | 50 | 40 | 30 | 7 | 6 | 5 | 3 | 115779/2572780 = 4.500% |
| `trips-8-6-4` | 50 | 40 | 30 | 8 | 6 | 4 | 3 | 545459/8361535 = 6.523% |

Trips EV = Σ count(category) × pay − (losing hands), over 133,784,560 seven-card
hands. P(Trips pays) = 20,428,900 / 133,784,560 = 60085/393484 = 15.27%.
Payouts are exact cents (the Blind flush on $5 pays $7.50). The ante is whole
dollars, so every payout is an integer number of cents.

**Money flow.** `set-bet` moves chips between the rack and the felt (the blind
mirrors the ante). `play` moves `multiple × ante` from the rack. At settlement
each wager returns `amount + profit` to the rack, or 0 when it loses. After
`hand-settled`, the felt keeps the **same ante/trips** for the next hand.
`deal` from `settled` re-bets them (validated for funds), and `clear` returns
them to the rack.

### 1.4 Validation (`validateAction`, pure; first failure wins)

- `set-bet`: street is `betting` or `settled`, else `wrong-street`. A positive
  multiple of `betUnit` (trips may be 0), else `bad-amount`. Within
  `anteMin..anteMax` / `tripsMin..tripsMax`, else `below-min`/`above-max`. Trips > 0
  needs ante > 0 (`needs-ante`). The change in chips (ante counts twice, for the
  blind) must be ≤ bankroll, else `insufficient-funds`.
- `deal`: street `betting` or `settled`, and ante > 0 (`needs-ante`). From
  `settled`, the bankroll must cover the re-bet. Warning `cant-afford-max-raise`
  when bankroll < 4 × ante after the bets.
- `check`: street `preflop` or `flop`, else `wrong-street`.
- `play`: preflop multiple ∈ `preflopMultiples`, flop = 2, river = 1, else
  `bad-multiple`. `multiple × ante ≤ bankroll`, else `insufficient-funds`. Not at
  `betting`/`settled`.
- `fold`: river only.
- `clear`: `settled` only.

### 1.5 Hand flow and settlement (`wagers.ts: settleHand`, pure)

`deal` order (fixed positions, so a seed always gives the same hand): take the
forced cards, remove them from the 52, shuffle the rest with the RNG, fill
player 1–2, dealer 1–2, flop 1–3, turn, river in that order. Events:
`hand-started`, `player-dealt`, `dealer-dealt`.

`settleHand(deal, bets, play, folded, rules) → HandResult`:
1. `P = evaluate7(player + board)`, `D = evaluate7(dealer + board)`, `q = D.category ≠ 'high-card'`.
2. Fold: ante −a, blind −a (`folded`), no play, and Trips settled as usual.
   `ifPlayed` = the settlement with play 1x.
3. Otherwise `outcome = sign(P.value − D.value)`. Win: play +, ante + if q,
   else push (`dealer-not-qualified`), blind by paytable (`blind-bonus`) or push
   (`blind-push-under-straight`). Lose: play −, blind −, ante − if q, else push.
   Tie: all push.
4. Trips: `tripsPay(P.category)`.
5. Events in order: `board-dealt` (whatever remained), `dealer-revealed`,
   `showdown`, `wager-settled` × n (ante, blind, play, trips), `hand-settled`.

**Golden settlements** ($10 ante, $10 blind, $5 trips; net in $):

| Situation | Ante | Blind | Play | Trips | Net |
|---|---|---|---|---|---|
| Raise 4x, win with a flush, dealer qualifies | +10 | +15 | +40 | +30 | +95 |
| Raise 4x, win with two pair, dealer has ace high (no qualify) | 0 | 0 | +40 | −5 | +35 |
| Raise 2x, lose to the dealer's pair | −10 | −10 | −20 | −5 | −45 |
| Play 1x, lose with king high to the dealer's ace high (no qualify) | 0 | −10 | −10 | −5 | −25 |
| Fold with trips on the board (Trips still pays 3:1) | −10 | −10 | 0 | +15 | −5 |
| Raise 4x, win with a royal flush | +10 | +5,000 | +40 | +250 | +5,300 |
| Tie (board plays) | 0 | 0 | 0 | −5 | −5 |

### 1.6 RNG, shuffle, forced decks (`rng.ts`, `deck.ts`)

```ts
export function seedRng(seed: number): RngState;             // crappy
export function nextU32(r: RngState): [number, RngState];    // crappy
export function randBelow(r: RngState, n: number): [number, RngState]; // rejection: limit = 2^32 - (2^32 % n)
export function shuffle<T>(r: RngState, xs: readonly T[]): [T[], RngState]; // Fisher-Yates, i from end
export function dealHand(r: RngState, forced?: ForcedDeal): [Deal, RngState]; // throws on duplicate/invalid codes
```
A deal makes exactly `52 − |forced| − 1` `randBelow` calls, so a forced card never shifts
the rest of the RNG stream in an uncontrolled way. Replay is still exact.

### 1.7 Hand evaluator (`evaluator.ts`)

Bitmask algorithm (verified in `eval.h`; the JS port in `bench.mjs` runs at
about 20–50 M hands/s in desktop Node):
1. Build four 13-bit suit masks and 13 rank counts.
2. If any suit has ≥ 5 bits: straight-flush test on that mask (royal if the
   top card is an ace), otherwise flush with the top 5 bits. In 7 cards a flush
   excludes quads and full houses, so this early return is safe.
3. Otherwise quads, full house (trips + second trips or a pair), straight on
   the OR mask (`m2 = m<<1 | ace-low`, `s = m2 & m2<<1 & … & m2<<4`), trips,
   two pair, pair, high card. Kickers are packed 4 bits each.

API: `evaluate7(cards: readonly Card[]): HandValue` (hot path, no allocation,
no `best5`), `evaluateHand(cards): EvaluatedHand` (UI, computes `best5`),
`evaluateN(n = 5..7)`, `categoryOf(v) = HAND_CATEGORIES[v >>> 20]`,
`describeHand(h)` → "Two pair, kings and sevens", `compareHands(a, b)`. For the
EV hot loops, `evalMasks(sm0, sm1, sm2, sm3, counts)` is exported for
incremental use: the board masks are precomputed once and two cards are added
per dealer combination.

Exhaustive results (asserted in tests):

| Category | 5-card | 7-card |
|---|---|---|
| Royal flush | 4 | 4,324 |
| Straight flush (excl. royal) | 36 | 37,260 |
| Quads | 624 | 224,848 |
| Full house | 3,744 | 3,473,184 |
| Flush | 5,108 | 4,047,644 |
| Straight | 10,200 | 6,180,020 |
| Trips | 54,912 | 6,461,620 |
| Two pair | 123,552 | 31,433,400 |
| Pair | 1,098,240 | 58,627,800 |
| High card | 1,302,540 | 23,294,460 |
| **Total** | **2,598,960** | **133,784,560** |
| Distinct `HandValue`s | **7,462** | **4,824** |

---

## 2. EV module (`src/sim/math/`) and its worker jobs

### 2.1 Files

```
src/sim/math/
  fraction.ts     // crappy's Fraction, fields renamed to {num, den} (D13); + toCents, fmt
  types.ts        // frozen payload types (§2.2), imported by worker/protocol.ts
  enumerate.ts    // riverCounts(), flopJob() generator: exact enumeration
  preflop.ts      // preflopClass(hole) → '72o'; preflopPreview() from the table
  tables/preflop-blind-standard.ts   // @generated (gen:tables), ~12 kB
  preview.ts      // previewJob(req): one generator for every street → DecisionPreview
  tiers.ts        // decisionTier(regret), wagerTier(edge)
  explain.ts      // WhyBreakdown rows + formula strings
  edges.ts        // tripsEdge(paytable), GAME_EDGE (house edge per ante, exact), perHour()
  index.ts
src/sim/worker/   // architecture.md §4 (protocol.ts frozen there), jobs.ts wires:
                  //   preview  → math/preview.ts previewJob
                  //   simulate → strategy/simulate.ts simulateJob
```

Rules from architecture.md §4.1 apply: math is pure and synchronous, long jobs
are generators that `yield { done, total }`, the UI reaches math only through
`EvClient` (direct imports are allowed for the preflop table, paytables, tiers
and the edge constants), and messages are plain data with bigint `Fraction`
records.

### 2.2 `math/types.ts` (frozen together with engine `types.ts`)

```ts
// ===== src/sim/math/types.ts — FROZEN (payloads of worker/protocol.ts) =====
import type {
  BlindPaytableId, Card, Cents, DecisionAction, DecisionStreet, HandCategory,
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
  label: string;                   // 'Raise 4x' | 'Raise 3x' | 'Check' | 'Raise 2x' | 'Raise 1x' | 'Fold'
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
```

### 2.3 How each decision is computed

The EV of a decision is the expected net of **Ante + Blind + Play** from now to
the end of the hand, in ante units, averaged over all **unseen cards** (the
deck minus the player's hole cards and the visible board). Forced decks don't
change it, because the player never sees them. The Trips bet doesn't depend on
any decision (it stays in action on a fold), so it is shown apart from the
options, never mixed into them.

Per (final board, dealer hand), with ante = 1, a Play of k units, and the
player's Blind multiple `b` (0 below a straight; 1, 3/2, 3, 10, 50, 500):

| Case | Net |
|---|---|
| win, dealer qualifies | 1 + b + k |
| win, dealer doesn't qualify | b + k |
| tie | 0 |
| lose, dealer qualifies | −2 − k |
| lose, dealer doesn't qualify | −1 − k |
| fold (river only) | −2 |

So for a fixed final board with counts W, Wq, L, Lq over its dealer hands n:
**EV(k) = (W·b + Wq − L − Lq + k·(W − L)) / n = A + k·P**. It is linear in k.
Two consequences used everywhere:
- **Raise 3x is never strictly best preflop**. If P̄ > 0 then 4x beats 3x; if
  P̄ ≤ 0 then "check and always play 1x on the river" is already ≥ 3x. The sheet
  still shows 3x with its exact EV (from the same A, P).
- The engine counts all values in **half-antes** (×2) so the 3:2 flush is an
  integer. Every sum is an integer over a fixed denominator.

| Street | Unseen | Enumeration | Showdowns | Exact denominator (half-antes) | Where | Budget |
|---|---|---|---|---|---|---|
| River | 45 | C(45,2) = 990 dealer hands | 990 | 2·990 | worker or in-thread | **< 5 ms**; < 100 ms at 4× throttle |
| Flop | 47 | C(47,2) = 1,081 runouts × C(45,2) = 990 | 1,070,190 | 2·990·1,081 | **worker**, starts on `board-dealt flop` | **≤ 600 ms** at 4× throttle (target), 1.5 s hard (architecture §4.5) |
| Preflop, Raise | 50 | C(50,5) = 2,118,760 boards × 990 | 2,097,572,400 | 2·990·2,118,760 | table | < 1 ms lookup |
| Preflop, Check | 50 | C(50,3) = 19,600 flops × the flop computation | 20,975,724,000 (per class) | 2·990·21,187,600 | table | < 1 ms lookup |

**River.** Count W, Wq, L, Lq over 990 dealer hands; Play 1x = A + P, Fold = −2.

**Flop.** For each of the 1,081 (turn, river) pairs, compute the river counts.
Then **Raise 2x** = mean(A + 2P), and **Check** = mean(max(A + P, −2)): the
river is played perfectly inside the Check branch. Implementation notes, so the
phone budget holds:
- The player value is evaluated once per runout (1,081 times). The board suit
  masks and rank counts are built once per runout, and the first dealer card's
  masks once per (runout, card). Only the second dealer card is added in the
  inner loop (crappy-style typed arrays, no allocation).
- A generator yields `{ done: runouts, total: 1081 }` every 32 runouts (~32 k
  showdowns, ~3 ms), so the `runSliced` 50 ms slices and cancel messages work.
- **Measured:** the scratch JS port (`bench.mjs`, non-incremental) takes about
  100 ms in Node on this machine (256 ms with JIT warm-up). The incremental
  version will be faster. A mid-range Android phone is about 4× slower, so 300–500 ms.
  Because the job starts as soon as the flop lands (during the ~600 ms deal
  animation), the sheet is usually ready before the first tap.
- Cache: the client LRU memo (architecture §4.2) keyed by sorted hole + sorted
  flop + paytable. Drill and replays of the same spot are instant.

**Preflop.** A table lookup by **hand class** (169: 13 pairs, 78 suited, 78
offsuit; weights 6/4/12, total 1,326). The table stores integer sums from which
every figure is reconstructed exactly. Doing this on the device is impossible
(over 2·10^10 showdowns per class for Check), and Monte Carlo would be both
slower and inexact. §2.7 has the format, generator and verification.

**Not decision-dependent, exact constants** (`edges.ts`):
- Trips edge per paytable (§1.3). Trips is shown on the betting step with its
  `WagerTier` and in the EV sheet header as "Trips: −1.90% of the Trips bet, any decision".
- The game: EV per hand under perfect play = **−50643648973/2317817502000 ≈ −0.0218497** antes, so the house
  edge is **2.18497% of the Ante**. Expected total wagered per hand is
  29163830173/7023689400 ≈ 4.15221 antes (ties → smaller wager), so the element of risk (loss / total wagered) is **50643648973/9624063957090 ≈ 0.52622%**.
  Both are exact fractions in `edges.ts` (Appendix A).

### 2.4 Tiers

**Decision tiers** use the regret r = EV(best) − EV(chosen), in ante units:

| Tier | Regret (antes) | Badge text | Colour token | Confirm |
|---|---|---|---|---|
| `best` | r = 0 | "Best play" | `--ev-best` (teal) | one tap |
| `close` | 0 < r ≤ 0.02 | "Close: −0.0x ante" | `--ev-close` (green) | one tap |
| `small` | 0.02 < r ≤ 0.10 | "Small mistake" | `--ev-small` (yellow) | one tap |
| `costly` | 0.10 < r ≤ 0.50 | "Mistake" | `--ev-costly` (orange) | one tap + alternative card |
| `blunder` | r > 0.50 | "Big mistake" | `--ev-blunder` (red) | **second tap** ("Do it anyway") when `confirmCostlyMoves` is on |

Calibration (exact, from the precompute and the §2.5 examples):
- Preflop, every class near the chart boundary has regret < 0.10 (K2s 0.005,
  J8s 0.011, T9s 0.020, Q5s 0.021, Q6s 0.022, K4o 0.023, Q8o 0.023, K5o 0.034,
  33 0.081), so getting a boundary hand "wrong" is `close` or `small`.
- Big errors are `blunder`: checking AA costs 1.408 ante (raise +3.601 vs
  check +2.193); checking AKs costs 0.672 and AKo 0.603.
- Typical flop/river mistakes are `costly`: checking a hidden pair on the flop
  (A♥7♣ on 7♦K♠2♣) costs 0.479, folding ace high in §2.5's spot costs 0.320,
  and raising with nothing (3♣4♦ on AKQ97) costs 0.359.

The text label always accompanies the colour. The `blunder` threshold is in
`tiers.ts` as one constant, so decisions.md can move it.

**Wager tiers** (Trips): crappy's thresholds on the edge per bet: `free` ≤ 0,
`good` ≤ 2%, `fair` ≤ 5%, `poor` < 9%, `avoid` ≥ 9%. With these, Trips
8-6-5 (1.90%) and 9-7-4 (0.90%) are `good`, 8-7-4 (3.50%) and 7-6-5 (4.50%) are
`fair`, and 8-6-4 (6.52%) is `poor`. No second tap: it's a side bet you choose
before the hand, not a decision.

### 2.5 The EV sheet, alternatives, "Why?"

For each option the sheet shows its EV as **"+$3.42 (+0.342 ante)"** with the
tier badge. The best option is marked "Best", and every other option shows "−$x
vs best". A non-best choice gets the **better alternative** card: *"Raise 2x
instead: +$1.00 vs +$0.52 (you keep $0.48 more per hand on average)"* with
"Use this". No curated list is needed: the alternative is always `options[bestIndex]`.

"Why?" rows (`explain.ts`), worked examples that are pinned as tests:

**River, play vs fold.** A♠7♣ on K♦ 9♥ 5♣ 3♠ 2♦ (ace high, no pair). Over 990 dealer hands:

| Row | Count | Net (antes) |
|---|---|---|
| You win, dealer doesn't qualify | 308 | +1 |
| You win, dealer qualifies | 0 | +3 |
| Tie | 9 | 0 |
| You lose, dealer doesn't qualify | 48 | −2 |
| You lose, dealer qualifies | 625 | −3 |
| **Raise 1x** | | (308 − 96 − 1875)/990 = **−1663/990 ≈ −1.680** |
| **Fold** | 990 | **−2** |

Raising is better by 317/990 ≈ 0.320 ante (folding is `costly`). Copy: *"Even
when you'll often lose, raising 1x costs less than folding: folding throws away
the Ante and Blind for sure (−2), raising averages −1.68."*

**River, fold is right.** 3♣4♦ on A♥ K♠ Q♦ 9♣ 7♥ (you play the board): W = 0,
L = 861 (613 qualify), T = 129. Raise 1x = −467/198 ≈ −2.359, Fold = −2, so
raising costs 71/198 ≈ 0.359 ante (`costly`).

**River, a weak pair.** 8♥4♥ on 8♣ K♦ T♠ 6♠ 2♣: W 611 (207 qualify), L 357
(all qualify), T 22. Raise 1x = −23/90 ≈ −0.256.

**Flop.** A♥7♣ on 7♦ K♠ 2♣ (a hidden pair of sevens): Raise 2x =
**178661/178365 ≈ +1.0017**, Check (best river play) = **93143/178365 ≈ +0.5222**.
This is verified by the independent Python oracle (best-of-21, 1,070,190
showdowns) against the JS port. Regret of checking = 85518/178365 ≈ 0.479
(`costly`). The Check "Why?" adds `later-play`/`later-fold` rows: on how many of
the 1,081 river cards you'd raise 1x or fold, with their average EVs.

**Preflop.** Rows come from the table: for Raise, the five showdown rows over
2,097,572,400 (board, dealer) cases. For Check, `later-raise` (flops where 2x is
best), `later-play` and `later-fold` (river outcomes on checked flops). The
note is "Assumes you play the flop and river perfectly."

### 2.6 Exact figures vs estimates, and how the UI labels them

| Figure | Kind | UI label |
|---|---|---|
| Decision EVs, regrets, tiers (all streets) | **exact** rational | "EV +$3.42". A small "exact" tick next to the figure, with a tooltip/"Why?" that shows the fraction |
| Paytable edges, P(Trips pays), hand-category odds | **exact** | as above; `#/bets` and `#/hands` show the fraction in "Show the math" |
| House edge / element of risk under each strategy (`StrategyMetrics`) | **exact** (precomputed in Appendix A / `edges.ts`) | "Expected: −$0.22 per hand · −$6.56 per hour" |
| The "expected" line in bankroll charts | **exact** per-hand EV × hands | solid "Expected" legend |
| Simulated bankroll paths, percentiles, bust rate, P(ahead), realised loss | **estimate** (seeded Monte Carlo) | "≈ … (simulated, 100 sessions)". The mean final result shows "± $x (95%)" from the sample s.d. |
| Drill grading | exact (perfect lens) or rule-based (practical lens) | "Best play" / "Chart says Raise 4x" |

Formatting rules: ante units go to 3 decimals ("+0.342 ante"), dollars to cents.
A regret that rounds to $0.00 shows "less than 1¢". The word "exactly" appears
in "Show the math" only, never as decoration.

### 2.7 Preflop table: format, generation, verification

`src/sim/math/tables/preflop-blind-standard.ts` (`// @generated by npm run gen:tables — sha256 …`):

```ts
export const PREFLOP_BLIND_STANDARD: PreflopTable = {
  blindPaytable: 'blind-standard',
  // Raise-path sums over 2,118,760 boards × 990 dealer hands; check sums over 21,187,600 (flop, turn-river) × 990.
  denRaise: 2_097_572_400n, denCheck: 20_975_724_000n,
  rows: 'AA:wq,wnq,lq,lnq,bb2,sc,fr,cp,cf;AKs:…'   // base-36 integers, 169 entries
};
export interface PreflopTable {
  blindPaytable: BlindPaytableId; denRaise: bigint; denCheck: bigint; rows: string;
}
```
Per class: `wq, wnq, lq, lnq` = showdown counts on the raise path; `bb2` = Σ
(2 × Blind multiple) over winning cases; `sc` = Σ over flops of max(2x-sum,
check-sum) in half-antes (so Check EV = sc / (2·denCheck)); `fr` = flops where
2x is best; `cp`, `cf` = river play/fold counts on checked flops. Raise EV(k) = A + k·P with
**A = (bb2/2 + wq − (lq+lnq) − lq) / denRaise** and **P = ((wq+wnq) − (lq+lnq)) / denRaise**
(ante units; this is §2.3's per-board formula summed). About 169 × 9 × 7 chars ≈ 11 kB raw, inside the 150 kB
budget (architecture §4.6).

- **Generator** (`tests/gen/tables.gen.test.ts`, `GEN_TABLES=1`): uses the
  engine's `evalMasks` and the same per-board loop as `strat.c`: the board pass
  is shared, and the flop aggregation reuses the per-board (A, P) array
  (2,118,760 entries) so each class costs ~2.1·10^9 showdowns, not 2·10^10. It
  splits the 169 classes over `node:worker_threads` (4 cores). The C version
  took about 75 min on 4 cores here, so expect several hours in JS: it is a one-off, not CI.
- **Verify** (CI, < 30 s): (1) the header sha256; (2) the reconstructed
  `SA = bb2 + 2wq − 2(lq+lnq) − 2lq`, `SP = 2(wq+wnq−lq−lnq)` and `SC` of **all 169 classes equal the
  independent C results in Appendix A exactly**; (3) the weighted perfect-play
  EV equals `GAME_EV`; (4) for 6 sampled classes, Raise EV vs a 200 k-sample
  Monte Carlo within 4σ; (5) for 3 classes × 20 random flops, the per-flop best
  value from the flop enumerator lies within the class's range (sanity), and
  the table's Check EV vs a 2 k-flop sampled mean of the exact flop job
  within 4σ (slow-tagged, `SLOW=1`, run nightly or by reviewers).
- **Tie rule**: on an exact EV tie, choose the smaller total wager (check, or
  fold at the river), as in curriculum.md. EVs and `SC` don't depend on it, but
  the counts `fr`, `cp`, `cf` and the expected wager do. The scratch C run broke
  ties the other way, which explains its E[wager] 29164125301/7023689400 vs the
  canonical **29163830173/7023689400** (difference 295128/7023689400 ≈ 0.00004 ante,
  i.e. exact river ties where Raise 1x = Fold = −2). Pin the canonical value.
- Adding a Blind preset = add a `BlindPaytableId`, run the generator, add the
  pinned row set. The registry test fails if any Blind preset lacks a table.

### 2.8 Metrics for strategies, sessions and per hour

- **Primary (EV sheet):** decision EV and regret in ante units and $.
- **House edge per Ante** (lessons, `#/bets`, chart legends): −EV per hand / ante.
- **Element of risk:** −EV per hand / E[total wagered per hand] (Ante + Blind +
  Play + Trips if used), exact per strategy.
- **Per hour:** handsPerHour (30, D10) × ante × edge per ante (+ the Trips
  edge × the Trips amount). Perfect play at a $10 ante: **$6.55/hour**,
  and with $5 Trips (8-6-5) another **$2.86/hour** (30 × $5 × 1.904%).
- **Session panel:** hands, total wagered, actual net, expected net (Σ exact
  per-hand EV of the strategy actually used: the sum of the decision EVs taken,
  from previews), **luck** = actual − expected, and **mistake cost** = Σ regret of
  the decisions taken. In the sandbox it needs the previews (always computed
  for decisions). For a skipped preview the container runs it after the fact,
  in the background.

---

## 3. Rendering (`src/sim/ui/`)

### 3.1 Approach

As in crappy: **SVG** felt with data-driven layouts (cards, chip stacks,
betting circles, dealer button, labels), and **HTML** for the action bar, the
chip rack, the EV sheet, toasts, the step panel and the auto-play panel.
Presentational components take plain props, and only `Simulator.tsx`
(integration) owns state.

```ts
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export type CircleId = 'trips' | 'ante' | 'blind' | 'play';
export interface FeltLayout {
  viewBox: { w: number; h: number };
  cardSize: { w: number; h: number };
  dealer: [Pt, Pt];                     // card top-left positions
  board: [Pt, Pt, Pt, Pt, Pt];
  player: [Pt, Pt];
  circles: Record<CircleId, { c: Pt; r: number; label: string; sublabel?: string }>;
  handLabels: { dealer: Pt; player: Pt }; // "Pair of kings", "Dealer qualifies"
  deckPos: Pt;                           // cards fly from here
  rackPos: Pt;                           // chips fly to/from here
  minTapUnits: number;                   // 44 CSS px in viewBox units at the reference viewport
}
```

Cards are SVG `<g>` elements: rounded rect, big rank + suit glyph in the
corner, a large centre pip. Suit colours come from tokens: 2-colour by default,
**4-colour** when `fourColorDeck` is set. The back is a navy pattern. The
accessible name is "Ace of spades". Cards are never images, so they take no
bytes.

### 3.2 Portrait (viewBox 0 0 390 600; at 390 CSS px wide, 1 unit = 1 px)

| Element | Geometry (x, y, w, h) or centre/r |
|---|---|
| Dealer cards | (122, 16) and (198, 16), card 70×98 |
| "Dealer" label + hand text | centred at y 128 |
| Board (5 cards) | x = 16, 89, 162, 235, 308; y 150; card 64×90 (9 px gaps, 18 px right gutter) |
| Trips circle | c (195, 290), r 30, label "TRIPS" |
| Ante / Blind circles | c (125, 362) / (265, 362), r 34, separated by "=" |
| Play circle | c (195, 440), r 38, label "PLAY" |
| Player cards | (122, 488) and (198, 488), card 70×98, slightly raised and overlapping the felt edge |

Below the SVG: the **action bar** (HTML, 2–3 buttons, each ≥ 56 px high,
full-width split), then the chip rack (≥ 48 px chips) during betting. Total at
390×844: header 48 + status bar 44 (bankroll · on felt · session ±) + felt 600
+ action bar 72 = 764 px, so it fits. The felt scales with `meet` on shorter
phones and centres on wider ones (Pixel 7 at 412×915 has room).
Betting circles are tap targets during betting (tap → add the selected chip;
long-press or the stack → the manage sheet).

### 3.3 Landscape (844×390): felt viewBox 0 0 560 390 + right rail 284 px

| Element | Geometry |
|---|---|
| Dealer cards | (200, 10), (268, 10), card 60×84 |
| Board | x = 80, 162, 244, 326, 408; y 112; card 62×86 |
| Trips / Ante / Blind / Play | circles in one row at y 250: c x = 110, 220, 330, 440, r 30 (Play r 34) |
| Player cards | (200, 296), (268, 296), card 60×84 |

The right rail holds the action buttons (stacked, each ≥ 52 px, **always
visible**), the compact EV list (options + EV + badge, without tapping), and
the "Details"/"Why?" sheet as a rail panel. Landscape at 863×360 (Pixel 7)
keeps the same rail, and the felt scales by `meet`. Scenes put the step panel at
the top of the rail.

### 3.4 Interaction flow

1. **Betting**: pick a chip, tap the Ante circle (the Blind matches
   automatically and animates) and optionally Trips. The bar shows **Deal** (with
   "Ante + Blind $20 · Trips $5" under it) and **Clear**. The Trips circle's
   manage sheet shows the paytable and the `WagerTier` badge (edge 1.90%).
2. **Decision streets**: the bar shows the options (preflop **Check · Raise 3x
   · Raise 4x**, flop **Check · Raise 2x**, river **Fold · Raise 1x**). When EV is
   on, each button carries a tiny badge and its EV ("+0.34"). Tapping a button
   opens the **EV sheet** with that option selected:
   - all options in a list (label, EV in $ and antes, "−$x vs best", tier badge),
     the selected one highlighted, switchable in place;
   - a headline: "Raise 4x: +$5.21 · Best play";
   - the alternative card (non-best) with "Use this";
   - a "Why?" expander (rows from §2.5; scenes can open it);
   - **Confirm** / **Cancel**. `blunder` needs a second tap ("Do it anyway").
   - While a flop preview is computing: a skeleton after 150 ms and a progress
     bar. Confirm stays enabled (EV is advisory, architecture §4.2).
   - **Practice mode** (D11): the sheet hides EVs; after Confirm, a result card
     shows "Best play ✓" or "Mistake: Raise 2x was worth $0.48 more" with the
     full sheet below.
   - **Skip preview** (expert setting): a tap confirms immediately, and the EV
     still appears in the toast.
3. **Resolution**: cards flip in order (turn and river, then the dealer's
   cards), the hand labels appear ("Dealer: pair of 9s, qualifies"), chips move
   per wager (wins slide from the dealer, losses slide away, pushes pulse). A
   toast summarises: *"Your two pair beat the dealer's pair of 9s. Ante +$10,
   Blind push (needs a straight), Play +$40. Net +$50."* (`describeHand(events)`
   in `ui/text.ts`).
4. **Fold** (D7): the dealer's cards are revealed anyway, with "You would have
   won $25" / "You would have lost $30" from `HandResult.ifPlayed`.
5. **Settled**: **Rebet & Deal** (primary) and **Change bets**.

### 3.5 Animation and pacing (crappy pattern)

The engine resolves instantly, and `animation.ts` builds a timeline from the
events: deal card 180 ms each (normal) / 80 (fast) / 0 (instant); flop flip
3 × 150 ms; turn/river 2 × 200 ms; dealer reveal 400 ms; chip moves 400 ms. Tap
anywhere to skip. OS reduced motion forces `instant` with 150 ms fades. Only
transforms and opacity are animated. Auto-play "Watch" uses `fast`.

### 3.6 Accessibility

The circles are `role="button"` with labels like "Ante, $10. Blind matches.".
Cards are `role="img"` with full names. Decision buttons read "Raise 4x, EV plus
$5.21, best play". The EV sheet is a focus-trapped dialog, and results are
announced with `aria-live="polite"`. Tier is never shown by colour alone. Felt text
contrast ≥ 4.5:1 on navy `#0b2e4a`.

### 3.7 UI files (owner in brackets)

```
src/sim/ui/
  Simulator.tsx  StepPanel.tsx  persist.ts  settings.ts       [integration]
  Felt.tsx  Card.tsx  ChipStack.tsx  BetCircle.tsx            [table-ui]
  ActionBar.tsx  ChipRack.tsx  StatusBar.tsx  Toasts.tsx       [table-ui]
  EvSheet.tsx  EvOptionList.tsx  WhyTable.tsx  TierBadge.tsx  [table-ui]
  HandHistory.tsx                                              [table-ui]
  StrategyChart.tsx (13×13 preflop grid + flop/river rules)    [table-ui, data from strategy]
  AutoPlayPanel.tsx  BankrollChart.tsx  OutcomeHistogram.tsx   [strategy]
  layouts/{portrait,landscape,index}.ts   animation.ts  text.ts  sim.css   [table-ui]
  gallery.tsx  (dev-only, driven by the REAL engine + EV client) [table-ui]
```

---

## 4. Scenes (`src/sim/scene/`)

### 4.1 `SceneConfig` (JSON/YAML; money in cents; cards as codes)

```ts
// src/sim/scene/types.ts — frozen with the engine contract
import type { ActionType, Cents, DecisionStreet, ForcedDeal, GameEvent, PlayMultiple,
  Street, TableRules, TripsPaytableId, WagerId } from '../engine/types';
import type { StrategyId, StrategySpec } from '../strategy/types';

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
  | { acknowledged: true };

export interface SceneRuntime {
  stepIndex: number; stepStartHand: number; counters: Record<string, number>;
  done: boolean; satisfied?: boolean;
}
export type SceneInput =
  | { kind: 'action'; action: Action; events: GameEvent[]; wasBest?: boolean }
  | { kind: 'previewed'; option: OptionKey; whyOpened: boolean }
  | { kind: 'acknowledged' }
  | { kind: 'auto-play-completed'; hands: number; strategy: StrategyId };
```
(`Action` is imported from engine types as well.)

Runner API (pure, crappy names): `initScene`, `gateAction` (returns
`not-allowed-by-scene` with the hint), `observe`, `validateScene(json)`.
`validateScene` checks: card codes parse; no duplicate card within a
`ForcedDeal` or between `startAt.deal` and the visible street (a flop start needs
`player` + `flop`, a river start also needs `turn` + `river`); every
`completeWhen` kind is known; options are legal for the street they appear in;
money amounts are integer cents and multiples of `betUnit`; the `bestDecisions`
and `best: true` matchers appear only where `showEV` is not false or practice
is on (the preview is computed anyway). **Completability lint:** a step whose
`completeWhen` needs a deal must have `deals`/`startAt`, or follow one; a
`handResult: {outcome: 'win'}` step must fully force player + dealer + board,
so the result is guaranteed.

### 4.2 Example (flop pair lesson)

```yaml
id: lesson-flop-hidden-pair
version: 1
bankroll: 50000
bets: { ante: 1000 }
evDetail: full
steps:
  - id: see-flop
    text: You hold {{Ah 7c}}. The flop is {{7d Ks 2c}}, so you have a **hidden pair** of sevens. Open both options.
    startAt: { street: flop, deal: { player: [Ah, 7c], flop: [7d, Ks, 2c], turn: 9h, river: 4s, dealer: [Kd, 3h] } }
    completeWhen: { all: [ { previewed: { option: play-2 } }, { previewed: { option: check } } ] }
    advance: button
  - id: raise
    text: Raising 2x is worth about **+1.00 ante**; checking only **+0.52**. Raise.
    math: "Raise 2x = 178661/178365 ≈ +1.0017; check (best river play) = 93143/178365 ≈ +0.5222."
    allowedOptions: [play-2, check]
    expect: [ { type: play, option: play-2 } ]
    completeWhen: { event: hand-settled }
    advance: button
```
(Here the dealer has K-3, so the dealer's pair of kings beats you. The lesson
shows that a correct decision can still lose: the step completes on
`hand-settled`, not on a win.)

### 4.3 Embedding

`Simulator` / `mountSimulator` / `SimulatorEvent` as in crappy, with events
`ready`, `previewed { preview, option }`, `action-confirmed { action, events,
state, preview? }`, `action-rejected`, `hand-settled { result, state }`,
`step-started`, `step-completed`, `scene-completed`, `auto-play-completed`.
Props: `scene?`, `mode?`, `settings` (from the app store: animationSpeed,
confirmCostlyMoves, fourColorDeck, paytable, anteUnitCents, handsPerHour,
practice), `evClient` (injected; the app creates one), `onEvent`, `persistKey`.
URL params from architecture §2.1 (`?seed ?hole ?board ?dealer ?street
?strategy ?speed`) map to `createGame({ seed, startAt })`.

---

## 5. Strategies, auto-play, simulation, drill (`src/sim/strategy/`)

### 5.1 Presets (exact EV per hand, Trips excluded, from the C precompute)

| Strategy | Lens | EV per hand (antes, exact) | Edge per Ante | vs perfect | $/hour at $10 ante, 30 hands | How |
|---|---|---|---|---|---|---|
| `perfect` | perfect | −50643648973/2317817502000 | 2.1850% | — | $6.55 | exact table + enumeration |
| `expert` | perfect (sims) | −106357031/4682459600 | 2.2714% | +0.0864 pp | $6.81 | table + basic flop + exact river |
| `basic` | practical | −54758439/2299422125 | 2.3814% | +0.1964 pp | $7.14 | rules (D15) |
| `simple` | practical | −47068162901/1738363126500 | 2.7076% | +0.5226 pp | $8.12 | rules (D16) |
| `check-to-river` | fun / teaching | −111371309107/347672625300 | 32.0334% | +29.8484 pp | $96.10 | check, check, perfect river |
| `never-fold` | fun / myth | −6432686411/15803301150 | 40.7047% | +38.5197 pp | $122.11 | check, check, always 1x |
| `always-max` | fun / maniac | −6432686411/15803301150 | 40.7047% | +38.5197 pp | $122.11 | 4x every hand |
| `riverLeak` | lesson-only | −6205519211/38630291700 | 16.0639% | +13.8789 pp | $48.19 | old "simple": folds without a hidden pair |

All values come from the independent C enumeration (`strat.c`, `strat2.c`)
and match curriculum.md's solver exactly (D15, D16). They are pinned as tests,
and `strategy.ev` returns them (no runtime computation). Adding $5 Trips (8-6-5) to
any strategy adds 30 × $5 × 1.904% = **$2.86/hour**. Element of risk under
perfect play is 0.52622% (§2.3).

Preset ladder (D16): **perfect → basic → simple** for the perfect and practical
lenses. `expert` is the fast stand-in for `perfect` in long simulations. The
rest are teaching and fun presets. `riverLeak` is **lesson-only** (not in the
auto-play picker): it is the old "simple" rule, whose river folds without a
hidden pair.

Canonical definitions (curriculum.md, canonical via decisions.md; the
rule-based presets are **data**, see `RuleStrategyDef` below):
- **hidden** (river) = category(best of 7) ≥ pair **and** category(best of 7) >
  category(the board's 5 cards).
- **dealer outs** (river) = the number of the 45 unseen cards c with
  value(board + c, best 5 of 6) > value(your 7).
- **flop (a)** = category of best5(hole + flop) ≥ two pair **and** > the flop's
  own category. **(b) hidden pair** = a pocket pair other than 22, or a hole card
  matching a flop rank. **(c)** some suit has ≥ 4 cards among hole + flop and a
  hole card of that suit is T or higher.

- **`perfect`** (lowest-edge lens): preflop from the table, flop and river
  by exact enumeration. A flop decision costs ~0.1–0.5 s, which is too slow for
  long simulations, so auto-play offers it only for "Watch" (≤ 30 hands) and Drill.
  Multi-hand runs use `expert`, which costs only 0.0864 percentage points of
  the Ante more (−2.2714% vs −2.1850%).
- **`expert`**: perfect preflop (table) + the basic flop rule + exact river
  (990 showdowns, ~0.1 ms). The default for simulations under the perfect lens.
- **`basic`** (practical lens). Preflop: raise 4x with 33+, any ace, any
  suited king, K5o+, Q6s+, Q8o+, J8s+, JTo, which is **exactly the optimal
  preflop set** (69 classes, §2.4). Otherwise check. Flop: 2x if (a), (b) or (c).
  River: 1x if hidden, or if dealer outs < 21. Otherwise fold.
- **`simple`** (practical, D16). Preflop: 4x with 33+, any ace, any king, Q8+
  (suited or not), JT (suited or not). Flop: 2x if (a) or (b). River: as `basic`.
- **`check-to-river`** (teaching: "the cautious player"): never raise early,
  then play the river perfectly.
- **`never-fold`** (myth demo): check, check, always raise 1x on the river.
- **`always-max`** (fun/maniac): raise 4x on every hand. It has *exactly* the
  same EV as `never-fold`, because averaged over all deals P(win) − P(lose) = 0
  by symmetry, so the Play size doesn't matter on average. Only the swings grow.
- **`riverLeak`** (lesson-only): preflop any pair or any ace; flop (a) or (b)
  with 22 allowed; river 1x only if hidden, otherwise fold.

```ts
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
  flop2x: readonly HandPredicate[];  // any match → raise 2x, else check
  river1x: readonly HandPredicate[] | 'always' | 'perfect';
}
```
`StrategyChart` renders the preflop grid from `preflop4x` (or from the table
for `perfect`), and the flop/river rule lists from the predicates (copy per
predicate in `content/strategy.json`). Drill's practical lens grades against
these predicates. `dealerOuts(hole, board)` costs 45 six-card evaluations.

`StrategySpec` adds `trips: Cents` (0 = no Trips) and `ante: Cents`. For any
spec, `strategyMetrics(spec, rules)` returns the exact edge per Ante, the element
of risk, expected $ per hand and per hour, combining the per-strategy constants
above with the Trips edge.

### 5.2 Types (`strategy/types.ts`, frozen with the contract; payload of the `simulate` job)

```ts
import type { BlindPaytableId, Card, Cents, DecisionAction, DecisionStreet, ForcedDeal,
  TableRules, TripsPaytableId, VisibleView } from '../engine/types';
import type { Fraction, DecisionPreview } from '../math/types';

export type StrategyLens = 'perfect' | 'practical' | 'fun';
export type StrategyId =
  | 'perfect' | 'expert' | 'basic' | 'simple' | 'check-to-river' | 'never-fold' | 'always-max'
  | 'riverLeak';                     // lesson-only
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
export interface DrillSpot {
  code: string;                      // 'f:Ah7c.7dKs2c' (street letter, hole, board)
  street: DecisionStreet;
  hole: readonly [Card, Card];
  board: readonly Card[];
}
export interface DrillFilter {
  street: DecisionStreet | 'mixed';
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
```

`drill.ts`: `nextSpot(rngState, filter) → [DrillSpot, RngState]`,
`spotCode(spot)`, `spotFromCode(code)` (round-trip tested),
`gradeSpot(spot, chosen, preview, lens)`: the perfect lens grades against
`preview.bestIndex`, the practical lens against `basic.decide`, and both report
the exact regret. `interesting` sampling: preflop draws classes near the chart
boundary with double weight; flop/river draw deals and keep or reject on the
cheap `basic` rule margin (no extra enumeration).

### 5.3 Simulation (`simulate.ts`, pure, generator)

`simulateJob(req): Generator<Progress, SimulateResult>`: hand loop with
`applyAction` + `strategy.decide(visibleView(state))`, yielding every 50 hands.
River decisions use the exact 990-showdown count (~0.1 ms). Seeds follow crappy (`seed + i`),
and compare mode replays the **same seeds**, so every strategy sees the same
cards (the RNG stream per hand does not depend on decisions, because the
whole deal is drawn at `deal`). Budget (architecture §4.5): 1,000 hands < 3 s
at 4× throttle. 100 sessions × 300 hands (30,000 hands) < 10 s throttled, with
a progress bar. A Node benchmark test enforces 100 k `expert` hands < 5 s.

### 5.4 Auto-play panel and charts

Inputs: strategy (grouped by lens), ante, Trips, hands (30 / 300 / 3,000 /
custom ≤ 10,000; 30 = one hour, D10), sessions (1 / 100), seed, compare. Output
(hand-rolled SVG, like crappy's BankrollChart): bankroll line(s) against the
dashed exact-expected line; for 100 sessions, a p10–p90 band + median +
expected + survival; an outcome histogram (win/lose/tie/fold and final hand
categories); a summary that labels **exact** vs **simulated** figures (§2.6):
expected loss per hour (exact), actual (simulated), luck, bust rate, P(ahead).
"Watch" plays ≤ 30 hands on the felt at fast speed (and allows `perfect`).

---

## 6. Test plan

Tooling as in architecture.md (Vitest node + dom, Testing Library, Playwright
1.56.1 on `/opt/pw-browsers`, axe). Coverage target: engine + math ≥ 95% lines.

### 6.1 Evaluator (`engine/evaluator.test.ts`)
- **Exhaustive 5-card**: all 2,598,960 hands → the category counts in §1.7 and
  exactly **7,462** distinct values. Also, an independent oracle (`__tests__/oracle.ts`:
  sort ranks, group counts, the textbook rules, no bit tricks; it does **not**
  import `evaluator.ts`) must order the hands identically: sort both and compare
  rank-equivalence classes.
- **Exhaustive 7-card**: all 133,784,560 hands → the category counts and
  exactly **4,824** distinct values. In Node the JS port runs at ~20–50 M/s, so ~3–7 s; tagged
  `slow` but run in CI (it is the core oracle).
- **Random 7-card vs oracle**: 1 M seeded hands; `evaluate7` equals the
  value of the oracle's best of 21 five-card subsets (map through the
  ordering), and `best5` is a valid 5-subset with that value.
- Edge cases: wheel A-2-3-4-5 (straight and straight flush, top = 5), 6-high
  vs wheel, flush beats straight when both exist, two trips → full house,
  three pairs → two pair + best kicker, quads + pair kicker, a board that
  plays, kickers beyond the 5th card ignored.

### 6.2 Engine
- **Settlement oracle**: `__tests__/settleOracle.ts` restates §1.3 in plain
  code (it uses the oracle evaluator, not `wagers.ts`). For 200 k seeded random hands ×
  every decision path (4x, 3x, check-2x, check-check-1x, fold) × 2 Trips
  paytables, `settleHand` equals the oracle wager by wager.
- Golden settlements (§1.5 table) as named tests.
- Validation: one test per `ValidationCode`, plus the warning.
- Flow: a full hand per path, with the event order asserted; play ends the
  hand in one `applyAction`; no dealer cards in events before `dealer-revealed`;
  `ifPlayed` only on folds; **money conservation** (equity before + Σ profits
  = equity after, every hand); `replay` reproduces state; deep-frozen inputs are
  never mutated.
- RNG: golden sequence for seed 42 (frozen on first implementation), the
  `randBelow` rejection bound, a χ² test of card-position uniformity over 520 k
  deals (p > 0.001), forced cards placed exactly and never duplicated, and the
  same seed with and without a forced deal changes only the forced slots' draws.
- `parseCards` round-trips all 52 codes; it rejects bad, duplicate and lowercase-rank codes.

### 6.3 Math
- **Pinned exact values**: Trips edges (§1.3); river examples (−1663/990,
  −467/198, −23/90); flop example (178661/178365, 93143/178365); `GAME_EV` and
  every strategy EV (§5.1); all 169 preflop rows vs Appendix A.
- **Engine ↔ math agreement**: for 200 random rivers, compute the river EV by
  calling `settleHand` on every one of the 990 dealer hands (the engine's money,
  not the math's formula), and compare exactly with `previewJob`. For 3 random
  flops, the same over 1,070,190 cases (slow-tagged), including the max with
  fold. This is crappy's "preview uses the engine's own payouts" rule.
- Linearity: preflop EV(4x) − EV(3x) = P exactly, the same P as the table,
  and 3x is never `best` over all 169 classes.
- Tier boundaries; `bestIndex` tie rule; the `why` rows sum exactly to `ev`;
  `structuredClone` round trip of `DecisionPreview` and `SimulateResult`
  (architecture protocol test).
- **Monte Carlo** (`*.mc.test.ts`, fixed seeds, in CI): (a) per strategy
  (`expert`, `basic`, `simple`, `check-to-river`, `never-fold`, `always-max`), 200 k
  simulated hands' mean net per ante vs the exact EV within 4σ (σ from the
  sample; σ per hand ≈ 2–3 antes, so 4σ/√N ≈ 0.02 ante); (b) Trips mean vs exact per
  paytable; (c) flop preview vs 50 k sampled (runout, dealer) cases.
- Performance (Node): river preview < 2 ms; flop preview < 250 ms (CI box);
  the perf e2e enforces the phone budgets.

### 6.4 Strategy, drill, scenes
- Every strategy's `decide` returns a legal action on 50 k random views;
  `basic` matches a table of hand-written spots (chart edges: 33 raise, 22 check, K5o raise, K4o
  check, Q6s raise, Q5s check, …; flop 4-flush with a hidden T vs 9).
- Sessions are deterministic per seed; compare mode sees identical cards (assert the
  per-hand player cards); busting; the benchmark.
- Drill: `spotFromCode(spotCode(s)) = s`; grading by lens; `interesting`
  share within ±10% of 60% on 2 k spots.
- Scenes: `validateScene` on fixtures + every lesson scene; the runner for
  each `Condition` kind; **`lessons.test.ts` scripts every scene to completion**
  (integration WP, using the in-thread EV client).

### 6.5 Components (`*.test.tsx`, happy-dom)
EvSheet: renders every option with its EV, best marked, the alternative card's
"Use this" switches the selection, `blunder` requires the second tap, "Why?" rows
render with counts, and practice mode hides EVs until confirm. ActionBar shows
the right options per street. Felt: cards hidden or revealed per street, and the
dealer's cards after a fold. Layouts: every interactive element ≥ `minTapUnits`,
no overlaps, the board fits the viewBox. `describeHand` text for the golden
settlements. Animation: `instant` gives an empty timeline; reduced motion.

### 6.6 E2E (Playwright: mobile 390×844 / Pixel 7, phone-landscape 844×390, desktop)
1. `#/play?seed=7&hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant`
   → the sheet shows Raise 2x and Check with EVs and one "Best play" badge; confirm.
2. A sandbox hand from betting: tap the $10 chip, then Ante; the Blind mirrors it;
   Deal; the preflop sheet shows the exact table EVs for that class; Raise 4x; the
   result toast; the bankroll changes by the golden amount.
3. River fold spot → reveal and "You would have…" text.
4. Blunder: a river spot where folding costs > 0.5 ante (e.g. a made
   straight); tap Fold, and a second tap is required.
5. Every `[data-hit]` box ≥ 44×44 in both orientations, no horizontal scroll at
   360 px, and the action buttons are visible in landscape without scrolling.
6. Auto-play: `expert`, 300 hands, 100 sessions: the chart renders, and the expected line
   label says "exact" and the result "simulated".
7. Drill: answer 3 spots, then the streak and the EV sheet.
8. `perf.spec.ts` (4× CPU throttle): the flop preview resolves ≤ 1.5 s (target
   600 ms), river and preflop ≤ 100 ms, no main-thread long task > 50 ms while computing.
9. axe on sandbox, a lesson scene, drill and auto-play: no serious or critical issues.
10. Single-file under `file://`: the flop preview resolves with `mode === 'worker'`.

---

## 7. Implementation chunks (file ownership)

The contract = `engine/types.ts` (§1.2) + `math/types.ts` (§2.2) +
`strategy/types.ts` (§5.2) + `scene/types.ts` (§4.1), copied verbatim by WP0
and frozen (architecture §8). `worker/protocol.ts` (architecture §4.2) uses
`PreviewRequest/DecisionPreview` and `SimulateRequest/SimulateResult`.

| Chunk (= architecture WP) | Owns | Depends on | Delivers |
|---|---|---|---|
| **A: engine** | `src/sim/engine/**` incl. `__tests__/{oracle,settleOracle}.ts` | WP0 | cards, rng, deck, **evaluator** (+ exhaustive tests), paytables, rules, wagers/settle, validate, game, money. **Push the evaluator and `evalMasks` first** (math and strategy need them). |
| **B: math + worker** | `src/sim/math/**`, `src/sim/worker/{jobs,runner,ev.worker,transport-*,client}.ts`, `tests/gen/**` | A (evaluator early, then settle for the agreement tests) | river/flop enumeration, preflop table + generator + verify, preview job, tiers, explain, edges, MC tests |
| **C: table-ui** | `src/sim/ui/**` except `Simulator.tsx`, `StepPanel.tsx`, `persist.ts`, `settings.ts`, `AutoPlayPanel.tsx`, `BankrollChart.tsx`, `OutcomeHistogram.tsx` | contract types; real engine + in-thread client for the gallery | felt layouts, cards, chips, circles, ActionBar, EvSheet, WhyTable, TierBadge, StrategyChart, animation, text, screenshots |
| **D: strategy** | `src/sim/strategy/**`, `src/sim/ui/{AutoPlayPanel,BankrollChart,OutcomeHistogram}.tsx` | A, B (`preview` for `perfect`; preflop table) | presets + exact constants, metrics, simulate job, drill.ts, chart data for StrategyChart, benchmark |
| **E: integration** | `src/sim/scene/**`, `src/sim/ui/{Simulator,StepPanel,persist,settings}.tsx/ts`, `tests/e2e/**` (except infra's) | all | scene runner + strict validate, container wiring engine + EvClient + UI + scenes, speculative preview on deal, session panel (luck / mistake cost), URL params, every-scene-completes test, e2e + perf + axe |

Order: A starts; B, C, D start against the contract (B and D merge A's branch
as soon as the evaluator lands); E integrates last. B kicks off the table
generator **early** (several hours in JS). Until it lands, the `tables/` stub can
carry the C-generated Appendix A data (same sums; derive `wq/wnq/lq/lnq/bb2`
columns later), so math and UI are never blocked.

---

## 8. Conflicts with architecture.md and other notes for decisions.md

| # | Topic | architecture.md | This doc | Proposal |
|---|---|---|---|---|
| 1 | Preview latency | flop < 1.5 s at 4× | target 600 ms, hard 1.5 s | Keep 1.5 s as the CI fail line, report the measured figure in perf output |
| 2 | Strategy chart lens ids | `?lens=perfect\|practical\|fun` | `StrategyLens` = same | aligned |
| 3 | Preflop options | "Raise 4x / 3x / Check" | same; 3x shown, never best | aligned |
| 4 | Table size budget | ≤ 150 kB | ~11 kB (one Blind preset) | aligned |
| 5 | Generator runtime | "recompute all if < 30 s" | full recompute is hours; CI verifies against pinned Appendix A + MC + sampled flops | accept |
| 6 | Settings.paytable | `string` preset id | `PaytablePresetId = TripsPaytableId` | narrow the type |
| 7 | `confirmCostlyMoves` | "red tier needs a second tap" | red = `blunder` (> 0.5 ante) | aligned |
| 8 | Drill grading "cost in $/hour" | yes | regret × ante × handsPerHour | aligned |

Assumptions (no user input needed): single seat (no other players' cards
removed); dealer qualifies with a pair or better (D9); ties at a decision go to
the option with the **smaller total wager** (check over raise, fold over a 1x raise, matching curriculum.md); Trips stays in action on a fold; the Blind/Ante are
always equal; the bankroll can't go negative (a Play you can't afford is
rejected, the `cant-afford-max-raise` warning at deal). Chips for
`docs/chips.md`: progressive partial-enumeration estimates during a flop
computation; 6-Card Bonus / Progressive simulation; multi-seat card removal;
a flop decision table for exact `perfect` long simulations; sound.

---

## Appendix A: Pinned exact values (independent C enumeration, `strat.c`)

Per class: `SA`, `SP` = Σ over 2,118,760 boards of A2 = W·b2 + 2Wq − 2L − 2Lq and
P2 = 2(W − L), summed over the 990 dealer hands (half-antes). Raise EV(k) =
(SA + k·SP) / 4,195,144,800. `SC` = Σ over 19,600 flops of max(2x-sum, check-sum),
each sum over 1,081 runouts (half-antes, river played perfectly): Check EV = SC /
41,951,448,000. Class representatives: pairs `h♠h♥`, suited `h♠l♠`, offsuit
`h♠l♥` (any representative gives the same values). Weights 6/4/12.
Example: AA Raise 4x = (3292247168 + 4·2953693496)/4195144800 ≈ +3.60107;
Check = 91996341600/41951448000 ≈ +2.19292.

Totals: perfect-play EV per hand = **−50643648973/2317817502000** (house edge
2.18497% of the Ante); E[wager] = 29163830173/7023689400 with the canonical tie rule (the C run, which
broke ties toward raising, got 29164125301/7023689400); element of risk 50643648973/9624063957090 ≈ 0.52622%. The optimal 4x set is 69 classes: 33+,
any ace, any suited king, K5o+, Q6s+, Q8o+, J8s+, JTo. Raise 3x is never best.

```text
class SA SP SC
AA 3292247168 2953693496 91996341600
AKs 1236543348 1430094012 41395181436
AKo -225246728 1285398390 23867340470
AQs 1157841758 1359970496 39253580022
AQo -310181149 1210873118 21580168004
AJs 1082735233 1291490348 37169842100
AJo -391381092 1137996618 19350563120
ATs 1011538326 1225182540 35150433174
ATo -468436979 1067383666 17184870184
A9s -289185016 1072380862 19223828116
A9o -814399754 903869654 10590731578
A8s -363361052 1002120302 17184114590
A8o -899834409 828340158 8367974458
A7s -466859834 921585932 14764853762
A7o -1012284819 741801900 5839565700
A6s -600709834 831127660 11985499660
A6o -1152965583 644579996 2974775750
A5s -434689884 832562196 13833371184
A5o -1078915609 645761522 3924828112
A4s -556219019 757948220 11499101666
A4o -1212308939 564639442 1415094700
A3s -675048272 689708704 9286868922
A3o -1342955383 490379062 -973520166
A2s -798994314 619110900 6985650942
A2o -1479018288 413520346 -3453754058
KK 2926972508 2718091352 83631552120
KQs 1009301709 1124332644 34249488468
KQo -560146213 961174800 15542608616
KJs 931796888 1054436232 32201390084
KJo -643970232 886743292 13367785978
KTs 861617641 989094170 30259458596
KTo -720007565 817123184 11300311870
K9s -438423714 838062022 14462783066
K9o -1065271220 655443102 4875919114
K8s -769292641 697430232 8771442434
K8o -1322959679 505109912 -165862226
K7s -835338164 632438006 7013100518
K7o -1399641897 435233702 -2073963586
K6s -931783418 557176942 4886498454
K6o -1504532737 354345334 -4320575652
K5s -1024811371 486042566 2963375580
K5o -1605481753 278051918 -6338851274
K4s -1148440521 409835154 793596462
K4o -1741024559 195281650 -8642599204
K3s -1268602181 340224268 -1266707718
K3o -1872994759 119619490 -10836754686
K2s -1390459562 269473308 -3352748816
K2o -2006958780 42683398 -13059306274
QQ 2620435958 2510807928 76420518140
QJs 853376200 860777022 29097443494
QJo -818448195 682524022 9409591174
QTs 781094061 794355644 27185500732
QTo -896786084 611717774 7379093010
Q9s -519975873 643058788 11498611268
Q9o -1243145737 449756014 1098558648
Q8s -849462793 504905224 5881562374
Q8o -1499394700 302032980 -3883147166
Q7s -1180536269 360972342 329312920
Q7o -1757174470 148144486 -8784128432
Q6s -1237899780 303104786 -1179683866
Q6o -1824550038 85920954 -10434583560
Q5s -1330847330 232361594 -3124126762
Q5o -1925377116 10075294 -12481585656
Q4s -1455178006 155665214 -5220828630
Q4o -2061619378 -73189830 -14697415150
Q3s -1576115172 85517732 -7220471228
Q3o -2194363032 -149394474 -16817681508
Q2s -1698822039 14182548 -9247776354
Q2o -2329174505 -226920678 -18971212496
JJ 2316479340 2304768328 69260159960
JTs 740914841 631609012 25250766614
JTo -1031135105 440297486 4626693970
J9s -567019121 475097678 9573159894
J9o -1384799780 272784834 -1617159112
J8s -897196773 336924176 4040670744
J8o -1641804935 125028992 -6500124906
J7s -1227457618 195055874 -1445022218
J7o -1898749271 -26686692 -11319724086
J6s -1557244676 50837364 -6865115638
J6o -2155050783 -180871734 -16062993252
J5s -1609907903 -1103364 -8141175346
J5o -2217078997 -236531642 -17445699870
J4s -1734663049 -77991652 -10174318070
J4o -2353726595 -319973382 -19592291932
J3s -1856088459 -148371866 -12128010930
J3o -2486939377 -396395466 -21676803010
J2s -1979347344 -219980606 -14104927008
J2o -2622283770 -474179934 -23795536360
TT 2013084962 2098560772 62102065060
T9s -574874222 337921318 8620381468
T9o -1485247009 128511750 -3333459924
T8s -910417776 195860464 3163609890
T8o -1747971286 -23385946 -8115990078
T7s -1241854798 53617100 -2241669818
T7o -2006192014 -175513488 -12830660034
T6s -1571111555 -88880378 -7591552862
T6o -2261954738 -327892242 -17482380262
T5s -1902755735 -233563934 -12921196718
T5o -2519841032 -482361982 -22119270354
T4s -1986732746 -291101634 -14237664802
T4o -2617156018 -545024150 -23562105648
T3s -2108359138 -361410716 -16119849940
T3o -2750533602 -621338630 -25591032770
T2s -2231872573 -432982344 -18032467794
T2o -2886096383 -699049514 -27665058938
99 1543533260 1850667316 52451126976
98s -983912439 67185696 2142409872
98o -1917709673 -159664462 -9905184234
97s -1312541219 -74024916 -3007292192
97o -2173158221 -310624764 -14345524268
96s -1641505909 -215773852 -8247022414
96o -2428618013 -462192086 -18879515868
95s -1972666063 -358947114 -13570749326
95o -2686007957 -615080148 -23514760782
94s -2341670668 -514998424 -18981834814
94o -2985555243 -782725626 -28303711136
93s -2421781891 -565148278 -20241612454
93o -3078821391 -837391650 -29729554728
92s -2545277788 -636389046 -22146286274
92o -3214314452 -914714718 -31808048240
88 1168005706 1607834172 43846703108
87s -1298784529 -173147030 -2213091034
87o -2252543468 -415251184 -14271738582
86s -1626358139 -315200588 -7340535848
86o -2506752078 -567107908 -18721433756
85s -1957462204 -457690910 -12616491778
85o -2764096194 -719255396 -23332048096
84s -2325873895 -612354606 -18019188360
84o -3063007516 -885444758 -28128782602
83s -2696036455 -765739436 -23399594872
83o -3363805464 -1050144370 -32927884822
82s -2777450177 -816238044 -24697313566
82o -3458594313 -1105196290 -34402734254
77 788965894 1362249332 35180885400
76s -1577650262 -388322182 -5913558608
76o -2549349056 -644143770 -18077829088
75s -1907195226 -530640792 -11082113248
75o -2805269036 -796073290 -22595700212
74s -2274089021 -683866338 -16449333342
74o -3102540330 -960702604 -27360888974
73s -2643727319 -836013836 -21851653024
73o -3402775364 -1124109438 -32177869228
72s -3019510031 -993754838 -27283223152
72o -3709643257 -1293476636 -37035010306
66 407320182 1114628848 26536744772
65s -1825769888 -576128782 -9518292442
65o -2813430372 -843702158 -21838755352
64s -2186731395 -727159632 -14760563622
64o -3104574076 -1005954758 -26477499266
63s -2554803505 -878164632 -20129245984
63o -3403119626 -1168127082 -31260302640
62s -2929985401 -1034609622 -25576667770
62o -3709347259 -1336142012 -36135444492
55 23701354 866290732 18034269680
54s -2024222967 -717082782 -12542804476
54o -3030463718 -993805716 -25074568744
53s -2385221919 -864790304 -17773008152
53o -3321666250 -1152425480 -29715736998
52s -2757981353 -1019476570 -23173909814
52o -3625312119 -1318563754 -34539630900
44 -420589246 589235036 8835731508
43s -2530557237 -952973424 -19828710852
43o -3476085670 -1246302562 -31885229294
42s -2898081199 -1105083808 -25131464784
42o -3774256545 -1409589618 -36605163904
33 -868355242 309859804 312715672
32s -3027048923 -1175946862 -27237751800
32o -3911446735 -1484810410 -38840219796
22 -1319789304 28025168 -7529380304
```

