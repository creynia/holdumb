# holdumb: curriculum and Ultimate Texas Hold'em reference

Status: design spike (content), ready for reconciliation. Owner: curriculum spike.
This document is the **source of truth for all learner-facing text and all UTH math**
(authority order: `decisions.md` > this file and the other design docs > crappy).
The lesson prose here is final copy and is meant to ship as written.

Every number in this file was computed in this spike, either by **exhaustive enumeration** in C
with exact integer arithmetic or with exact rationals in Python. A few figures are
**Monte Carlo estimates**; they are marked "≈ … simulated" wherever they appear.
§12 lists which numbers are computed and which are only cited. The scratch code is in
`/tmp/holdumb-scratch/curriculum/`.

Contents

1. [Conventions for the app](#1-conventions-for-the-app)
2. [House rules and paytables](#2-house-rules-and-paytables)
3. [Metrics: what "house edge" means here](#3-metrics-what-house-edge-means-here)
4. [Course map](#4-course-map)
5. [Lessons](#5-lessons)
6. [Reference table: every bet and every decision](#6-reference-table-every-bet-and-every-decision)
7. [Strategy reference](#7-strategy-reference)
8. [How EV is shown](#8-how-ev-is-shown)
9. [Drill: spot categories and grading copy](#9-drill-spot-categories-and-grading-copy)
10. [How EV is computed in the app (recommendation)](#10-how-ev-is-computed-in-the-app-recommendation)
11. [Exact values for unit tests](#11-exact-values-for-unit-tests)
12. [Verification notes and sources](#12-verification-notes-and-sources)
13. [Assumptions and open points for decisions.md](#13-assumptions-and-open-points-for-decisionsmd)

---

## 1. Conventions for the app

### 1.1 Content markup

The lesson format is defined in `architecture.md` §3.2. It is crappy's format plus three additions:

| Block | Syntax | Use here |
|---|---|---|
| Show the math | `:::math Title` … `:::` | A collapsible box, closed by default. The lesson must read fine with every box closed. |
| Tip | `:::tip` … `:::` | Etiquette or practical advice. |
| Inline cards | `{{As Kd}}` | Cards drawn inline, with suit glyphs and an aria label. |
| Scene | ` ```scene ` YAML | An embedded simulator (1.2). |
| Chart | ` ```chart ` YAML `{strategy, view, highlight?}` | A `StrategyChart` drawn from the strategy registry, never typed by hand. |
| Quiz | ` ```quiz ` YAML list `{q, options, answer (0-based), explain, hand?}` | At the end of each lesson. `hand: {hole, board?}` draws the cards above the question. |

Card codes: rank `23456789TJQKA` plus suit `shdc`, e.g. `As`, `Td`. Hand classes: `AKs` (suited),
`AKo` (offsuit), `77` (pair).

### 1.2 Scene schema (proposal; `simulator.md` owns the final `SceneConfig`)

```yaml
id: l03-s1                    # unique: l<NN>-s<n>
title: A hand you raise early
table:
  bankroll: 50000             # cents
  ante: 1000                  # cents; the Blind always equals the Ante
  trips: 0                    # cents; 0 = no Trips bet
  tripsPaytable: trips-8-6-5  # optional; default from settings
deals:                        # forced deals, consumed in order by each Deal (engine ForcedDeal)
  - { player: [Qs, Qd], dealer: [Ac, 7h], flop: [7c, 3d, Qh], turn: 9s, river: 2c }
seed: 11                      # RNG for any card or hand not forced
startAt: preflop              # optional: open with the cards already dealt (betting → preflop)
allowed: [deal, check, play-4, play-3, play-2, play-1, fold]   # or "all"; others greyed out
showEv: true                  # show the EV sheet (lesson 6 onward)
autoPlay: { hands: 300, strategy: expert, speed: fast, compare: [expert, check-to-river] }
steps:
  - say: "Tap **Deal**."
    completeWhen: { action: deal }
  - say: "Pocket queens! Raise **4x**."
    completeWhen: { action: play-4 }
```

`completeWhen` kinds used in this file:

| Kind | Meaning |
|---|---|
| `{ action: <id> }` | The learner took that action. Ids: `deal`, `check`, `play-4`, `play-3`, `play-2`, `play-1`, `fold`, `set-ante`, `set-trips`. |
| `{ best: true }` | The learner's last decision was the EV-best option (exact preview). |
| `{ street: preflop\|flop\|river\|settled }` | The hand has reached that street. |
| `{ handsPlayed: n }` | n hands have settled in this scene. |
| `{ tap: <target> }` | The learner tapped a felt area: `ante`, `blind`, `play`, `trips`, `board`, `dealer`, `ev-sheet`, `session`. |
| `{ autoPlayDone: true }` | The auto-play run finished. |
| `{ next: true }` | The learner tapped **Next**. Used for "read this" steps. |

Rules for scene authors (playbook §9):
* While a step waits for a decision, **Deal is locked**. Forced cards belong to the deal that the step uses.
* Every scene must complete. Auto-play scenes get a bankroll big enough that a bust can't block the step.
* Auto-play uses the fast strategies (`expert`, `basic`, `simple`, `check-to-river`, `never-fold`, `always-max`).
  `perfect` needs an exact flop enumeration per hand, so it is used only for single hands and Drill (§10).
* Each forced deal has 9 distinct cards. This file's scenes were machine-checked for that and for the
  outcomes their steps describe (§12).

### 1.3 Ids

* Wager ids: `ante`, `blind`, `play`, `trips`. Decision ids: `check`, `play-4`, `play-3`, `play-2`, `play-1`, `fold`.
* Paytable ids: `blind-standard`; `trips-8-6-5` (default), `trips-9-7-4`, `trips-8-7-4`, `trips-7-6-5`, `trips-8-6-4`.
* Mentioned-only side bets (no engine id; copy only): `six-card-bonus`, `progressive`, `bad-beat`.
* Strategy ids (the simulator spike's registry): `perfect`, `expert`, `basic`, `simple`, `check-to-river`, `never-fold`, `always-max`.
* Lesson ids: kebab-case, listed in §4. Chapter ids: `foundations`, `ev-basics`, `perfect-lowest-edge`,
  `perfect-practical`, `perfect-fun`, `real-casino`.

---

## 2. House rules and paytables

Rule set `standard` (Shuffle Master's published rules, as dealt in Las Vegas, Atlantic City and most of the world):

| Rule | Value |
|---|---|
| Bets before the deal | **Ante** and **Blind**, equal amounts, both required. **Trips** is optional. |
| Cards | You and the dealer each get two cards face down. Five community cards come as a **flop** (3), then the **turn and river** together (2). |
| Preflop decision | **Check**, or make a **Play** bet of **4×** or **3×** the Ante. |
| Flop decision (only if you checked) | **Check**, or Play **2×** the Ante. |
| River decision (only if you checked twice) | Play **1×** the Ante, or **fold**. Folding loses the Ante and the Blind. |
| One Play bet per hand | Once you've made a Play bet, you make no more decisions. The rest of the cards are dealt and the hand is settled. |
| Dealer qualifies | With **a pair or better** (best five of seven). If the dealer doesn't qualify, the **Ante pushes**. Play and Blind are still settled. |
| You beat the dealer | Play pays **1:1**. Ante pays **1:1** if the dealer qualifies, else pushes. Blind pays by the Blind paytable for a straight or better, else pushes. |
| Dealer beats you | Play and Blind lose. The Ante loses if the dealer qualifies, else pushes. |
| Tie | Ante, Blind and Play all push. |
| Trips | Paid on your own best five of seven cards, **win or lose against the dealer, and even if you fold**. |
| After a fold | The app reveals the dealer's hand and shows what playing 1x would have done (D7). |

**Blind paytable** `blind-standard` (the only Blind preset, D12):

| Hand | Royal flush | Straight flush | Four of a kind | Full house | Flush | Straight | Anything else |
|---|---|---|---|---|---|---|---|
| Pays | 500 to 1 | 50 to 1 | 10 to 1 | 3 to 1 | 3 to 2 | 1 to 1 | push |

Every rack card and game guide found in this spike shows this table, so there is no Blind variant menu.
The optimal strategy depends on the Blind table. The strategy generator is parameterised by it (D12),
and **every strategy chart and number in this file is for `blind-standard`**.

**Trips paytables** (payouts to 1; anything below three of a kind loses):

| id | Royal | Str. flush | Quads | Full house | Flush | Straight | Trips | House edge (exact) | Seen on |
|---|---|---|---|---|---|---|---|---|---|
| `trips-8-6-5` **(default)** | 50 | 40 | 30 | 8 | 6 | 5 | 3 | 48987/2572780 = **1.904%** | The usual Shuffle Master table |
| `trips-9-7-4` | 50 | 40 | 30 | 9 | 7 | 4 | 3 | 301629/33446140 = 0.902% | Rare, generous |
| `trips-8-7-4` | 50 | 40 | 30 | 8 | 7 | 4 | 3 | 233985/6689228 = 3.498% | Common (e.g. Tulalip, Crown Sydney rack cards) |
| `trips-7-6-5` | 50 | 40 | 30 | 7 | 6 | 5 | 3 | 115779/2572780 = 4.500% | e.g. Sun International guide |
| `trips-8-6-4` | 50 | 40 | 30 | 8 | 6 | 4 | 3 | 545459/8361535 = 6.523% | Cheaper variant |

**Mentioned only, not simulated (D5).** Lessons 20 and 21 cover these. Their tables vary from casino to casino.

| Side bet | Cards used | Example paytable | Edge (exact, for that table) |
|---|---|---|---|
| Six Card Bonus | Best 5 of 6: your 2 hole cards plus 4 more | 1000/200/100/20/15/10/7 (Royal/SF/Quads/FH/Flush/Straight/Trips) | 12816/149695 = **8.561%** |
| Six Card Bonus | same | 1000/200/50/20/15/10/5 | 70366/363545 = 19.356% |
| Progressive | Your 2 hole cards plus the flop (5 cards) | Example $1 table: Royal 100% of the meter, SF 10%, Quads $300, FH $50, Flush $40, Straight $30, Trips $9 | Depends on the meter: 32.3% at $50,000, 17.7% at $100,000, break-even at ≈ $160,531 |
| Bad Beat | Pays when your hand **loses** at showdown with a big hand | Varies widely | Not quoted. The lesson gives the exact chances of losing with each hand (§6.3), so any posted table can be checked. |

---

## 3. Metrics: what "house edge" means here

UTH has three honest ways to quote the cost of the game, and they differ by a factor of four.
The app defines them exactly as follows (all under `perfect` play, Trips excluded):

| Metric | Definition | Value |
|---|---|---|
| **House edge per Ante** (PRIMARY for the game) | expected loss per hand ÷ Ante | 50643648973/2317817502000 = **2.185%** |
| House edge per initial wager | expected loss ÷ (Ante + Blind) | **1.092%** |
| **Element of risk** (= edge per total wagered) | expected loss ÷ expected total wagered per hand (Ante + Blind + Play, with folds counted as Ante + Blind) | 50643648973/9624063957090 = **0.526%** |

Expected total wagered per hand is 29163830173/7023689400 = **4.152 antes**.

Why per Ante is primary: it's the figure casinos, rack cards and every strategy source quote, and it maps
straight to money: **expected cost per hand = 2.185% × your Ante**. Element of risk is shown second.
It answers "per dollar I actually put on the felt", and it's the fair way to compare UTH with games that
have no raises.

**Per decision** (the EV sheet), the primary metric is the **EV of the whole hand** (Ante + Blind + Play)
for each option, in **Ante units and dollars**, plus the **cost against the best option** (regret).
Example: "Raise 4x: **+$36.01** (+3.601 antes) · Best." A regret is never shown as a house edge.

**Per hour** = hands per hour × Ante × edge per Ante. The app uses **30 hands per hour** (D10).
It's a setting, and every per-hour figure scales linearly.

| At 30 hands/hour | $5 Ante | $10 Ante | $25 Ante |
|---|---|---|---|
| Perfect play, expected cost per hour | $3.28 | $6.55 | $16.39 |
| Money on the felt per hour (30 × 4.152 antes) | $622.83 | $1,245.66 | $3,114.16 |

Trips has its own edge per Trips bet (§2), and it adds to the hourly cost at its own size:
`30 × Trips × edge`.

---

## 4. Course map

The course has 23 units in 6 chapters: 20 teaching lessons, 2 checkpoints and a final exam. Every unit
ends with a quiz. All lessons are open (no gating); checkpoints (✔) are cumulative quizzes with one practical scene.

| # | Lesson id | Title | Chapter |
|---|---|---|---|
| 1 | `welcome` | Welcome to the table | 1. Foundations (`foundations`) |
| 2 | `hand-rankings` | Poker hands in five minutes | 1. Foundations |
| 3 | `a-full-hand` | One hand, start to finish | 1. Foundations |
| 4 | `settling-bets` | Who gets paid: qualifying, the Blind and ties | 1. Foundations |
| 5 | `expected-value` | EV and the house edge, in plain English | 2. EV basics (`ev-basics`) |
| 6 | `reading-the-ev-sheet` | Reading the EV sheet (and why 3x is never right) | 2. EV basics |
| 7 | `preflop-raise` | Preflop: when to bet 4x | 3. Perfect strategy I: lowest edge (`perfect-lowest-edge`) |
| 8 | `preflop-close-calls` | Preflop close calls | 3. Perfect strategy I |
| 9 | `flop-raise` | The flop: raise 2x or check | 3. Perfect strategy I |
| 10 | `flop-tricky-boards` | Tricky flops: paired boards, draws, small pairs | 3. Perfect strategy I |
| 11 | `river-call-or-fold` | The river: play 1x or fold | 3. Perfect strategy I |
| 12 | `counting-dealer-outs` | Counting the dealer's outs | 3. Perfect strategy I |
| 13 | `strategy-lowest-edge` | Perfect strategy I: the whole picture | 3. Perfect strategy I |
| 14 | `checkpoint-strategy` ✔ | Checkpoint: perfect strategy | 3. Perfect strategy I |
| 15 | `edge-vs-risk` | House edge, element of risk and cost per hour | 4. Perfect strategy II: practical (`perfect-practical`) |
| 16 | `strategy-practical` | Perfect strategy II: the card you can remember | 4. Perfect strategy II |
| 17 | `variance-and-bankroll` | Swings, sessions and bankroll | 4. Perfect strategy II |
| 18 | `costly-habits` | What common habits really cost | 4. Perfect strategy II |
| 19 | `trips-bet` | The Trips bet | 5. Perfect strategy III: fun per dollar (`perfect-fun`) |
| 20 | `other-side-bets` | Six Card Bonus, progressives and Bad Beat | 5. Perfect strategy III |
| 21 | `strategy-fun-per-dollar` | Perfect strategy III: the most fun per dollar | 5. Perfect strategy III |
| 22 | `at-the-casino` | Playing at a real table | 6. The real casino (`real-casino`) |
| 23 | `final-exam` ✔ | Final exam | 6. The real casino |

**Teaching approach.** Each idea comes first in plain English, then in a guided scene, then as optional
math. The EV sheet appears from lesson 5 on, so learners see the price of every decision before they make
it. Hand-ranking basics are one short refresher (lesson 2, D8), backed by the always-available Hand rankings
card (`#/hands`). Auto-play is held back until the variance lesson, so it lands as a surprise there. The
three strategy chapters follow the playbook's lenses: the lowest edge (`perfect`), practical play (`basic`
and `simple`, with their exact costs), and fun per dollar.

**Chapter summaries** (for `chapters.json`):

| id | title | summary |
|---|---|---|
| `foundations` | Foundations | The table, the hands, a full deal and how every bet is settled. |
| `ev-basics` | EV basics | What a decision is worth, and how the EV sheet shows it. |
| `perfect-lowest-edge` | Perfect strategy I: lowest edge | Every decision, played to the exact optimum: 2.19% of the Ante. |
| `perfect-practical` | Perfect strategy II: practical | A strategy you can remember, what it costs, and how to plan a session. |
| `perfect-fun` | Perfect strategy III: fun per dollar | Side bets and table choices, priced per hour. |
| `real-casino` | The real casino | Etiquette, signals and the final exam. |

---

## 5. Lessons

---

### Lesson 1: `welcome`: Welcome to the table

**Front matter:** `chapter: foundations` · `minutes: 4` · summary: "You against the dealer, four betting circles, one big decision."

**Objectives**

* Know that Ultimate Texas Hold'em (UTH) is you against the dealer, not against the other players.
* Name the four betting circles: Trips, Ante, Blind and Play.
* Know the one big idea: you get **one** chance to make a Play bet, and the earlier you make it, the bigger it can be.

**Lesson**

Ultimate Texas Hold'em borrows its cards from Texas Hold'em poker, but it's a casino table game.
There's no bluffing and no reading other players. **You play against the dealer**, and each player at the
table makes their own decisions about their own hand.

Here's what's in front of you:

* **Ante** and **Blind**: two circles that take **equal bets**. You must make both to play a hand. If your
  Ante is $10, your Blind is $10 too.
* **Trips**: an optional side bet on how good your own hand ends up. More on it in lesson 19.
* **Play**: empty when the hand starts. This is where your one raise goes.

You and the dealer each get **two cards** face down. Five **community cards** are shared by both of you:
first three (the **flop**), then two more (the **turn and river**). Each side makes its best five-card
poker hand out of its own two cards plus the five on the board.

The twist that makes UTH interesting is the Play bet. **You get exactly one chance to make it**, and its
size depends on how early you commit:

* **Before the flop**, you may bet **4×** your Ante (or 3×).
* **After the flop**, if you waited, you may bet **2×**.
* **After the river**, if you still waited, you must bet **1×** or **fold**.

Waiting costs you size, but it buys information. Most of this course is about when to commit and when to
wait, and the app will show you the exact value of each choice before you make it.

:::tip
You don't need to know any poker strategy to sit down. You do need to know which hand beats which. The next
lesson is a five-minute refresher, and **More → Hand rankings** is always one tap away.
:::

**Simulator scenes**

```scene
id: l01-s1
title: Find the circles
table: { bankroll: 50000, ante: 1000, trips: 0 }
allowed: []
showEv: false
steps:
  - say: "Tap the **Ante** circle."
    completeWhen: { tap: ante }
  - say: "Now the **Blind**. It always matches the Ante."
    completeWhen: { tap: blind }
  - say: "Tap **Trips**, the optional side bet."
    completeWhen: { tap: trips }
  - say: "And **Play**: it stays empty until you make your one raise."
    completeWhen: { tap: play }
```

```scene
id: l01-s2
title: Watch a hand
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Ah, Kd], dealer: [9c, 9h], flop: [Kh, 7s, 2d], turn: Jc, river: 4h }
allowed: [deal, play-4]
showEv: false
steps:
  - say: "Your $10 Ante and $10 Blind are already out. Tap **Deal**."
    completeWhen: { action: deal }
  - say: "Ace-king is a great start. Make the biggest Play bet: tap **Bet 4x** ($40)."
    completeWhen: { action: play-4 }
  - say: "That was your only decision. The dealer now shows every card. Your pair of kings beats the dealer's nines: Ante and Play both pay, and the Blind pushes. You won **$50**."
    completeWhen: { next: true }
```

```quiz
- q: Who are you playing against in Ultimate Texas Hold'em?
  options: ["The other players", "The dealer", "Both", "Nobody, it's a slot game"]
  answer: 1
  explain: "Every player plays their own hand against the dealer's hand."
- q: Your Ante is $15. How much is your Blind?
  options: ["$0, the Blind is optional", "$7.50", "$15", "$30"]
  answer: 2
  explain: "Ante and Blind are always equal, and both are required."
- q: When can you make the biggest Play bet?
  options: ["Before the flop", "After the flop", "After the river", "Any time"]
  answer: 0
  explain: "Before the flop you may bet 4× the Ante. After the flop it's 2×, and after the river 1×."
```

---

### Lesson 2: `hand-rankings`: Poker hands in five minutes

**Front matter:** `chapter: foundations` · `minutes: 6` · summary: "The ten hands, best five of seven, and kickers."

**Objectives**

* Rank the ten poker hands from royal flush down to high card.
* Build the best five-card hand from seven cards.
* Break ties with kickers, and know when "the board plays".

**Lesson**

If you've played poker before, skim this and take the quiz. If not, this is all you need.

Every hand is exactly **five cards**. From strongest to weakest:

| Hand | Example | How often in 7 cards |
|---|---|---|
| Royal flush | {{As Ks Qs Js Ts}} | 1 in 30,940 |
| Straight flush | {{9h 8h 7h 6h 5h}} | 1 in 3,591 |
| Four of a kind ("quads") | {{Qc Qd Qh Qs 4d}} | 1 in 595 |
| Full house | {{8s 8d 8c Kh Kd}} | 1 in 38.5 |
| Flush (five of one suit) | {{Ad Jd 9d 6d 2d}} | 1 in 33.1 |
| Straight (five in a row) | {{Tc 9d 8h 7s 6c}} | 1 in 21.6 |
| Three of a kind ("trips") | {{7d 7h 7s Kc 2d}} | 1 in 20.7 |
| Two pair | {{Jc Jd 4h 4s Ac}} | 1 in 4.3 |
| One pair | {{Ts Th Ad 8c 3h}} | 1 in 2.3 |
| High card | {{Ah Qd 9s 6c 3d}} | 1 in 5.7 |

Aces count high or low in a straight: {{5d 4c 3h 2s Ah}} (the "wheel") is the lowest straight, and
{{Ah Kd Qc Js Td}} the highest. A straight can't wrap around: {{3c 2d Ah Ks Qh}} is just ace high.

**Best five of seven.** You have two cards and the board has five. Your hand is the **best five** of those
seven, using both, one or none of your own cards. The dealer does the same.

**Ties and kickers.** If both hands are the same kind, compare the cards that make them, highest first:
a pair of kings beats a pair of queens. If those are equal too, compare the leftover cards, the
**kickers**, one at a time. {{Ks Kd Ac 9h 4d}} beats {{Kh Kc Qd Jc 9s}}, because ace beats queen. Suits never
break ties. If all five cards match in rank, it's a tie.

**When the board plays.** Sometimes the best five cards are all on the board, for both of you. Then neither
hole card counts, and you tie.

:::tip
In UTH, the cards that come from **your hand** are what matter. A pair that sits on the board belongs to the
dealer just as much as to you. Later lessons call a pair that uses one of your cards a **hidden pair**.
:::

:::math Where the "how often" column comes from
There are C(52, 7) = 133,784,560 ways to get seven cards. The app's evaluator counts each hand type
exhaustively: 4,324 royal flushes, 37,260 other straight flushes, 224,848 quads, 3,473,184 full houses,
4,047,644 flushes, 6,180,020 straights, 6,461,620 trips, 31,433,400 two pair, 58,627,800 one pair and
23,294,460 high-card hands. "1 in 30,940" is 133,784,560 ÷ 4,324.

You're more likely to make one pair (43.8%) than nothing at all (17.4%), because seven cards give you
21 different five-card choices.
:::

**Simulator scenes**

```scene
id: l02-s1
title: Best five of seven
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [9s, 8d], dealer: [Kc, Ks], flop: [Th, 7c, 2s], turn: Jd, river: Kh }
allowed: [deal, check, play-1]
showEv: false
steps:
  - say: "Tap **Deal**, then **Check** twice to see all five board cards."
    completeWhen: { street: river }
  - say: "Find your hand: 7-8-9-10-J is a **straight**, using both your cards. Tap **Bet 1x**."
    completeWhen: { action: play-1 }
  - say: "The dealer made three kings. A straight beats trips. And because you won with a straight, the **Blind pays 1 to 1** as well."
    completeWhen: { next: true }
```

```quiz
- q: Which hand is stronger?
  options: ["A flush", "A straight", "They're equal", "It depends on the suits"]
  answer: 0
  explain: "A flush beats a straight. Suits never matter for ranking."
- q: You hold these cards. What is your best five-card hand?
  hand: { hole: Ah 5c, board: Kd Kh 9s 5d 2c }
  options: ["One pair, kings", "Two pair, kings and fives", "Two pair, kings and fives, ace kicker", "A straight"]
  answer: 2
  explain: "K-K and 5-5 with the ace as the fifth card."
- q: Both you and the dealer have a pair of jacks, and the best kickers are the same down to the fifth card. Who wins?
  options: ["You, if your suits are higher", "The dealer", "Nobody, it's a tie", "Whoever has the higher hole card"]
  answer: 2
  explain: "All five cards match in rank, so it's a tie. Suits never break ties."
- q: Is {{3c 2d Ah Ks Qh}} a straight?
  options: ["Yes", "No"]
  answer: 1
  explain: "Straights can't wrap around the ace. This is just ace high."
```

---

### Lesson 3: `a-full-hand`: One hand, start to finish

**Front matter:** `chapter: foundations` · `minutes: 7` · summary: "Three decision points, and what happens after each one."

**Objectives**

* Play a hand through each path: raise preflop, raise on the flop, play 1x at the river, or fold.
* Know that one Play bet ends your decisions.
* Know that folding costs exactly the Ante and the Blind.

**Lesson**

A hand of UTH is a short ladder with three steps. You can climb off at any step by making your Play bet.

**Step 1: preflop.** You see your two cards. Choose:
* **Bet 4×** (or 3×) the Ante in the Play circle, or
* **Check**: bet nothing for now and see the flop.

**Step 2: the flop.** If you checked, three community cards are dealt. Choose:
* **Bet 2×** the Ante, or
* **Check** again.

**Step 3: the river.** If you checked twice, the turn and river come out together. Now you must choose:
* **Bet 1×** the Ante, or
* **Fold**: give up your Ante and Blind and stop.

The moment you make a Play bet, at any step, **you're done deciding**. The dealer deals any remaining
community cards, turns over their two cards and settles everything.

Notice what you **can't** do. You can't fold before the river, and you can't raise twice. You also can't take a bet
back. Checking early is free, so the only ways to lose more than your Ante and Blind are by choosing to make
a Play bet.

There's one more thing to know about folding: it costs exactly **2 Antes** (your Ante and Blind), no
matter what the dealer has. If you play 1x instead, you can win or lose up to 3 Antes. Lesson 11 shows when
that's worth it.

**Simulator scenes**

```scene
id: l03-s1
title: Raise before the flop
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Qs, Qd], dealer: [Ac, 7h], flop: [7c, 3d, Qh], turn: 9s, river: 2c }
allowed: [deal, play-4]
steps:
  - say: "Tap **Deal**."
    completeWhen: { action: deal }
  - say: "Pocket queens. Bet **4x**: $40 goes into Play."
    completeWhen: { action: play-4 }
  - say: "You made three queens; the dealer has a pair of sevens. Ante +$10, Play +$40, Blind pushes (trips is below a straight): **+$50**."
    completeWhen: { next: true }
```

```scene
id: l03-s2
title: Check, check, play 1x
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Jh, 8c], dealer: [6c, 4d], flop: [Kd, 5s, 2c], turn: Jd, river: 6h }
allowed: [deal, check, play-1]
steps:
  - say: "Tap **Deal**. Jack-eight isn't strong enough to bet 4x, so tap **Check**."
    completeWhen: { street: flop }
  - say: "The flop missed you. **Check** again."
    completeWhen: { street: river }
  - say: "The river gave you a pair of jacks. Bet **1x**."
    completeWhen: { action: play-1 }
  - say: "Your jacks beat the dealer's sixes: Ante +$10, Play +$10, Blind pushes. **+$20**."
    completeWhen: { next: true }
```

```scene
id: l03-s3
title: Knowing when to fold
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [8s, 3d], dealer: [Td, 6s], flop: [Kh, Qc, 6d], turn: Jc, river: 2s }
allowed: [deal, check, fold]
steps:
  - say: "Tap **Deal**, then **Check** on the preflop and on the flop."
    completeWhen: { street: river }
  - say: "Eight high on a board of K-Q-J-6-2: almost any dealer hand beats you. Tap **Fold**."
    completeWhen: { action: fold }
  - say: "The dealer had a pair of sixes. Folding cost $20 (Ante + Blind); playing 1x would have cost $30."
    completeWhen: { next: true }
```

```quiz
- q: You checked before the flop. What can you bet after the flop?
  options: ["4×", "3×", "2×", "1×"]
  answer: 2
  explain: "The flop raise is 2× the Ante."
- q: You bet 4× before the flop. What do you decide on the river?
  options: ["Whether to fold", "Whether to add 1×", "Nothing, your decisions are over", "Whether to take the bet back"]
  answer: 2
  explain: "One Play bet per hand. After it, the dealer just finishes the hand."
- q: When can you fold?
  options: ["Any time", "Only before the flop", "Only on the river, after checking twice", "Never"]
  answer: 2
  explain: "The only fold is at the last decision, instead of betting 1×."
- q: Your Ante is $10. How much does folding cost?
  options: ["$10", "$20", "$30", "Nothing"]
  answer: 1
  explain: "You lose the Ante and the Blind, $10 each."
```

---

### Lesson 4: `settling-bets`: Who gets paid: qualifying, the Blind and ties

**Front matter:** `chapter: foundations` · `minutes: 8` · summary: "Ante, Blind and Play each have their own rule."

**Objectives**

* Settle each bet when you win, lose, tie or fold.
* Know that the dealer must have a pair or better to "qualify", and that only the Ante cares.
* Read the Blind paytable, and know that the Blind only pays for a straight or better.

**Lesson**

At showdown, your best five cards are compared with the dealer's. Three bets get settled, each with its own rule.

**The Play bet** is the simple one. Win and it pays 1 to 1. Lose and it loses. Tie and it pushes.

**The Ante** has one extra condition: **the dealer must qualify**, which means the dealer needs **a pair or
better**. If the dealer doesn't qualify, your Ante comes back to you (a push), whether you won or lost the
hand. If the dealer does qualify, the Ante wins or loses just like Play.

**The Blind** is generous on big hands and stingy on small ones. If you win the hand, the Blind pays by this table:

| Your hand | Blind pays |
|---|---|
| Royal flush | 500 to 1 |
| Straight flush | 50 to 1 |
| Four of a kind | 10 to 1 |
| Full house | 3 to 1 |
| Flush | 3 to 2 |
| Straight | 1 to 1 |
| Anything less | push |

If you **lose** the hand, the Blind loses, whatever you held. If you **tie**, everything pushes.

**If you fold**, you lose the Ante and the Blind. Any Trips bet is still paid on your cards.

Put together, with a $10 Ante:

| What happened | Ante | Blind | Play (4x) | Net |
|---|---|---|---|---|
| You win with a pair, dealer qualifies | +$10 | push | +$40 | **+$50** |
| You win with a pair, dealer doesn't qualify | push | push | +$40 | **+$40** |
| You win with a flush, dealer qualifies | +$10 | +$15 | +$40 | **+$65** |
| Dealer wins with a pair | −$10 | −$10 | −$40 | **−$60** |
| Dealer wins with ace high (doesn't qualify) | push | −$10 | −$40 | **−$50** |
| Tie | push | push | push | **$0** |

The dealer fails to qualify about 1 time in 6 (17.4% of the time). When they don't qualify, you lose the
Ante's win, but you also can't lose the Ante.

:::math How often each thing happens
Over every possible deal where both hands go to showdown (2,598,960 boards × 1,081 player hands × 990
dealer hands):

* You win **47.97%**, you lose **47.97%** and you tie **4.07%**. The game is symmetric until you make
  decisions.
* The dealer qualifies **82.59%** of the time (789215/955604).
* You win **and** the dealer doesn't qualify 14.24% of the time. Those are the Ante pushes you'd rather
  have been paid.
:::

**Simulator scenes**

```scene
id: l04-s1
title: The dealer doesn't qualify
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Ks, Jd], dealer: [Qc, 8h], flop: [Ah, 9d, 5c], turn: 3s, river: 2h }
allowed: [deal, play-4]
steps:
  - say: "Tap **Deal**, then bet **4x** with king-jack."
    completeWhen: { action: play-4 }
  - say: "Neither of you has a pair, and your king beats the dealer's queen. But the dealer didn't qualify, so the **Ante pushes**. Play pays $40, the Blind pushes: **+$40**."
    completeWhen: { next: true }
```

```scene
id: l04-s2
title: A Blind bonus
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Ah, Qh], dealer: [8s, 8c], flop: [Kh, 7h, 2c], turn: Jh, river: 5d }
allowed: [deal, play-4]
steps:
  - say: "Tap **Deal** and bet **4x**."
    completeWhen: { action: play-4 }
  - say: "An ace-high heart flush! You beat the dealer's eights. Ante +$10, Play +$40, and the **Blind pays 3 to 2: +$15**. Total **+$65**."
    completeWhen: { next: true }
```

```scene
id: l04-s3
title: The board plays, it's a tie
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Ad, 4c], dealer: [As, 3d], flop: [Kc, Kd, Qh], turn: Qs, river: Jh }
allowed: [deal, play-4]
steps:
  - say: "Tap **Deal** and bet **4x** with your ace."
    completeWhen: { action: play-4 }
  - say: "You both have K-K-Q-Q with an ace kicker. The 4 and the 3 don't play. **Tie**: every bet pushes."
    completeWhen: { next: true }
```

```scene
id: l04-s4
title: Losing to a dealer who didn't qualify
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Qc, 9d], dealer: [Ac, 3h], flop: [Ks, 8h, 6d], turn: 4c, river: 2s }
allowed: [deal, play-4]
steps:
  - say: "Tap **Deal** and bet **4x** with queen-nine."
    completeWhen: { action: play-4 }
  - say: "The dealer's ace high beats your queen high. The dealer didn't qualify, so only the **Ante** is saved. Play −$40, Blind −$10: **−$50**."
    completeWhen: { next: true }
```

```scene
id: l04-s5
title: Fold, and Trips still pays
table: { bankroll: 50000, ante: 1000, trips: 500 }
deals:
  - { player: [7s, 2d], dealer: [Kc, Qd], flop: [9c, 9d, 9h], turn: Kh, river: 4s }
allowed: [deal, check, fold]
steps:
  - say: "This time you have a $5 Trips bet too. Tap **Deal**, then **Check** twice."
    completeWhen: { street: river }
  - say: "Three nines are on the board, so the dealer has them too, and the king pairs any king the dealer holds. Tap **Fold**."
    completeWhen: { action: fold }
  - say: "The dealer had a full house. Your Ante and Blind lose (−$20), but **Trips pays 3 to 1 on your three nines (+$15)**. Net **−$5**."
    completeWhen: { next: true }
```

```quiz
- q: The dealer has ace high and you have a pair of sixes. You bet 4×. What happens to your Ante?
  options: ["It wins", "It loses", "It pushes", "It pays 3 to 2"]
  answer: 2
  explain: "The dealer didn't qualify (no pair), so the Ante pushes. Play still wins."
- q: You win with a straight. What does the Blind pay?
  options: ["Push", "1 to 1", "3 to 2", "3 to 1"]
  answer: 1
  explain: "Straight 1 to 1, flush 3 to 2, full house 3 to 1, and up from there."
- q: You lose to the dealer's pair while holding a flush draw that missed. What happens to the Blind?
  options: ["Push", "It loses", "It pays 1 to 1", "It's returned because you lost"]
  answer: 1
  explain: "When the dealer beats you, the Blind loses."
- q: $10 Ante, you bet 2× on the flop and win with two pair. The dealer has a pair. What do you net?
  options: ["+$20", "+$30", "+$40", "+$50"]
  answer: 1
  explain: "Ante +$10, Play +$20, Blind pushes (two pair is below a straight)."
```

