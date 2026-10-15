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
| D5 | Side bets | Simulate **Trips only**. Six Card Bonus, Progressive and Bad Beat are explained in lessons with their edges, not simulated. |
| D6 | Paytables | Blind 500/50/10/3/3:2/1 (Royal / SF / Quads / Full house / Flush / Straight; less pushes). Trips default **50/40/30/8/6/5/3**, with a variants menu in Settings. |
| D7 | Fold | After a fold the dealer's cards are revealed, with "you would have won / lost / pushed". |
| D8 | Poker basics | One short hand-rankings refresher lesson plus an always-available hand-ranking card (More → Hand rankings, and a link from the table). No from-zero hand-ranking course. |
| D14 | Merging | The orchestrator merges PRs (merge commit) after an Opus review and green CI on the latest head. The repo is public; Pages source must be set to GitHub Actions by the user. |

## 2. Orchestrator calls

| # | Topic | Decision |
|---|---|---|
| D6a | Trips default | The curriculum spike's question labelled 9/7/4 as "standard", but its edge is only 0.902%. The user chose "standard", so the default is the real standard table, 8/6/5. |
| D6b | Trips variants | `trips-9-7-4` 301629/33446140 (0.902%), **`trips-8-6-5` 48987/2572780 (1.904%, default)**, `trips-8-7-4` 233985/6689228 (3.498%), `trips-7-6-5` 115779/2572780 (4.500%), `trips-8-6-4` 545459/8361535 (6.523%). Pays 50/40/30 for Royal / SF / Quads and 3 for trips in every variant. |
| D9 | Dealer qualify | The dealer needs a pair or better. If not, the Ante pushes. Standard rules only, no toggle. |
| D10 | Hands per hour | 30, for every cost-per-hour figure. |
| D11 | Practice mode | A sandbox toggle that hides EV until you confirm, off by default. Drill always grades after the answer. |
| D12 | Blind presets | One Blind preset (`blind-standard`). No sourced cheaper table exists. Ship one preflop table, but keep the generator and types parameterised by the Blind paytable so a preset can be added later (chip). Blind variants are not in the v1 settings UI. |
| D13 | Wire format | `Fraction = { num, den }` (bigint) as in `architecture.md`'s `protocol.ts`. |
| D15 | Practical lens | The practical strategies are `basic` and `simple` (D16). The simulator draft's old `simple` is renamed **`riverLeak`**, is lesson-only, and is never offered as a practical preset. |
| D16 | `simple` | Preflop 4x with 33+, any A, any K, Q8+ (suited or not), JT; otherwise check. Flop 2x with two pair or better (rule a) or a hidden pair (rule b); otherwise check. River as `basic`. |
| D17 | Primary metric | **House edge per Ante.** The EV sheet shows each option's whole-hand EV in antes and dollars plus its cost against the best option. Element of risk is secondary, taught in `edge-vs-risk`. |
| D18 | How EV is computed | River: exact on device (990 dealer hands). Flop: exact in the Web Worker (1,070,190 showdowns), started as soon as the flop is dealt. Preflop: a precomputed exact table of 169 classes (~11 kB). Monte Carlo only for multi-hand simulation, always labelled "≈ … simulated". Long auto-play runs use `expert` as the fast stand-in for `perfect`. |
| D19 | Ids | See §4. The scene schema is owned by `simulator.md`. |
| D20 | Rule definitions | See §3. |
| D22 | Table regeneration in CI | `simulator.md` wins over `architecture.md` §8: generating the preflop table takes hours, so CI does **not** regenerate it. CI checks the shipped table against the pinned values (simulator.md Appendix A) plus Monte Carlo and sampled exact checks. |
| D23 | Settings paytable | `Settings.paytable` is a typed preset id (simulator.md), not a free-form object. |
| D24 | Tiers | Decision tiers on regret r (antes): `best` r = 0 (ties within 1e-9 both `best`), `close` ≤ 0.02, `small` ≤ 0.10, `costly` ≤ 0.50 (alternative card), `blunder` > 0.50 (red, second tap "Do it anyway" when `confirmCostlyMoves` is on, default on). Wager tiers for Trips use crappy's thresholds: `free` ≤ 0, `good` ≤ 2%, `fair` ≤ 5%, `poor` < 9%, `avoid` ≥ 9%. A text label always accompanies the colour. |

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
| `riverLeak` (lesson only) | −6205519211/38630291700 | 16.06387% | $41.64/h |
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

## 5. Open items

Filled in by the design review (§6 of the playbook).
