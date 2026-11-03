# holdumb design decisions

**This file is authoritative.** Where it disagrees with `curriculum.md`, `simulator.md` or
`architecture.md`, this file wins. Those three docs are the design spikes; this file records the
user's answers, the orchestrator's calls, and how conflicts between the spikes were resolved.

All fractions are exact and were verified by two independent exhaustive solvers (the curriculum
spike's and the simulator spike's `strat.c`/`strat2.c`), plus orchestrator spot checks with Python
`fractions`.

## 1. User answers

| # | Topic | Decision |
|---|---|---|
| D1 | First way to view | A Claude Artifact of the single-file build as soon as the sandbox plays, then GitHub Pages. |
| D2 | Offline file vs EV speed | Keep the single file small (target ≤ 600 kB, hard fail 800 kB). Exact decision EV computed on device, in a Web Worker, ≤ ~1 s per decision. |
| D3 | Orientation | Portrait first, plus a landscape layout that keeps Deal / Check / Bet visible at 844×390. |
| D4 | Tab bar | **Learn · Play · Drill · More.** Drill is a quick-fire decision trainer (`#/drill`). There is no Strategy tab: the strategy chart (`#/strategy`) is the top card in Learn, the first item in More, and linked from every Drill answer. |
| D5 | Side bets | Simulate **Trips only**. Six Card Bonus, Progressive and Bad Beat are explained in lessons with their edges, not simulated. **Amended by D5a: Six Card Bonus is also simulated, as an optional sandbox side bet.** |
| D6 | Paytables | Blind 500/50/10/3/3:2/1 (Royal / SF / Quads / Full house / Flush / Straight; less pushes). Trips default **50/40/30/8/6/5/3**, with a variants menu in Settings. |
| D7 | Fold | After a fold the dealer's cards are revealed, with "you would have won / lost / pushed". |
| D8 | Poker basics | One short hand-rankings refresher lesson plus an always-available hand-ranking card (More → Hand rankings, and a link from the table). No from-zero hand-ranking course. |
| D14 | Merging | The orchestrator merges PRs (merge commit) after an Opus review and green CI on the latest head. The repo is public; Pages source must be set to GitHub Actions by the user. |

### D5a Six Card Bonus is simulated (I062)
D5a (2026-11-03, human-approved idea I062). Amends D5; Progressive and Bad Beat stay lesson-only.
- **Where:** an optional side bet in the Play sandbox (a panel under the table), off by default, not in scenes. It never sits on the felt and adds no ActionBar button.
- **Cards:** best five of six: your two hole cards plus **four bonus cards** dealt to a separate area (the New Jersey layout, lesson 20's source). They come from the 43 cards the main deal left unseen, through their own seeded stream (game seed + hand number), so the game's RNG stream and every seeded replay are unchanged. As curriculum.md's sources note says, the edge does not depend on which four unseen cards are used.
- **Paytables:** `six-card-1000-200-100` (default; 1000/200/100/20/15/10/7) and `six-card-1000-200-50` (1000/200/50/20/15/10/5), "to 1". Exact edges from the 6-card counts over C(52,6) = 20,358,520 (royal 188, SF 1,656, quads 14,664, FH 165,984, flush 205,792, straight 361,620, trips 732,160): **12816/149695 (8.5614%, Poor bet)** and **70366/363545 (19.3555%, Sucker bet)**. `math/sixcardEdge.ts sixCardEdge`; re-derived by an independent exhaustive count in `engine/sixcard.test.ts`.
- **Limits:** whole dollars, $1–$25 (offered: $1, $5, $10, $25).
- **Settlement:** at the deal, because the bet does not depend on play, so no money is pending mid-hand and a snapshot is always whole. The bet is taken only if the rack still covers a 4x Play afterwards; otherwise that hand's Six Card is skipped and says so.
- **Contracts:** the engine's frozen `WagerId` and types are unchanged. The bet lives in the SimDriver (`setSixCard`), and the profit goes straight into the bankroll, so equity (D38) is right. The session ledger adds `sixCardCents`, `sixCardWageredCents` and `sixCardExpectedCents` (−edge × wager, exact). "Perfect play expects" includes it, so luck still adds up to the cent. "Total wagered" includes it too. The setting is not persisted: it is off again after a reload.
- **Auto-play:** with the bet on, auto-play settles it at every deal through the same rule (`engine/sixcard.ts applySixCard`), so a seeded run matches the same hands at the table to the cent. `SimulateRequest.sixCard` and `SessionSeries.sixCard` carry it: two optional fields, an approved frozen-contract change.

## 2. Orchestrator calls

| # | Topic | Decision |
|---|---|---|
| D6a | Trips default | The curriculum spike's question labelled 9/7/4 as "standard", but its edge is only 0.902%. The user chose "standard", so the default is the real standard table, 8/6/5. |
| D6b | Trips variants | `trips-9-7-4` 301629/33446140 (0.902%), **`trips-8-6-5` 48987/2572780 (1.904%, default)**, `trips-8-7-4` 233985/6689228 (3.498%), `trips-7-6-5` 115779/2572780 (4.500%), `trips-8-6-4` 545459/8361535 (6.523%). Pays 50/40/30 for Royal / SF / Quads and 3 for trips in every variant. |
| D9 | Dealer qualify | The dealer needs a pair or better. If not, the Ante pushes. Standard rules only, no toggle. |
| D10 | Hands per hour | 30, for every cost-per-hour figure. |
| D11 | EV visibility | `evMode`: EV visibility `before` / `after` / `never`, default `before` (replaces the practice toggle; see D39). Drill always grades after the answer. |
| D12 | Blind presets | One Blind preset (`blind-standard`). No sourced cheaper table exists. Ship one preflop table, but keep the generator and types parameterised by the Blind paytable so a preset can be added later (chip). Blind variants are not in the v1 settings UI. |
| D13 | Wire format | `Fraction = { num, den }` (bigint) as in `architecture.md`'s `protocol.ts`. |
| D15 | Practical lens | The practical strategies are `basic` and `simple` (D16). The simulator draft's old `simple` is renamed **`river-leak`**, is lesson-only, and is never offered as a practical preset. |
| D16 | `simple` | Preflop 4x with 33+, any A, any K, Q8+ (suited or not), JT; otherwise check. Flop 2x with two pair or better (rule a) or a hidden pair (rule b); otherwise check. River as `basic`. |
| D17 | Primary metric | **House edge per Ante.** The EV sheet shows each option's whole-hand EV in antes and dollars plus its cost against the best option. Element of risk is secondary, taught in `edge-vs-risk`. |
| D18 | How EV is computed | River: exact on device (990 dealer hands). Flop: exact in the Web Worker (1,070,190 showdowns), started as soon as the flop is dealt. Preflop: a precomputed exact table of 169 classes (~11 kB). Monte Carlo only for multi-hand simulation, always labelled "≈ … simulated". Long auto-play runs use `expert` as the fast stand-in for `perfect`. |
| D19 | Ids | See §4. The scene schema is owned by `simulator.md`. |
| D20 | Rule definitions | See §3. |
| D21 | Cross-check | Two independent exhaustive solvers plus the Opus design reviewer's own solver agree on every number in §4. |
| D22 | Table regeneration in CI | `simulator.md` wins over `architecture.md` §8: generating the preflop table takes hours, so CI does **not** regenerate it. CI checks the shipped table against the pinned values (simulator.md Appendix A) plus Monte Carlo and sampled exact checks. |
| D23 | Settings paytable | `Settings.paytable` is a typed preset id (simulator.md), not a free-form object. |
| D24 | Tiers | Decision tiers on regret r (antes): `best` r = 0 (ties within 1e-9 both `best`), `close` ≤ 0.02, `small` ≤ 0.10, `costly` ≤ 0.50 (alternative card), `blunder` > 0.50 (red). `confirmOn` (default `never`): `all` | `costly`+`blunder` | `blunder` | `never`; the confirm step shows that option's EV and the best alternative (D39). Wager tiers for Trips use crappy's thresholds: `free` ≤ 0, `good` ≤ 2%, `fair` ≤ 5%, `poor` < 9%, `avoid` ≥ 9%. A text label always accompanies the colour. |

## 3. Canonical strategy definitions

- **Hidden** (river): category(best 5 of your 7) ≥ pair **and** > category(the board's 5).
- **Dealer outs** (river): the number of the 45 unseen cards c with value(best 5 of board + c) >
  value(your 7).
- **Basic river:** 1x if hidden or dealer outs < 21; otherwise fold.
- **Basic flop:** 2x if (a) category(best5 of hole + flop) ≥ two pair and > the flop's own category;
  or (b) a hidden pair: a pocket pair other than 22, or a hole card matching a flop rank; or (c) some
  suit has ≥ 4 cards among hole + flop and a hole card of that suit is T or higher. Otherwise check.
- **Basic preflop** = the classic chart = perfect preflop: 4x with 33+, any A, any suited K, K5o+,
  Q6s+, Q8o+, J8s+, JTo (69 of 169 classes). 3x is never best.
- **Exact ties** between options: prefer the smaller wager (check / fold). This only affects
  E[total wager], not EV.

## 4. Canonical numbers (per Ante; standard Blind; Trips excluded)

| Strategy | Exact EV | House edge | Cost vs perfect at $10 × 30/h |
|---|---|---|---|
| `perfect` | −50643648973/2317817502000 | 2.18497% | — |
| `expert` (perfect preflop, basic flop, exact river) | −106357031/4682459600 | 2.27140% | $0.26/h |
| `basic` | −54758439/2299422125 | 2.38140% | $0.59/h |
| `simple` | −47068162901/1738363126500 | 2.70761% | $1.57/h |
| `river-leak` (lesson only) | −6205519211/38630291700 | 16.06387% | $41.64/h |
| `check-to-river` | −111371309107/347672625300 | 32.0334% | — |
| `never-fold` = `always-max` | −6432686411/15803301150 | 40.7047% | — |

- Perfect play: E[total wager] = 29163830173/7023689400 ≈ 4.15221 antes; element of risk
  50643648973/9624063957090 ≈ 0.52622%; SD ≈ 4.94 antes.
- Dealer qualifies 789215/955604 ≈ 82.588%.
- 7-card category counts (of 133,784,560): royal 4,324; straight flush 37,260; quads 224,848;
  full house 3,473,184; flush 4,047,644; straight 6,180,020; trips 6,461,620.

**Lesson ids (23):** `welcome`, `hand-rankings`, `a-full-hand`, `settling-bets`, `expected-value`,
`reading-the-ev-sheet`, `preflop-raise`, `preflop-close-calls`, `flop-raise`, `flop-tricky-boards`,
`river-call-or-fold`, `counting-dealer-outs`, `strategy-lowest-edge`, `checkpoint-strategy`,
`edge-vs-risk`, `strategy-practical`, `variance-and-bankroll`, `costly-habits`, `trips-bet`,
`other-side-bets`, `strategy-fun-per-dollar`, `at-the-casino`, `final-exam`.

**Chapter ids:** `foundations`, `ev-basics`, `perfect-lowest-edge`, `perfect-practical`,
`perfect-fun`, `real-casino`.

## 5. Design-review resolutions (Opus review of 1744b01)

The math was independently re-solved and matches. These items fix contracts and scenes. Content and
implementation agents follow these over the spike docs.

### D25 Scene mapping (content authors write simulator `SceneConfig` only)
The scene YAML in curriculum.md §1.2 is superseded by simulator.md §4.1. Mapping:
- `table.{bankroll,ante,trips}` → `bankroll`, `bets.{ante,trips}`; `tripsPaytable` → `rules.trips`
- `say` → `text`; `showEv` → `showEV`
- `allowed` → `allowedActions` + `allowedOptions` (`all` = omit; `[]` = `[]`)
- `{action: play-4}` → `{action:{type: play, option: play-4}}`; `{action: deal}` → `{action:{type: deal}}`
- `{next:true}` → `{acknowledged:true}` + `advance: button`
- `{handsPlayed:n}` → `{hands:n}`; `{autoPlayDone:true}` → `{autoPlayCompleted:{}}`
- `{tap: ev-sheet}` → `{previewed:{option:…}}`
- `startAt: preflop` (string) is invalid: use `startAt:{street, deal}` or a step `deals`.
- `autoPlay.{hands,strategy,speed,compare,sessions,chart}` → `autoPlay.{handOptions:[n], defaultStrategy:{id,ante,trips}, compare: StrategySpec[]}` and `ui.speed`. Compare entries use `id:`.
- Scene ids stay `lNN-sN`. YAML lists of ranks/classes are quoted strings (`highlight: ["33", …]`).

### D26 Tap conditions
Add `Condition {tapped: CircleId | 'session'}` and `SceneInput {kind:'tapped'; target}`. The container emits it on circle or session-panel taps even when `set-bet` is gated. Add `ui.showSession?: boolean`.

### D27 Best-decision steps
`best:true` → `expect:[{type:…, best:true}]` + `completeWhen:{bestDecisions:{count:1, street:<street taught>}}`. A non-best action is rejected with the step's hint; there is no "Try again" replay. Each hand's forced deal goes on the step that deals it (step `deals`), not a scene-level queue. Deal is locked (no `deal` in `allowedActions`) while a step waits for a decision.

### D27a No dead ends
Every reachable street must have at least one allowed option. `validateScene` enforces this ("every reachable street has ≥1 allowed option") and the build fails otherwise. Scenes l05-s1, l06-s1, l06-s2 and l09-s1 must allow `play-2, play-1, fold` (or use D27 gating).

### D28 Frozen type files
WP0 copies all four type files verbatim (engine `types.ts`, `math/types.ts`, `strategy/types.ts`, `scene/types.ts`) plus `protocol.ts`, with imports fixed so they lint and compile: import `Rank` in strategy/types and `Action` in scene/types; drop the unused `HandCategory` (math), `ForcedDeal`, `BlindPaytableId`, `TripsPaytableId` (strategy) imports. All become batons.

### D29 File ownership
simulator.md §7 wins over architecture.md §9: `ui/{AutoPlayPanel,BankrollChart,OutcomeHistogram}` → strategy; `ui/{Simulator,StepPanel,persist,settings}` → integration. Content split by lesson: content-a lessons 1–6 + `content/*.json`; content-b lessons 7–14; content-c lessons 15–23.

### D30 Settings
`paytable: PaytablePresetId` (default `trips-8-6-5`), `evMode: 'before' | 'after' | 'never'` (default `before`, D11), `confirmOn: 'all' | 'costly' | 'blunder' | 'never'` (default `never`, D24). These replace `practice`, `confirmCostlyMoves` and `skipPreview` (D39). The ante field is `anteUnitCents` everywhere.

### D31 Button labels
`Bet 4x · Bet 3x · Check · Bet 2x · Bet 1x · Fold` in the simulator (`DecisionOption.label`), Drill, lessons and architecture.md. Never "Raise". On the table and in Drill the buttons sit in three fixed slots (I012, 2026-11-03): the passive action (Check, or Fold on the river) is always on the left (the bottom row of the landscape rail), and the bets follow by size with the largest on the right (top); a single bet spans two slots, and Clear / Change bets and Deal / Rebet & Deal use the same slots. The label order above stays the order in prose and lists.

### D32 Auto-play and bust
100-session runs draw a p10–p90 band plus a survival curve, not individual lines, and a "Trips hits" summary rather than per-hand markers. `stopAtBust`: bust when equity < 6×ante + trips. `autoPlayCompleted` fires when the run ends, busts included. `minHands` = requested hands per session.

### D33 Drill
`DrillSpot` and `DrillFilter` carry `category: DrillCategoryId` (the 18 categories in curriculum.md §9.1). Flop spots only come from chart-check hands. A Drill answer is correct iff its tier ∈ {`best`, `close`}.

### D34 Performance lines
The phone target is ~1 s per flop decision. The CI hard-fail is 1.5 s at 4× CPU throttle (architecture.md §4.5).

### D35 Content corrections (curriculum.md; the curriculum spike applies them)
- S4: l07-s1 and l23-s1 set `practice: true` (EV hidden until you confirm).
- S5: l17-s2 / l21-s1 copy refers to the survival curve, bust rate and "Trips hits" summary (D32).
- S7: the "pair-only river" and "check to river, hidden pair only" figures are recomputed with §3's "hidden" and the prose is updated.
- S8: lesson 15 says "every per-hour figure on the EV sheet, Drill and auto-play".
- S9: lesson 21: "below ≈$160,500 it loses money; below ≈$46,500 it loses a third or more"; "about twice the standard cost"; $19.99.
- S10: lesson 20 says the progressive's awards are "for 1" with the $1 kept.
- Nits: §4 count is 21 lessons + 1 checkpoint (14) + exam (23); EV sheet starts at lesson 5; $6.55/h; preflop table ≈ 11 kB; `riverLeak` → `river-leak`; Trips wager tier `poor` label is "Poor bet"; lesson 12's "1 in 90" is labelled "≈ sampled"; inline `{{cards}}` render in quiz text, options and explanations; lesson 21 rec. 5 says "the count".

### D36 Settled lesson-only figure
"Check to the river, bet 1x only with a hidden pair" = **−69584314001/139069050120 (50.0358%)**, computed exactly by the strategy work package with the app's own evaluator over every deal; the same enumerator reproduces never-fold and check-to-river exactly. The design reviewer's figure was right; the curriculum spike's 50.0392% was not. Lesson prose ("50.04%") is unchanged. Pin this fraction.

### D37 WP0 contract placements
`Progress` and `Job` live in `src/sim/engine/job.ts` (re-exported by `worker/protocol.ts`) so math can use them without importing the worker. `EvClient` is declared in `worker/protocol.ts`. `CircleId` is defined in `src/sim/scene/types.ts`; table-ui imports it rather than redefining it. `@playwright/test` and `playwright-core` are pinned to 1.56.1 via `overrides`.

### D38 Engine money model and evaluator API
- In `settled`, `GameState.bets` is the **next hand's intent**; those chips are still counted in `bankroll` until `deal` re-bets them. `equity()` is the invariant total.
- The UI shows `equity()`, and scene bankroll conditions test equity. When a runner rebuilds a game it must pass `equity(prev)` as `bankroll` (bets are taken out of it).
- `evaluate7` returns `EvaluatedHand`; `handValueOf` / `evalMasks` are the hot paths returning a packed `HandValue`.
- Mid-hand starts in a running game use `startHand(state, startAt)`; `createGame` calls it. It re-bets like `deal`, keeps stats and the RNG stream, and records no fake earlier decisions.

### D39 EV visibility and confirm policy
D39 (2026-11-03, human-approved user feedback). Links D11, D24 and D30.
- One tap acts by default: there is no confirm step unless `confirmOn` asks for one.
- `evMode` (D11): `before` shows each option's EV before you choose; `after` hides it until you have acted, then shows the comparison; `never` shows none. Default `before`.
- `confirmOn` (D24): `all` (every bet), `costly` ("Medium and bad bets": tiers `costly` + `blunder`, regret > 0.10 Ante), `blunder` ("Only bad bets", regret > 0.50 Ante), `never`. Default `never`. The tier thresholds are unchanged. Confirm options apply when EV is shown before the move (`evMode: 'before'`). Until one-tap acting lands (I013) the sheet opens on every tap, and `confirmOn` sets which tiers need a second tap there (I012): `all` every move ("Yes, Bet 2x"), `costly` Mistakes and Big mistakes ("Do it anyway" with a warning), `blunder` Big mistakes only, `never` none.
- Migration (`sanitizeSettings`): stored `practice: true` → `evMode: 'after'`, otherwise `before`. Every old record → `confirmOn: 'never'` (stored records can't tell an explicit `confirmCostlyMoves` from its old default). `skipPreview` is dropped. A valid `evMode` / `confirmOn` wins over the legacy keys. A sandbox snapshot's `practice` flag maps onto `evMode` the same way.
- Settings shows two radio groups (Show EV; Ask me to confirm). Scene `practice` / `showEV` keys keep working and map onto these modes.
- Lessons (I004): in a lesson the scene decides; the user's `evMode` / `confirmOn` apply only in the sandbox (`mode: 'sandbox'`). Scene and step keys `evMode?` (default `before`) and `confirmOn?` (default `never`); a step key overrides the scene. Legacy keys parse as aliases: `practice: true` == `evMode: 'after'`, `showEV: false` == `evMode: 'never'` (a step `showEV` works as before); setting `evMode` next to its alias is an error. A step whose `completeWhen` uses `previewed` needs an effective `confirmOn: 'all'`, because the confirm sheet is how a learner previews. Best-decision steps need an effective `evMode` other than `never`. Lessons 07 and 23 use `evMode: after` (was `practice: true`, D35 S4); lesson 06's compare and look steps set `confirmOn: all`.

### D40 EV visibility and confirm: one tap acts, in-play controls
D40 (2026-11-03, from the human's report on the live site). Links D11, D24, D30, D39.
- **One tap acts.** A decision button acts at once unless the effective confirm policy covers
  that option's tier; then the EV sheet opens as the confirm step with "Confirm <label>", or a
  warning and "Do it anyway" for Mistake / Big mistake, and Cancel. A sheet's Confirm always
  acts; there is no "tap again" step. D39's interim rule ("until one-tap acting lands the sheet
  opens on every tap") is retired.
- **Confirm does not depend on Show EV.** With `evMode: 'never'` the confirm sheet shows no EV
  (title, "Confirm this move." or the tier warning naming the better play, no numbers). With
  `'after'` the sheet hides EV until the move is made and then shows the reveal in place.
- **After the move:** `after` opens the reveal sheet (result card, full sheet, Continue);
  `before` shows the narration toast (I080); `never` shows nothing.
- **Details.** With EV shown before the move, the status bar's third column reads "EV / Details"
  on decision streets and opens the sheet on the best option without acting; its Confirm acts.
  Available in lessons too.
- **Settings.** Show EV: Before I choose / After I choose / Off (`evMode`). Confirm bets: a
  checkbox "Confirm my bets" plus "Which bets" (All bets / Medium and bad bets / Only bad bets).
  Storage keeps `confirmOn` as the effective policy (D30; `'never'` = unticked) and adds
  `confirmTiers: 'all' | 'costly' | 'blunder'` (default `'all'`), the scope the box turns on;
  `sanitizeSettings` keeps `confirmTiers === confirmOn` whenever `confirmOn !== 'never'`. Tick →
  `confirmOn = confirmTiers`; untick → `'never'`; a scope radio writes both.
- **Quick controls on the Play table** (sandbox only, `scene.ui.showSettings`): the same two
  settings as a 44 px row — an "EV" segmented radio group (Before / After / Off) and a "Confirm"
  checkbox — between the top bar and the status bar in portrait, under the status bar in the
  landscape rail. They write the persisted settings through the app store; there is no session
  override. The practice checkbox is removed ("practice" is `evMode: 'after'`). Lessons never
  show the row; Drill is unaffected (grades after the answer, no confirm).
- **Layout cost.** The row costs the portrait felt 52 px: drawn felt width ≥ 270 px at 360x740
  (was ≥ 300 under I029), ≥ 300 px at 390x844. ActionBar slots and Deal never move (I012).
- I013 is superseded by this entry; I014 is subsumed.
