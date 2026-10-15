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
| Strategies | `perfect`, `expert`, `basic`, `simple`, `check-to-river`, `never-fold`, `always-max`, each with an **exact** EV per hand and a Trips amount. Multi-session sims with charts. |

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

@@MATH@@
