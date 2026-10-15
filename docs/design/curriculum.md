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
| `{ best: true }` | The learner's last decision was the EV-best option (exact preview). On a miss the hand plays out, then **Try again** replays the same forced deal. |
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

---

### Lesson 5: `expected-value`: EV and the house edge, in plain English

**Front matter:** `chapter: ev-basics` · `minutes: 7` · summary: "What a decision is worth on average, and what the game costs."

**Objectives**

* Explain expected value (EV) as "the average result if you faced this spot millions of times".
* Measure EV in **Ante units**, and convert to dollars.
* Know the price of the whole game under perfect play: **2.19% of the Ante per hand**.

**Lesson**

Any single hand is luck. But every decision has an **expected value**: the average amount it wins or
loses, over all the ways the remaining cards could fall. EV is how we compare decisions fairly, without
being fooled by how one hand happened to turn out.

In UTH it's easiest to measure EV in **Ante units**. "+1.17 antes" means that on average this
decision wins 1.17 times your Ante over the whole hand (Ante, Blind and Play together). At a $10 Ante that's
**+$11.72**. At $25 it's +$29.30. The ranking of the choices doesn't change with your bet size.

Two examples from the first decision of a hand:

| Hand | Bet 4x | Check | Best |
|---|---|---|---|
| {{Ah Kd}} ace-king offsuit | **+1.172 antes** (+$11.72 at $10) | +0.569 antes | Bet 4x, by 0.60 antes |
| {{7s 2d}} seven-deuce offsuit | −2.118 antes | **−0.883 antes** | Check, by 1.23 antes |

Notice that **checking 7-2 still has a negative EV**. Some hands lose money however you play them. You
paid your Ante and Blind before you saw your cards. Good play is about losing **as little as possible**
with bad hands and winning **as much as possible** with good ones.

**The house edge.** Average the EV of perfect play over every possible hand and you get the price of the
game: **−0.02185 antes per hand**, a house edge of **2.185% of the Ante**. At a $10 Ante that's an expected
cost of about **22¢ a hand**. No strategy does better. Every decision this course teaches is part of
reaching that 2.19%.

Here's what decisions are worth. If you never raised early and always played 1x at the river, never folding,
you'd lose **40.7% of your Ante per hand**. That's almost twenty times more. The Ante and the Blind are
built to lose if you just ride them to showdown. Your raises with strong hands, and your folds with hopeless
ones, win nearly all of it back.

:::math Where the 40.7% comes from
If you always play 1x at the river, the Play bet is a pure coin flip. You win and lose equally often
(47.97% each), so its EV is exactly 0. Look at the other two bets:

* **Ante**: it's paid only when the dealer qualifies, but it is lost whenever a qualifying dealer beats you.
  It wins 33.73% and loses 45.21% of the time: EV = −1330653811/11589087510 ≈ **−0.1148** antes.
* **Blind**: it pays only on a straight or better, but it loses every hand you lose: EV ≈ **−0.2922** antes.

Total: −6432686411/15803301150 ≈ **−0.4070** antes per hand.

Under perfect play the EV is −50643648973/2317817502000 ≈ **−0.021850** antes. These are exact
enumerations over every deal (§12).
:::

**Simulator scenes**

```scene
id: l05-s1
title: Meet the EV sheet
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [Ah, Kd] }
seed: 501
allowed: [deal, play-4, play-3, check]
showEv: true
steps:
  - say: "Tap **Deal**. The **EV sheet** lists every option with its average result for the whole hand."
    completeWhen: { action: deal }
  - say: "Ace-king offsuit: **Bet 4x** is +$11.72, **Check** is +$5.69. Pick the best option."
    completeWhen: { best: true }
  - say: "Whatever happens next is luck. Your decision was worth **+$11.72** on average."
    completeWhen: { next: true }
```

```scene
id: l05-s2
title: A hand that loses either way
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [7s, 2d] }
seed: 502
allowed: [deal, play-4, play-3, check, play-2, play-1, fold]
showEv: true
steps:
  - say: "Tap **Deal**. Seven-deuce: every option is negative. Find the one that loses least."
    completeWhen: { action: deal }
  - say: "**Check** loses $8.83 on average; betting 4x loses $21.18. Check."
    completeWhen: { best: true }
  - say: "Play the rest of the hand however the EV sheet suggests."
    completeWhen: { street: settled }
```

```quiz
- q: Your Ante is $20. An option shows +0.50 antes. What is its EV in dollars?
  options: ["+$0.50", "+$5", "+$10", "+$20"]
  answer: 2
  explain: "0.50 × $20 = $10. Ante units scale with your bet."
- q: What is the house edge of UTH under perfect play?
  options: ["About 0.5% of the Ante", "About 2.19% of the Ante", "About 5% of the Ante", "Zero with perfect play"]
  answer: 1
  explain: "2.185% of the Ante per hand. Nothing beats it, and Trips is extra."
- q: You played a hand perfectly and lost $60. Was it a bad decision?
  options: ["Yes, you lost", "Not necessarily: EV is about the average, not one result", "Yes, you should have folded", "Only if the dealer qualified"]
  answer: 1
  explain: "Good decisions lose sometimes. EV measures the average over all the ways the cards could fall."
```

---

### Lesson 6: `reading-the-ev-sheet`: Reading the EV sheet (and why 3x is never right)

**Front matter:** `chapter: ev-basics` · `minutes: 7` · summary: "Best play, close calls and big mistakes, plus the 3x trap."

**Objectives**

* Read the EV sheet: each option's EV, the cost against the best option, and the tier badge.
* Know the five decision tiers and what each one means.
* Know why betting 3× preflop is never the best play.

**Lesson**

Whenever you have a decision, the EV sheet lists every option:

> **Bet 4x**: +$36.01 · **Best play**
> **Bet 3x**: +$28.97 · −$7.04 vs best · **Big mistake**
> **Check**: +$21.93 · −$14.08 vs best · **Big mistake**

That's pocket aces at a $10 Ante. Every line is the average result for the whole hand, assuming you play
the rest of the hand perfectly. The "vs best" figure is what the choice **costs you on average**. The badge
sorts that cost into five tiers:

| Tier | Cost vs best | Badge | Example |
|---|---|---|---|
| Best | 0 | **Best play** | Bet 4x with {{As Ad}} |
| Close | up to 0.02 antes | **Close** | Checking {{Js 8s}} (costs 0.011) |
| Small | up to 0.10 antes | **Small mistake** | Betting 4x with {{Kc 4d}} (costs 0.023) |
| Costly | up to 0.50 antes | **Mistake** | Betting 4x with {{2c 2d}} (costs 0.108) |
| Blunder | over 0.50 antes | **Big mistake** | Betting 4x with {{7s 2d}} (costs 1.23) |

A Big mistake asks for a second tap before it goes through, and the sheet suggests the better option. You're
always allowed to make it. It's your sandbox.

**Why 3x is never the best play.** The Play bet's result is just Play × (+1 if you win, −1 if you lose,
0 on a tie). So the EV of betting P antes is

> EV(P) = (what Ante and Blind earn) + P × (how often you win − how often you lose)

That's a straight line in P. If you win more often than you lose, a bigger bet is better and 4x beats 3x.
If you don't, even 3x is worse than checking and playing just 1x later. **Either 4x or check always beats
3x**, for every hand. 3x exists so that players who are short on chips can still make a Play bet.

:::math The 3x proof, with numbers
Write the preflop EV of betting P as EV(P) = a + P·b, where b = P(win) − P(lose) for the hand at showdown.
* If b ≥ 0: EV(4) − EV(3) = b ≥ 0, so 4x is at least as good.
* If b < 0: EV(3) = a + 3b < a + b = EV(check, then always play 1x) ≤ EV(check, then play the river perfectly).

For aces: EV(4x) = 472094411/131098275 ≈ 3.6011, EV(3x) ≈ 2.8970, EV(check) = 38331809/17479770 ≈ 2.1929.
Playing perfect strategy except always betting 3x instead of 4x raises the house edge from 2.19% to **9.86%**.
:::

**Simulator scenes**

```scene
id: l06-s1
title: Three options, one best
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [As, Ad] }
seed: 601
allowed: [deal, play-4, play-3, check]
showEv: true
steps:
  - say: "Tap **Deal**, then tap each option once to see its line on the EV sheet. Don't confirm yet."
    completeWhen: { tap: ev-sheet }
  - say: "4x is +$36.01, 3x +$28.97, check +$21.93. Confirm the **Best play**."
    completeWhen: { best: true }
```

```scene
id: l06-s2
title: A big mistake, on purpose
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [7s, 2d] }
seed: 602
allowed: [deal, play-4, check]
showEv: true
steps:
  - say: "Tap **Deal**, then tap **Bet 4x** on seven-deuce. See the red **Big mistake** badge and the suggested alternative."
    completeWhen: { tap: ev-sheet }
  - say: "Tap **Check**, the better option."
    completeWhen: { best: true }
```

```quiz
- q: 'The EV sheet says "Check: −$0.23 vs best · Small mistake" at a $10 Ante. What does that mean?'
  options: ["You will lose $0.23", "On average, checking earns $0.23 less than the best option", "The house edge is 0.23%", "Checking is free"]
  answer: 1
  explain: "'vs best' is the average cost of the choice compared with the best option."
- q: Is betting 3× preflop ever the best play?
  options: ["Yes, with medium hands", "Yes, with small pairs", "No: 4x or check is always at least as good", "Only when the dealer shows an ace"]
  answer: 2
  explain: "EV is a straight line in the bet size, so the best choice is always one of the ends: 4x, or check."
- q: Which tier asks you to confirm with a second tap?
  options: ["Close", "Small mistake", "Mistake", "Big mistake"]
  answer: 3
  explain: "Only Big mistakes (over 0.5 antes) need a second tap."
```

---

### Lesson 7: `preflop-raise`: Preflop: when to bet 4x

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 8` · summary: "The exact preflop chart, in eight short rules."

**Objectives**

* Know the perfect preflop strategy: bet 4x or check, nothing else.
* Recall the chart as eight short rules.
* Know that about 38% of hands are 4x hands.

**Lesson**

Before the flop there are 1,326 possible two-card hands, in 169 kinds (pairs, suited and offsuit). For
each one, the app has the exact EV of betting 4x, betting 3x and checking, with perfect play afterwards.
The answer for every one of them fits in eight rules.

**Bet 4x with:**
1. **Any pair** of threes or better (33+). **Check deuces.**
2. **Any ace** (A-2 offsuit and up).
3. **King, suited**: any suited king (K2s+).
4. **King, offsuit**: K5o and better.
5. **Queen, suited**: Q6s and better.
6. **Queen, offsuit**: Q8o and better.
7. **Jack, suited**: J8s and better.
8. **Jack, offsuit**: JTo only (and JQ, JK, JA above it).

**Check everything else**: every hand with a ten or lower as its top card (except pairs), and the weaker
kings, queens and jacks.

This isn't a simplification. It is **exactly** the optimal preflop strategy for the standard Blind paytable:
the app solved every hand, and all 169 kinds match these rules. You'll bet 4x on **500 of the 1,326 hands
(37.7%)**.

```chart
strategy: perfect
view: preflop-grid
highlight: [33, A2o, K2s, K5o, Q6s, Q8o, J8s, JTo]
```

Why does a hand like {{Ac 2d}} deserve 4x? An ace is the strongest high card, and even when nobody pairs,
ace high often wins against a dealer who failed to qualify. Betting 4x earns **+0.042 antes**; checking
earns **−0.082**.

Why not more hands? A hand like {{Ts 9s}} looks pretty, and it even wins money if you check (+0.205
antes). But betting 4x earns slightly less (+0.185). Ten-nine wins only a little more often than it loses
at showdown. If you check, you can bet 2x when the flop hits you and fold the hopeless rivers, and that
flexibility is worth more than the bigger bet.

:::math What the chart is worth
EV per hand under perfect play, by preflop decision:
* Bet 4x (500 of 1,326 hands): average EV **+0.703** antes. Aces +3.601, kings +3.289, AKs +1.658, AKo +1.172.
* Check (826 hands): average EV **−0.461** antes. 72o −0.883, 22 −0.179.

Overall: −0.02185 antes per hand. 37.71% of hands are 4x, 21.28% bet 2x on the flop, 21.82% play 1x on the
river and 19.19% fold.
:::

**Simulator scenes**

```scene
id: l07-s1
title: Preflop calls
table: { bankroll: 100000, ante: 1000, trips: 0 }
deals:
  - { player: [Ac, 3d] }
  - { player: [Kh, 7c] }
  - { player: [Qd, 9s] }
  - { player: [Js, 9h] }
  - { player: [3h, 3s] }
  - { player: [Th, 9h] }
seed: 701
allowed: [deal, play-4, check, play-2, play-1, fold]
showEv: true
steps:
  - say: "Six hands. For each one, **Deal**, then make the preflop call from the eight rules. The EV sheet shows you after you choose. Hand 1: ace-three offsuit."
    completeWhen: { best: true }
  - say: "Play out the hand, then deal hand 2: king-seven offsuit."
    completeWhen: { best: true }
  - say: "Hand 3: queen-nine offsuit."
    completeWhen: { best: true }
  - say: "Hand 4: jack-nine offsuit."
    completeWhen: { best: true }
  - say: "Hand 5: pocket threes."
    completeWhen: { best: true }
  - say: "Hand 6: ten-nine suited."
    completeWhen: { best: true }
```

```quiz
- q: Which hand should you bet 4x preflop?
  hand: { hole: Ah 2c }
  options: ["Bet 4x", "Check"]
  answer: 0
  explain: "Any ace is a 4x hand."
- q: Which hand should you bet 4x preflop?
  hand: { hole: Kd 4c }
  options: ["Bet 4x", "Check"]
  answer: 1
  explain: "Offsuit kings need a 5 or better: K5o+. K4o is a check (a close one)."
- q: Which hand should you bet 4x preflop?
  hand: { hole: 2s 2h }
  options: ["Bet 4x", "Check"]
  answer: 1
  explain: "Every pair from 33 up is 4x. Deuces are the one pair you check."
- q: About what share of hands are 4x hands?
  options: ["About 10%", "About 25%", "About 38%", "About 60%"]
  answer: 2
  explain: "500 of the 1,326 possible hands: 37.7%."
```

---

### Lesson 8: `preflop-close-calls`: Preflop close calls

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 6` · summary: "Where the chart's edges are, and how little they matter."

**Objectives**

* Know the hands at the edge of the chart and how close they are.
* Know that betting 4x can be right even when it loses money on average.
* Put close calls in perspective: in dollars per hour, the big hands matter far more.

**Lesson**

Every chart has edges. Here are UTH's, with the exact EVs (in antes) of both choices:

| Hand | Bet 4x | Check | Best | Margin |
|---|---|---|---|---|
| {{Kc 5d}} K5o | −0.118 | −0.151 | **4x** | 0.034 |
| {{Kc 4d}} K4o | −0.229 | −0.206 | **Check** | 0.023 |
| {{Kh 2h}} K2s | −0.075 | −0.080 | **4x** | 0.005 |
| {{Qc 8d}} Q8o | −0.069 | −0.093 | **4x** | 0.023 |
| {{Qc 7d}} Q7o | −0.278 | −0.209 | **Check** | 0.068 |
| {{Qh 6h}} Q6s | −0.006 | −0.028 | **4x** | 0.022 |
| {{Qh 5h}} Q5s | −0.096 | −0.074 | **Check** | 0.021 |
| {{Js 8s}} J8s | +0.107 | +0.096 | **4x** | 0.011 |
| {{Js 7s}} J7s | −0.107 | −0.034 | **Check** | 0.072 |
| {{Jc Td}} JTo | +0.174 | +0.110 | **4x** | 0.064 |
| {{Jc 9d}} J9o | −0.070 | −0.039 | **Check** | 0.032 |
| {{3c 3d}} 33 | +0.088 | +0.007 | **4x** | 0.081 |
| {{2c 2d}} 22 | −0.288 | −0.179 | **Check** | 0.108 |
| {{Ts 9s}} T9s | +0.185 | +0.205 | **Check** | 0.020 |

Two things stand out.

**4x can be right when it loses money.** {{Kc 5d}} loses 0.118 antes on average if you bet 4x, but it loses
0.151 if you check. You paid your Ante and Blind already, so the question is never "is this hand a winner?"
It's "which option loses least, or wins most?"

**Close calls are cheap.** Get K4o wrong every single time it's dealt, and you give up about **6¢ an
hour** at a $10 Ante. Check pocket aces instead of betting 4x, and you give up **$1.91 an hour**, on a hand
you only see once every 221 deals. Learn the big hands first, and the edges second.

:::math How "per hour" is worked out for one hand
Cost per hour = hands per hour × P(this hand) × cost per time × Ante.
K4o: 30 × (12/1,326) × 0.0228 × $10 ≈ $0.06. Pocket aces checked: 30 × (6/1,326) × 1.408 × $10 ≈ $1.91.
Betting 4x with 7-2 offsuit every time: 30 × (12/1,326) × 1.235 × $10 ≈ $3.35.
:::

**Simulator scenes**

```scene
id: l08-s1
title: Edge of the chart
table: { bankroll: 100000, ante: 1000, trips: 0 }
deals:
  - { player: [Kc, 5d] }
  - { player: [Kd, 4c] }
  - { player: [Qs, 8h] }
  - { player: [Qd, 7c] }
  - { player: [2c, 2h] }
seed: 801
allowed: [deal, play-4, check, play-2, play-1, fold]
showEv: true
steps:
  - say: "Deal and decide: king-five offsuit."
    completeWhen: { best: true }
  - say: "Play it out, then deal: king-four offsuit."
    completeWhen: { best: true }
  - say: "Queen-eight offsuit."
    completeWhen: { best: true }
  - say: "Queen-seven offsuit."
    completeWhen: { best: true }
  - say: "Pocket deuces."
    completeWhen: { best: true }
```

```quiz
- q: Betting 4x with K5o has a negative EV (−0.118 antes). Why is it still the best play?
  options: ["It isn't, you should check", "Checking loses even more (−0.151)", "Because the Blind might pay", "Because kings are high cards"]
  answer: 1
  explain: "Your Ante and Blind are already in. Pick the option that loses least."
- q: Which is the best preflop play?
  hand: { hole: Js 8s }
  options: ["Bet 4x", "Bet 3x", "Check"]
  answer: 0
  explain: "Suited jacks need an 8 or better: J8s+. It's close (0.011 antes), but 4x."
- q: Which mistake costs more per hour at the same table?
  options: ["Betting 4x with K4o every time", "Checking pocket aces every time"]
  answer: 1
  explain: "About $1.91 an hour for the aces vs about 6¢ for K4o, at $10 and 30 hands an hour."
```
---

### Lesson 9: `flop-raise`: The flop: raise 2x or check

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 8` · summary: "Hidden pairs, two pair and good flush draws are 2x hands."

**Objectives**

* Know the three kinds of flop that are worth a 2x bet.
* Tell a **hidden pair** (one of your cards pairs) from a pair that sits on the board.
* Use the EV sheet to see how much a 2x bet is worth.

**Lesson**

You checked before the flop, so your hand wasn't strong enough for 4x. Now three community cards are out
and you know much more. **Bet 2x** when the flop gives you any of these:

1. **Two pair or better** that uses at least one of your cards. Examples: {{Qc 5d}} on {{Qs 5h 9d}}, or
   {{6s 5s}} on {{6h 6d Kc}}.
2. **A hidden pair**: one of your cards pairs the board, or you hold a pocket pair. The one exception is
   **pocket deuces**. Example: {{9s 7d}} on {{9h Kc 2s}}.
3. **Four to a flush, with a ten or better of that suit in your hand.** Example: {{Th 4h}} on {{Jh 8h 2c}}.

**Check everything else.** That includes a pair that's only on the board, straight draws, and weak flush draws.

A hidden pair is the key idea. If the flop is {{Ks Kd 4c}}, those kings belong to the dealer as much as to
you, so "you have a pair of kings" means nothing. But a pair that uses your card, even a small one, puts you
ahead of every dealer hand that missed.

| You | Flop | Bet 2x | Check | Best |
|---|---|---|---|---|
| {{9s 7d}} | {{9h Kc 2s}} | **+0.866** | +0.429 | 2x (hidden pair) |
| {{7c 6d}} | {{Kh 7s 2d}} | **+0.641** | +0.267 | 2x (hidden pair) |
| {{8h 3c}} | {{Ah Kd 3s}} | **−0.180** | −0.315 | 2x (even bottom pair) |
| {{Qc 5d}} | {{Qs 5h 9d}} | **+2.517** | +1.726 | 2x (two pair) |
| {{Th 4h}} | {{Jh 8h 2c}} | **+0.349** | +0.318 | 2x (flush draw, ten in hand) |
| {{9h 4h}} | {{Jh 8h 2c}} | +0.174 | **+0.261** | Check (flush draw, nine high) |
| {{9c 8d}} | {{Ks Kd 4c}} | −1.548 | **−1.144** | Check (pair only on the board) |

Look at {{8h 3c}} on {{Ah Kd 3s}}. A pair of threes isn't pretty, and the hand loses money however you play
it. But betting 2x loses less than checking, because the dealer misses this flop most of the time.

:::tip
This chapter is about the lowest possible edge, so the EV sheet always shows the **exact** best play. These
three rules match it almost every time. Following them, with a perfect river, costs only **0.09% of the
Ante** compared with perfect flop play. Lesson 10 shows where they slip.
:::

:::math How the flop EV is computed
For a flop decision the app goes through every turn and river pair (C(47, 2) = 1,081) and every dealer hand
(C(45, 2) = 990): **1,070,190 showdowns**.
* Bet 2x: EV = average over all showdowns of the settled result with Play = 2.
* Check: for each turn and river, take the better of "play 1x" and "fold (−2)", then average.

{{9s 7d}} on {{9h Kc 2s}}: EV(2x) = 154367/178365 ≈ 0.8655; EV(check) = 10203/23782 ≈ 0.4290.
:::

**Simulator scenes**

```scene
id: l09-s1
title: Hidden pair, bet 2x
table: { bankroll: 50000, ante: 1000, trips: 0 }
deals:
  - { player: [9s, 7d], flop: [9h, Kc, 2s] }
seed: 901
allowed: [deal, check, play-2]
showEv: true
steps:
  - say: "Tap **Deal**, then **Check**: nine-seven offsuit isn't a 4x hand."
    completeWhen: { street: flop }
  - say: "Your 9 pairs the board: a **hidden pair**. Check the EV sheet, then bet **2x**."
    completeWhen: { best: true }
```

```scene
id: l09-s2
title: Three flops, three calls
table: { bankroll: 100000, ante: 1000, trips: 0 }
deals:
  - { player: [Th, 4h], flop: [Jh, 8h, 2c] }
  - { player: [9h, 4h], flop: [Jh, 8h, 2c] }
  - { player: [9c, 8d], flop: [Ks, Kd, 4c] }
seed: 902
allowed: [deal, check, play-2, play-1, fold]
showEv: true
steps:
  - say: "Hand 1: deal, check preflop, then decide on the flop. Four hearts, with the ten of hearts in your hand."
    completeWhen: { best: true }
  - say: "Finish the hand. Hand 2: the same flop, but your best heart is the nine."
    completeWhen: { best: true }
  - say: "Hand 3: a pair of kings on the board, nothing in your hand."
    completeWhen: { best: true }
```

```quiz
- q: You checked preflop. What's the best flop play?
  hand: { hole: 7c 6d, board: Kh 7s 2d }
  options: ["Bet 2x", "Check"]
  answer: 0
  explain: "Your 7 pairs the board: a hidden pair. Bet 2x."
- q: What's the best flop play?
  hand: { hole: 9c 8d, board: Ks Kd 4c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "The pair of kings is on the board. The dealer has it too. Check."
- q: What's the best flop play?
  hand: { hole: Th 4h, board: Jh 8h 2c }
  options: ["Bet 2x", "Check"]
  answer: 0
  explain: "Four to a flush with a ten of hearts in your hand. Bet 2x."
- q: What's a "hidden pair"?
  options: ["A pair on the board", "A pair that uses at least one of your two cards", "Any pocket pair, including deuces", "A pair the dealer can't see"]
  answer: 1
  explain: "One of your cards pairs the board, or you hold a pocket pair. On the flop, pocket deuces are the exception."
```

---

### Lesson 10: `flop-tricky-boards`: Tricky flops: paired boards, draws, small pairs

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 7` · summary: "Where the flop rules need care, and where they're slightly wrong."

**Objectives**

* Handle pocket deuces, paired boards and straight draws on the flop.
* Know the few spots where the three flop rules disagree with perfect play.
* Trust the EV sheet when it disagrees with a rule of thumb.

**Lesson**

The flop rules from lesson 9 are short on purpose. Here are the cases that trip people up.

**Pocket deuces.** You checked them preflop, and they stay a check on a flop like {{Kd 9c 5h}}: **−0.861**
for checking against **−0.964** for 2x. Any dealer pair beats them.

**"Two pair" made from the board's pair.** {{2c 2d}} on {{9s 9h 5c}} is technically two pair, nines and
deuces. But the nines belong to everyone, and your deuces are the lowest pair there is. Perfect play
**checks** (−0.131 vs −0.284 for 2x). The simple rule says "two pair, bet 2x" here, which is one of its
rare mistakes.

**Straight draws.** An open-ended draw like {{9c 8d}} on {{Ts 7h 2c}} is a **check** (−0.140 vs −0.235).
A straight comes only about 1 time in 3 by the river, and you can wait and play 1x when it does. With a
higher draw like {{Tc 8d}} on {{Js 9c 4h}}, the two options are dead even (−0.1526 vs −0.1532). Either is fine.

**Flush draw plus straight draw.** {{7h 6h}} on {{8h 5c 2h}} has a flush draw (no high heart in hand) and an
open-ended straight draw. Perfect play bets **2x** (+1.123 vs +1.044), but the simple rule checks because
your best heart is only a seven. It's a small slip.

**Overcards.** {{Kc 3d}} on {{8s 5h 2c}}: king high with no pair. **Check** (−1.108 vs −1.373), and decide on
the river.

**Trips on a paired board.** {{Jd 5c}} on {{5h 5s Kc}} is three fives, using your card. Bet **2x** (+3.845 vs +2.956).

Put together, all of these slips cost very little. Using the three flop rules instead of perfect flop play
costs **0.086% of the Ante**: about 26¢ an hour at $10. In this chapter the EV sheet always shows you the
exact answer.

**Simulator scenes**

```scene
id: l10-s1
title: Tricky flops
table: { bankroll: 100000, ante: 1000, trips: 0 }
deals:
  - { player: [2c, 2d], flop: [9s, 9h, 5c] }
  - { player: [9c, 8d], flop: [Ts, 7h, 2c] }
  - { player: [7h, 6h], flop: [8h, 5c, 2h] }
  - { player: [Jd, 5c], flop: [5h, 5s, Kc] }
seed: 1001
allowed: [deal, check, play-2, play-1, fold]
showEv: true
steps:
  - say: "Hand 1: deuces on a board with a pair of nines. Deal, check, and make the flop decision."
    completeWhen: { best: true }
  - say: "Hand 2: an open-ended straight draw."
    completeWhen: { best: true }
  - say: "Hand 3: a flush draw and a straight draw together."
    completeWhen: { best: true }
  - say: "Hand 4: three fives, one of them yours."
    completeWhen: { best: true }
```

```quiz
- q: What's the best flop play?
  hand: { hole: 2c 2d, board: Kd 9c 5h }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Pocket deuces are the one pair you check on the flop."
- q: What's the best flop play?
  hand: { hole: 9c 8d, board: Ts 7h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Straight draws are checks. You can play 1x on the river if the straight comes."
- q: How much does following the three flop rules (instead of perfect flop play) cost?
  options: ["About 0.09% of the Ante", "About 1% of the Ante", "About 5% of the Ante", "Nothing"]
  answer: 0
  explain: "0.086% of the Ante, with a perfect river. About 26¢ an hour at $10."
```

---

### Lesson 11: `river-call-or-fold`: The river: play 1x or fold

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 8` · summary: "Folding costs 2 antes for sure. Play 1x when that's worse."

**Objectives**

* Compare playing 1x with folding, using the fact that folding always costs exactly 2 antes.
* Know that you need to win only **about 1 time in 5** for 1x to beat folding.
* Play 1x with any hidden pair or better.

**Lesson**

You've checked twice and all five community cards are out. Now it's **play 1x or fold**.

Folding is easy to price: you lose your Ante and your Blind, **exactly 2 antes**, every time. So the
question is: **does playing 1x lose less than 2 antes on average?**

If you play 1x and win, you collect on Play and usually on the Ante (+2). If you lose, you lose Ante, Blind
and Play (−3). You're only putting 1 extra Ante at risk, to protect the 2 you'd give up by folding. That's
why the bar is low: when the dealer qualifies, **winning about 1 time in 5 is enough**.

Rule one is simple: **with a hidden pair or better, always play 1x.** {{Td 4c}} on {{Ts Kh 7d 3s 2c}}
(a pair of tens) has an EV of **+0.261** for 1x against −2 for folding.

Without a pair it's closer, and you need to know how many dealer hands beat you. Lesson 12 shows a
quick way to count. For now, look at the EV sheet:

| You | Board | Play 1x | Fold | Best |
|---|---|---|---|---|
| {{Td 4c}} | {{Ts Kh 7d 3s 2c}} | **+0.261** | −2 | 1x (hidden pair) |
| {{Qc 7d}} | {{Kd Jh 9s 5c 2d}} | **−1.821** | −2 | 1x (queen high, but enough wins) |
| {{8c 6d}} | {{Kh Qs 4d 3c 2h}} | −2.492 | **−2** | Fold (eight high) |
| {{4c 3d}} | {{As Ks Qs Jd Th}} | **−0.136** | −2 | 1x (the board plays: mostly ties) |

{{Qc 7d}} loses money either way. Playing 1x loses 1.82 antes on average and folding loses 2, so you play.
Your queen high beats every dealer hand that didn't pair, and when the dealer doesn't qualify your
Ante can't lose.

When the board makes the best hand for everyone, as with {{As Ks Qs Jd Th}}, always play 1x. Most of the
time it's a tie and everything pushes, which is much better than losing 2 antes.

:::math The "1 in 5" bar
Ignore ties and Blind bonuses for a moment, and say the dealer qualifies. Play 1x: win +2 (Ante + Play), lose
−3 (Ante + Blind + Play). EV(1x) = 2w − 3(1 − w) = 5w − 3, which beats −2 when **w > 1/5**.

When the dealer doesn't qualify, the Ante pushes. Then a win pays +1 (Play) and a loss costs −2 (Blind +
Play), so EV(1x) = w − 2(1 − w) = 3w − 2, which beats −2 for **any** w > 0. Against a dealer who missed,
playing is never worse than folding. That's why "queen high" can be a 1x hand: many of its wins come
against dealers who don't qualify.

Exact for {{Qc 7d}} on {{Kd Jh 9s 5c 2d}}: of 990 dealer hands, you beat 256 (all non-qualifying), tie 9
and lose to 725 (609 qualifying, 116 not). EV(1x) = (256 × 1 − 609 × 3 − 116 × 2) / 990 = −601/330 ≈ −1.821.
:::

**Simulator scenes**

```scene
id: l11-s1
title: Play or fold?
table: { bankroll: 100000, ante: 1000, trips: 0 }
deals:
  - { player: [Td, 4c], flop: [Kh, 7d, 3s], turn: Ts, river: 2c }
  - { player: [Qc, 7d], flop: [Kd, Jh, 9s], turn: 5c, river: 2d }
  - { player: [8c, 6d], flop: [Kh, Qs, 4d], turn: 3c, river: 2h }
  - { player: [4c, 3d], flop: [As, Ks, Qs], turn: Jd, river: Th }
seed: 1101
allowed: [deal, check, play-1, fold]
showEv: true
steps:
  - say: "Four river decisions. For each hand: Deal, check, check, then **play 1x or fold**. Hand 1."
    completeWhen: { best: true }
  - say: "Hand 2: queen high."
    completeWhen: { best: true }
  - say: "Hand 3: eight high."
    completeWhen: { best: true }
  - say: "Hand 4: the board is a royal straight."
    completeWhen: { best: true }
```

```quiz
- q: How much does folding on the river cost?
  options: ["1 Ante", "2 Antes", "3 Antes", "It depends on the dealer's cards"]
  answer: 1
  explain: "You give up your Ante and Blind: exactly 2 antes."
- q: You have a hidden pair on the river. What's the play?
  options: ["Always play 1x", "Fold unless it's a high pair", "Play 1x only if the board has no flush draw", "Fold"]
  answer: 0
  explain: "A hidden pair or better is always worth playing."
- q: Why can playing 1x be right even when its EV is negative (say −1.8 antes)?
  options: ["It can't", "Because folding is −2, which is worse", "Because the Blind might pay", "Because of the Trips bet"]
  answer: 1
  explain: "Compare it with folding, not with zero."
- q: What's the best river play?
  hand: { hole: 4c 3d, board: As Ks Qs Jd Th }
  options: ["Play 1x", "Fold"]
  answer: 0
  explain: "The board plays, so it's usually a tie. Playing 1x costs 0.136 antes on average, and folding costs 2."
```

---

### Lesson 12: `counting-dealer-outs`: Counting the dealer's outs

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 9` · summary: "Fewer than 21 cards that beat you: play 1x."

**Objectives**

* Count the dealer's **outs**: unseen cards that, in the dealer's hand, would beat you.
* Use the rule: no hidden pair, but **fewer than 21 outs** → play 1x; otherwise fold.
* Know where the rule is slightly off.

**Lesson**

Without a hidden pair, you need a quick way to tell "queen high, play it" from "eight high, fold it".
The trick is to imagine **one** card in the dealer's hand and ask: **which cards would beat me?** Those
are the dealer's **outs**. You can see 7 cards, which leaves 45 unseen.

How to count, step by step:

1. **Pairs with the board.** Every board card you don't pair gives the dealer 3 outs (the three other
   cards of that rank). Five unpaired board ranks = **15 outs**.
2. **Higher kickers.** Every rank that beats your best card, and isn't on the board, adds 4 outs. A
   card you hold counts as seen.
3. **Straights and flushes.** Add any single card that would complete one for the dealer.

Then: **fewer than 21 outs → play 1x. 21 or more → fold.**

Example 1. {{Qc 7d}} on {{Kd Jh 9s 5c 2d}}. Board pairs: K, J, 9, 5, 2 = 15. Higher than your queen and
not on the board: only the ace = 4. No straight or flush is one card away. **19 outs → play 1x.**

Example 2. {{8c 6d}} on {{Kh Qs 4d 3c 2h}}. Board pairs = 15. Cards that beat your K-Q-8 kicker: aces,
jacks, tens and nines = 16. **31 outs → fold.**

Example 3. {{Jd 8c}} on the same board {{Kh Qs 4d 3c 2h}}. Board pairs = 15, and only aces beat your
K-Q-J = 4. **19 outs → play 1x.** One card made the difference.

Example 4. {{Jc 9d}} on {{8s 8h 5c 3d 2s}}. The board is paired, so you're playing 8-8 with J-9-5. The
dealer beats you with an ace, king or queen kicker (12), a 5, 3 or 2 for two pair (9), or the last two
eights (2). **23 outs → fold.**

**How good is the rule?** Very good. In a random sample of 3,000 river spots, it disagreed with perfect
play on about 1 in 90. Nearly all of those are at 19 or 20 outs, where perfect play folds by a few
hundredths of an Ante. One example is {{2c 4h}} on {{Qc Qh Kh Qs 9d}}: 19 outs, but folding is better
(1x is −2.124). Following the rule instead of perfect river play costs **0.11% of the Ante**, about 33¢
an hour at $10.

:::tip
On a board with four of one suit, a hidden pair isn't always enough: {{6d 5s}} on {{Kh 6h 8h 7c Qh}} is a
fold (1x is −2.034), because any heart beats you. The EV sheet will show it. It's rare enough that the
practical rule ignores it.
:::

**Simulator scenes**

```scene
id: l12-s1
title: Count, then decide
table: { bankroll: 100000, ante: 1000, trips: 0 }
deals:
  - { player: [Jd, 8c], flop: [Kh, Qs, 4d], turn: 3c, river: 2h }
  - { player: [Jc, 9d], flop: [8s, 8h, 5c], turn: 3d, river: 2s }
  - { player: [6s, 5d], flop: [Kh, Kd, 9c], turn: 9s, river: 3h }
seed: 1201
allowed: [deal, check, play-1, fold]
showEv: true
steps:
  - say: "Hand 1: Deal, check, check. Count the dealer's outs before you look at the EV sheet: board pairs, higher cards, straights and flushes."
    completeWhen: { best: true }
  - say: "That was 19 outs. Hand 2: a paired board."
    completeWhen: { best: true }
  - say: "23 outs. Hand 3: two pair on the board, and your best card is a six."
    completeWhen: { best: true }
  - say: "28 outs (aces, queens, jacks, tens, eights and sevens beat your kicker, plus kings and nines for a full house): fold."
    completeWhen: { next: true }
```

```quiz
- q: No hidden pair. The dealer has 19 outs. What's the play?
  options: ["Play 1x", "Fold"]
  answer: 0
  explain: "Fewer than 21 outs: play 1x."
- q: How many outs does the dealer have here?
  hand: { hole: 8c 6d, board: Kh Qs 4d 3c 2h }
  options: ["15", "19", "27", "31"]
  answer: 3
  explain: "15 board pairs, plus 16 for aces, jacks, tens and nines, which beat your K-Q-8. Fold."
- q: Each unpaired board card gives the dealer how many outs?
  options: ["1", "2", "3", "4"]
  answer: 2
  explain: "The three other cards of that rank."
```

---

### Lesson 13: `strategy-lowest-edge`: Perfect strategy I: the whole picture

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 7` · summary: "Everything on one page, and what 'perfect' can and can't do."

**Objectives**

* State the whole perfect strategy on one page.
* Know its exact price: **2.185% of the Ante**, about 22¢ a hand at $10.
* Know what perfect play can't do: no strategy beats the game.

**Lesson**

Here's the lowest-edge strategy for the standard Blind paytable:

**Preflop.** Bet **4x** with: 33+, any ace, any suited king, K5o+, Q6s+, Q8o+, J8s+, JTo. Otherwise check.
Never bet 3x.

**Flop.** Bet **2x** with two pair or better (using your cards), a hidden pair (not pocket deuces) or four
to a flush with a ten or better of that suit in hand. Otherwise check. Perfect play differs in a few rare
spots (lesson 10), and the EV sheet always shows the exact answer.

**River.** Play **1x** with a hidden pair or better, or when the dealer has fewer than 21 outs. Otherwise
fold. Again, the EV sheet shows the rare exceptions.

What happens over the long run when you play this way:

| Decision | Share of hands |
|---|---|
| Bet 4x preflop | 37.7% |
| Bet 2x on the flop | 21.3% |
| Play 1x on the river | 21.8% |
| Fold on the river | 19.2% |

On average you'll have **4.15 antes** in action per hand, and lose **2.185% of one Ante** per hand. At a $10
Ante and 30 hands an hour, that's an expected cost of **$6.55 an hour**.

**What perfect means, and what it doesn't.** No decision you make can give you an edge over the house.
"Perfect" means you lose the least possible: 2.19% of the Ante. It doesn't mean you'll win tonight, and it
doesn't make Trips or any other side bet cheaper.

```chart
strategy: perfect
view: preflop-grid
```

:::math The exact numbers
EV per hand = −50643648973/2317817502000 ≈ −0.0218497 antes.
P(4x) = 250/663 (500 of 1,326 hands). P(2x) = 1382947/6497400 ≈ 21.28%. P(1x) ≈ 21.82%. P(fold) ≈ 19.19%.
Average total wagered = 29163830173/7023689400 ≈ 4.1522 antes. Standard deviation ≈ 4.94 antes per hand.

These come from an exhaustive solve: every one of the 169 starting-hand kinds, all 19,600 flops, all 1,081
turn/river pairs and all 990 dealer hands, with the best decision at every step.
:::

**Simulator scenes**

```scene
id: l13-s1
title: Ten perfect hands
table: { bankroll: 100000, ante: 1000, trips: 0 }
seed: 1301
allowed: all
showEv: true
steps:
  - say: "Play 10 hands. Before you confirm each decision, check the EV sheet and choose the **Best play**."
    completeWhen: { handsPlayed: 10 }
  - say: "Open the **session** panel. Your decision cost vs perfect should read $0.00, and your result is just luck."
    completeWhen: { tap: session }
```

```quiz
- q: What's the house edge of UTH with perfect strategy (standard Blind)?
  options: ["0.53% of the Ante", "1.09% of the Ante", "2.19% of the Ante", "3.5% of the Ante"]
  answer: 2
  explain: "2.185% of the Ante. 0.53% is the element of risk (lesson 15)."
- q: What share of hands are 4x bets under perfect play?
  options: ["About 20%", "About 38%", "About 50%", "About 60%"]
  answer: 1
  explain: "37.7% (500 of 1,326 hands)."
- q: Which statement is true?
  options: ["Perfect play wins in the long run", "Perfect play loses about 22¢ a hand at a $10 Ante", "Perfect play has no variance", "Perfect play makes Trips free"]
  answer: 1
  explain: "2.185% × $10 ≈ $0.22 per hand on average."
```

---

### Lesson 14: `checkpoint-strategy` ✔: Checkpoint: perfect strategy

**Front matter:** `chapter: perfect-lowest-edge` · `minutes: 6` · summary: "Ten quick decisions across all three streets."

**Lesson**

Time to put it together. Each question is one decision. Answer from the rules, then play out the scene
to see the EV sheet agree.

**Simulator scenes**

```scene
id: l14-s1
title: One of each
table: { bankroll: 100000, ante: 1000, trips: 0 }
deals:
  - { player: [Ks, 6d] }
  - { player: [8h, 3c], flop: [Ah, Kd, 3s] }
  - { player: [Jd, 8c], flop: [Kh, Qs, 4d], turn: 3c, river: 2h }
seed: 1401
allowed: [deal, play-4, check, play-2, play-1, fold]
showEv: true
steps:
  - say: "Hand 1: preflop. Choose."
    completeWhen: { best: true }
  - say: "Hand 2: check preflop, then make the flop decision."
    completeWhen: { best: true }
  - say: "Hand 3: check, check, then make the river decision."
    completeWhen: { best: true }
```

```quiz
- q: Preflop. Best play?
  hand: { hole: Qh 6h }
  options: ["Bet 4x", "Bet 3x", "Check"]
  answer: 0
  explain: "Q6s+ suited queens are 4x."
- q: Preflop. Best play?
  hand: { hole: Qd 7c }
  options: ["Bet 4x", "Bet 3x", "Check"]
  answer: 2
  explain: "Offsuit queens need Q8o+."
- q: Preflop. Best play?
  hand: { hole: 3c 3d }
  options: ["Bet 4x", "Check"]
  answer: 0
  explain: "Pairs from 33 up are 4x."
- q: Flop. Best play?
  hand: { hole: Jc 4d, board: Js 9h 8c }
  options: ["Bet 2x", "Check"]
  answer: 0
  explain: "Hidden pair of jacks."
- q: Flop. Best play?
  hand: { hole: 9h 4h, board: Jh 8h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Flush draw, but your best heart is below a ten."
- q: Flop. Best play?
  hand: { hole: Kc 3d, board: 8s 5h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "King high and no pair: check, and decide on the river."
- q: River. Best play?
  hand: { hole: Qc 7d, board: Kd Jh 9s 5c 2d }
  options: ["Play 1x", "Fold"]
  answer: 0
  explain: "19 outs, fewer than 21."
- q: River. Best play?
  hand: { hole: 7d 5c, board: Jh 9s 8d 3c 2h }
  options: ["Play 1x", "Fold"]
  answer: 1
  explain: "15 board-pair outs, plus 16 cards (A, K, Q, T) that beat your J-9-8-7: 31. Fold."
- q: Which is never the best play?
  options: ["Bet 4x", "Bet 3x", "Check preflop", "Fold on the river"]
  answer: 1
  explain: "3x is always beaten by 4x or by checking."
- q: Over many hands, what does perfect play cost at a $10 Ante, 30 hands an hour?
  options: ["About $0.66 an hour", "About $6.55 an hour", "About $16 an hour", "Nothing"]
  answer: 1
  explain: "30 × $10 × 2.185% ≈ $6.55."
```
---

### Lesson 15: `edge-vs-risk`: House edge, element of risk and cost per hour

**Front matter:** `chapter: perfect-practical` · `minutes: 7` · summary: "Three honest numbers for the same game, and the one that pays your bills."

**Objectives**

* Tell apart house edge per Ante, edge per initial wager, and element of risk.
* Convert any edge into expected dollars per hour.
* Know why "UTH has a 0.53% edge" and "UTH has a 2.19% edge" are both true.

**Lesson**

You'll see three different numbers quoted for UTH's house edge. They all describe the same game; they just
divide the same expected loss by different things.

| Name | Divides the expected loss by | Perfect play |
|---|---|---|
| **House edge per Ante** | your Ante | **2.185%** |
| Edge per initial wager | your Ante + Blind | 1.092% |
| **Element of risk** | everything you put in action, raises included (4.15 antes on average) | **0.526%** |

The app uses **per Ante** as its headline number, because it turns straight into money. Your expected cost
per hand is 2.185% of your Ante, whatever happens with the raises. Element of risk is the fairer way to
compare UTH with a game like blackjack, where most of the money you bet is the money you start with. In
UTH you add a raise on most hands, so per dollar in action the edge is a quarter as big.

**Cost per hour** is what actually leaves your pocket:

> cost per hour = hands per hour × Ante × edge per Ante

At the app's default of **30 hands an hour**:

| Ante | Perfect play | Basic card (lesson 16) |
|---|---|---|
| $5 | $3.28 / hour | $3.57 / hour |
| $10 | $6.55 / hour | $7.14 / hour |
| $25 | $16.39 / hour | $17.86 / hour |

Real tables run anywhere from about 20 to 40 hands an hour, depending on how many players there are and
how fast the dealer is. Change it in **Settings → Hands per hour**, and every per-hour figure in the app
scales with it.

:::math Exact definitions
Expected loss per hand (perfect) L = 50643648973/2317817502000 antes.
* Per Ante: L / 1 ≈ 2.1850%.
* Per initial wager: L / 2 ≈ 1.0925%.
* Element of risk: L / E[total wagered], with E[total wagered] = 2 + 4·P(4x) + 2·P(2x) + 1·P(1x) =
  29163830173/7023689400 ≈ 4.1522 antes, so EoR = 50643648973/9624063957090 ≈ 0.5262%.

A folded hand counts as 2 antes wagered.
:::

```quiz
- q: Which number is the expected cost per hand as a share of your Ante, under perfect play?
  options: ["0.53%", "1.09%", "2.19%", "4.15%"]
  answer: 2
  explain: "2.185% of the Ante. 0.53% is per dollar in action, and 4.15 is the average antes in action per hand."
- q: $10 Ante, 30 hands an hour, perfect play. Expected cost per hour?
  options: ["About $0.66", "About $1.60", "About $6.55", "About $12.45"]
  answer: 2
  explain: "30 × $10 × 2.185% ≈ $6.55."
- q: Why is the element of risk smaller than the house edge per Ante?
  options: ["It ignores losing hands", "It divides by all the money in action, raises included", "It only counts the Blind", "It assumes you never fold"]
  answer: 1
  explain: "Same expected loss, divided by about 4.15 antes instead of 1."
```

---

### Lesson 16: `strategy-practical`: Perfect strategy II: the card you can remember

**Front matter:** `chapter: perfect-practical` · `minutes: 8` · summary: "A strategy card that costs 59¢ an hour more than perfect."

**Objectives**

* Play the **basic** card from memory, and know its exact cost: 0.196% of the Ante.
* Know the lighter **simple** card and its cost: 0.52% of the Ante.
* Know which part of any card you must never simplify: the river.

**Lesson**

The EV sheet plays perfectly, but at a real table you only have your memory. Here's the card that most
strong players use, with the exact price of each version.

**The basic card**

* **Preflop: bet 4x** with 33+, any ace, any suited king, K5o+, Q6s+, Q8o+, J8s+, JTo. Otherwise check.
* **Flop: bet 2x** with two pair or better (using your cards), a hidden pair (not pocket deuces), or four to
  a flush with a ten or better of that suit in hand. Otherwise check.
* **River: play 1x** with a hidden pair or better, or fewer than 21 dealer outs. Otherwise fold.

You know this already. It's what Perfect strategy I taught, minus the EV sheet's rare exceptions.

**The simple card** (for when even that's too much)

* **Preflop: bet 4x** with 33+, any ace, any king, Q8+ (suited or not), JT. Otherwise check.
* **Flop: bet 2x** with two pair or better or any hidden pair (not pocket deuces). Otherwise check.
* **River:** the same as the basic card. **Don't simplify the river.**

| Strategy | House edge per Ante | Extra cost vs perfect | Extra per hour at $10 |
|---|---|---|---|
| Perfect (EV sheet) | 2.185% | — | — |
| Basic card | 2.381% | 0.196% | **$0.59** |
| Basic card without the flush rule | 2.449% | 0.264% | $0.79 |
| Simple card | 2.708% | 0.523% | **$1.57** |

**Why the river matters most.** Every shortcut that drops the outs count costs about **5% of the Ante**,
far more than all the other simplifications put together. "Play 1x only with a pair" sounds safe, but it
folds hands that win often enough. Even with the chart's preflop rules, a pair-only river raises the edge
from 2.19% to **7.35%**. Simplifying preflop to "any pair or ace" costs 3.5% on its own. Keep the chart's preflop rules and
the outs count, and you're within pennies of perfect.

```chart
strategy: basic
view: preflop-grid
```

**A practical session, at $10 and 30 hands an hour**

* Expected cost: about **$7.14 an hour** with the basic card.
* Money in action: about **$1,249 an hour** (4.16 antes per hand).
* Bring a bankroll that fits the swings (lesson 17). Practise in Drill until the card is automatic.

:::math Where the basic card loses its 0.196%
Exact decomposition, each step changing one street:
* Perfect preflop + basic flop + perfect river (`expert`): 2.2714%, so the flop rule costs **0.086%**.
* Then the outs-count river instead of a perfect river: 2.3814%, so the river rule costs **0.110%**.
* The basic preflop rules are exactly the perfect ones, so preflop costs **0**.

Basic card EV = −54758439/2299422125 antes per hand. Simple card EV = −47068162901/1738363126500.
:::

```quiz
- q: How much more per hour does the basic card cost than perfect play, at $10 and 30 hands an hour?
  options: ["About 6¢", "About 59¢", "About $5", "About $15"]
  answer: 1
  explain: "0.196% × $10 × 30 ≈ $0.59."
- q: Which shortcut costs the most?
  options: ["Dropping the flush-draw rule on the flop", "Using 'any king' preflop", "Playing the river 1x only with a pair", "Checking pocket deuces"]
  answer: 2
  explain: "Dropping the outs count on the river costs about 5% of the Ante. The others cost tenths of a percent or less."
- q: With the simple card, what do you do with K3o preflop?
  options: ["Bet 4x", "Check"]
  answer: 0
  explain: "The simple card bets 4x with any king. (Perfect play checks K3o, a small mistake that's part of the simple card's price.)"
```

---

### Lesson 17: `variance-and-bankroll`: Swings, sessions and bankroll

**Front matter:** `chapter: perfect-practical` · `minutes: 9` · summary: "What a normal hour looks like, and how much to bring."

**Objectives**

* Know how big UTH's swings are: about **5 antes per hand** and **27 antes per hour**.
* Read a session chart: the expected line against actual results.
* Choose a bankroll from the bust-risk table.

**Lesson**

A 2.19% edge is tiny next to the swings. In one hand you can win 6 antes or lose 6, and rarely win
hundreds (a royal flush pays 500 to 1 on the Blind). The **standard deviation** of one hand is about
**4.94 antes**. Over an hour of 30 hands it's about **27 antes**, while the expected loss is only 0.66
antes. In the short run, **luck is about 40 times bigger than the edge**.

Here's what an hour looks like with the basic card (≈ 1 million simulated hours of 30 hands, results in antes):

| Worst 10% of hours | Bottom quarter | Middle (median) | Top quarter | Best 10% |
|---|---|---|---|---|
| −29.5 or worse | −16 or worse | −1.5 | +13.5 or better | +27.5 or better |

About **52% of hours are losing hours**, and 48% are winning ones.

**How much to bring.** "Busting" here means dropping below 6 antes, when you can no longer cover a full 4x
hand. Chances of busting (≈ simulated, basic card, 30 hands an hour):

| Bankroll | Bust within 1 hour | Bust within 3 hours |
|---|---|---|
| 20 antes ($200 at $10) | 48% | 70% |
| 30 antes | 25% | 52% |
| 40 antes | 11% | 37% |
| 60 antes | 1.1% | 16% |
| 80 antes | 0.05% | 5.5% |
| 100 antes ($1,000 at $10) | ≈ 0% | 1.5% |

A good rule of thumb: **60 antes for an hour, 100 antes for an evening**. If that's more than you want to
risk, play a smaller Ante. Halving the Ante halves the cost and the swings.

Session rules that help:
* Set the bankroll **before** you sit down, and treat it as spent.
* Pick a time limit. The expected cost grows with every hand.
* A win goal ("stop if I'm up 30 antes") doesn't change your EV, but it lets good nights end as good nights.

:::math Where the swing figures come from
The standard deviation per hand under perfect play is exact: √24.3967 ≈ **4.94 antes** (basic card: 4.94 too).
An hour of 30 independent hands has SD ≈ 4.94 × √30 ≈ **27.1 antes**.

The percentiles and bust rates are **simulated** (30 million hands for the hour table, 200,000 sessions per
bankroll), so they're approximate. Real results are lumpy: about a third of the variance comes from rare
Blind bonuses such as royal flushes.
:::

**Simulator scenes**

```scene
id: l17-s1
title: 300 hands in a few seconds
table: { bankroll: 1000000, ante: 1000, trips: 0 }
seed: 1701
allowed: []
showEv: true
autoPlay: { hands: 300, strategy: expert, speed: fast }
steps:
  - say: "Tap **Auto-play 300**. The app plays near-perfectly for 10 hours of hands."
    completeWhen: { autoPlayDone: true }
  - say: "The dashed line is the expected result (about −$68). Your actual line wanders far above and below it. That's variance."
    completeWhen: { next: true }
```

```scene
id: l17-s2
title: Bankroll test
table: { bankroll: 40000, ante: 1000, trips: 0 }
seed: 1702
allowed: []
showEv: false
autoPlay: { hands: 90, strategy: basic, speed: fast, sessions: 100, chart: bust-rate }
steps:
  - say: "Run **100 sessions** of 3 hours each, starting with $400 (40 antes)."
    completeWhen: { autoPlayDone: true }
  - say: "Count the red lines that hit the floor. Expect roughly a third of sessions to bust."
    completeWhen: { next: true }
```

```quiz
- q: What's the standard deviation of one hand of UTH, in antes?
  options: ["About 0.5", "About 2", "About 5", "About 27"]
  answer: 2
  explain: "About 4.94 antes per hand; about 27 per 30-hand hour."
- q: You play an hour at $10 with perfect strategy. Which result is most typical?
  options: ["Exactly −$6.55", "Somewhere between about −$300 and +$280", "Always a small loss", "Always a small win"]
  answer: 1
  explain: "The expected loss is $6.55, but 80% of hours land between about −30 and +28 antes."
- q: Which bankroll gives about a 1-in-100 chance of busting within an hour at a $10 Ante?
  options: ["$200", "$400", "$600", "$100"]
  answer: 2
  explain: "60 antes: about 1.1% within an hour (simulated)."
```

---

### Lesson 18: `costly-habits`: What common habits really cost

**Front matter:** `chapter: perfect-practical` · `minutes: 6` · summary: "The leaks players actually have, priced exactly."

**Objectives**

* Price the common mistakes: betting 3x, never betting the flop, playing too cautiously, never folding.
* Know that playing too cautiously costs far more than playing too boldly with good hands.

**Lesson**

Each line below is a whole strategy played the same way every hand, with everything else perfect. The
figures are exact, at a $10 Ante and 30 hands an hour.

| Habit | House edge per Ante | Cost per hour | Extra vs perfect |
|---|---|---|---|
| Perfect play | 2.19% | $6.55 | — |
| Basic card | 2.38% | $7.14 | $0.59 |
| Simple card | 2.71% | $8.12 | $1.57 |
| 4x only with pairs and aces | 5.65% | $16.94 | $10.39 |
| Never bet 2x on the flop | 9.42% | $28.26 | $21.70 |
| Bet 3x instead of 4x | 9.86% | $29.58 | $23.02 |
| Check to the river, then play perfectly | 32.03% | $96.10 | $89.55 |
| Never fold (check, check, always 1x) | 40.70% | $122.11 | $115.56 |
| Bet 4x on every hand | 40.70% | $122.11 | $115.56 |
| Check to the river, play 1x only with a pair | 50.04% | $150.12 | $143.56 |

Three lessons hide in that table.

1. **Waiting is expensive.** "I'll see all the cards first" sounds careful, but it multiplies your cost by
   almost 15. The 4x and 2x bets are where your edge comes from. Strong hands need big bets **early**.
2. **Folding is a skill.** Never folding costs nearly as much as betting 4x on every hand. In fact, both
   cost exactly the same, because if you play every hand to the end, the Play bet is a coin flip and
   only its size changes.
3. **Bet size matters.** 3x leaves a quarter of your best bets on the table. Always choose 4x when you raise
   preflop.

```scene
id: l18-s1
title: Careful vs perfect
table: { bankroll: 1000000, ante: 1000, trips: 0 }
seed: 1801
allowed: []
showEv: true
autoPlay: { hands: 300, strategy: expert, speed: fast, compare: [expert, check-to-river] }
steps:
  - say: "Run both strategies on the **same cards** for 300 hands: near-perfect play vs 'check to the river'."
    completeWhen: { autoPlayDone: true }
  - say: "The expected lines say it all: about −$68 vs about −$961 over 300 hands. Results wobble, but the gap is real."
    completeWhen: { next: true }
```

```quiz
- q: Which habit costs the most?
  options: ["Betting 3x instead of 4x", "Checking every hand to the river and playing only with a pair", "Using the basic card", "Never betting the flop"]
  answer: 1
  explain: "50% of the Ante: about $150 an hour at $10."
- q: Why do "never fold" and "bet 4x every hand" cost exactly the same?
  options: ["Coincidence", "If every hand goes to showdown, the Play bet is a coin flip, so its size doesn't change the EV", "Because the Blind pays the same", "They don't"]
  answer: 1
  explain: "Over every possible deal you win and lose equally often, so the Play bet's EV is zero at any size."
- q: The best fix for a player who checks every hand to the river is…
  options: ["Fold more", "Bet 4x preflop with the chart hands", "Add the Trips bet", "Bet 3x instead"]
  answer: 1
  explain: "Early raises with strong hands are where the game's value is."
```
---

### Lesson 19: `trips-bet`: The Trips bet

**Front matter:** `chapter: perfect-fun` · `minutes: 7` · summary: "A side bet on your own hand. Its price depends entirely on the paytable."

**Objectives**

* Settle the Trips bet: paid on **your** best five of seven, win or lose, even after a fold.
* Read a Trips paytable and know its edge: **1.90%** on the standard 8-6-5 table, from 0.90% to 6.52% elsewhere.
* Know that Trips never changes the right play.

**Lesson**

**Trips** is an optional bet you make before the deal. It pays if your final hand (your two cards plus the
five on the board) is **three of a kind or better**. The dealer's hand doesn't matter, and neither does
whether you fold. The standard table (`trips-8-6-5`):

| Your hand | Pays | How often |
|---|---|---|
| Royal flush | 50 to 1 | 1 in 30,940 |
| Straight flush | 40 to 1 | 1 in 3,591 |
| Four of a kind | 30 to 1 | 1 in 595 |
| Full house | 8 to 1 | 1 in 38.5 |
| Flush | 6 to 1 | 1 in 33.1 |
| Straight | 5 to 1 | 1 in 21.6 |
| Three of a kind | 3 to 1 | 1 in 20.7 |
| Anything less | loses | 84.7% |

It pays **about 1 hand in 6.5** (15.3%), or about 4.6 times an hour. The house edge is **1.90%** of the
Trips bet: a little cheaper than the main game per Ante, and a fair price for the excitement.

**The paytable is everything.** Casinos change the middle rows, and small changes matter a lot:

| Table (Full house / Flush / Straight) | House edge | Cost per hour, $5 Trips | Tier |
|---|---|---|---|
| 9 / 7 / 4 | 0.90% | $1.35 | Good bet |
| **8 / 6 / 5 (standard)** | **1.90%** | **$2.86** | Good bet |
| 8 / 7 / 4 | 3.50% | $5.25 | Fair |
| 7 / 6 / 5 | 4.50% | $6.75 | Fair |
| 8 / 6 / 4 | 6.52% | $9.79 | Costly |

Read the felt before you bet. If the straight pays 4 and the flush 6, walk to the next table.

**Trips never changes your play.** Its result depends only on your cards, not on any decision you make.
Keep playing the main game by the chart. Don't make bigger raises because Trips is riding.

:::math The Trips EV, row by row (8-6-5 table)
EV per $1 = Σ P(hand) × (pays) − P(lose):
royal 0.0016 + straight flush 0.0111 + quads 0.0504 + full house 0.2077 + flush 0.1815 + straight 0.2310 +
trips 0.1449 = 0.8283 returned on wins, minus 0.8473 lost on everything else = **−0.01904**.
Exact: −48987/2572780. The other tables: 9-7-4 −301629/33446140, 8-7-4 −233985/6689228,
7-6-5 −115779/2572780, 8-6-4 −545459/8361535.
:::

**Simulator scenes**

```scene
id: l19-s1
title: Trips pays, the hand loses
table: { bankroll: 50000, ante: 1000, trips: 500 }
deals:
  - { player: [7c, 7d], dealer: [Qh, 8s], flop: [7h, Ks, 9d], turn: Td, river: Jc }
allowed: [deal, play-4]
showEv: true
steps:
  - say: "You have $5 on Trips. Tap **Deal**, then bet **4x** with pocket sevens."
    completeWhen: { action: play-4 }
  - say: "Three sevens! The dealer makes a straight and wins the hand: Ante, Blind and Play lose (−$60). But Trips pays **3 to 1: +$15**."
    completeWhen: { next: true }
```

```quiz
- q: You fold on the river holding three of a kind (two of them on the board). What happens to your Trips bet?
  options: ["It loses with the fold", "It pushes", "It pays 3 to 1", "It pays only if the dealer qualifies"]
  answer: 2
  explain: "Trips is paid on your own hand, even after a fold."
- q: Which Trips paytable is the best for you?
  options: ["Full house 8, flush 6, straight 4", "Full house 8, flush 6, straight 5", "Full house 7, flush 6, straight 5", "Full house 8, flush 7, straight 4"]
  answer: 1
  explain: "8-6-5 is 1.90%. The others are 6.52%, 4.50% and 3.50%."
- q: Should you raise more often when you have a Trips bet?
  options: ["Yes", "No, Trips doesn't depend on your decisions"]
  answer: 1
  explain: "Your Trips result is fixed by your cards. Play the main game normally."
```

---

### Lesson 20: `other-side-bets`: Six Card Bonus, progressives and Bad Beat

**Front matter:** `chapter: perfect-fun` · `minutes: 7` · summary: "The bets the app doesn't deal, and what they cost."

**Objectives**

* Know what the Six Card Bonus, progressive and Bad Beat bets are.
* Know their typical edges, and how to price any posted table.
* Know when, if ever, a progressive is worth playing.

**Lesson**

Some UTH tables offer more side bets. The app doesn't deal them, but here's what they cost.

**Six Card Bonus.** It pays on the best five cards out of six: your two hole cards plus four more. On the
common 1000/200/100/20/15/10/7 table (royal, straight flush, quads, full house, flush, straight, trips),
the house edge is **8.56%**. On a 1000/200/50/20/15/10/5 table it's **19.36%**. A $5 Six Card bet costs about
**$12.84 an hour** at the better table, four times what $5 on Trips costs.

**Progressive jackpot.** It's usually a $1 to $5 bet on your two hole cards plus the flop. It pays a share
of a growing meter for a royal flush (100%) or straight flush (often 10%), and fixed amounts for smaller
hands. A royal in those five cards comes 1 time in **649,740**. On one example $1 table (royal 100%,
straight flush 10%, quads $300, full house $50, flush $40, straight $30, trips $9):

| Meter | House edge | Cost per hour (30 hands) |
|---|---|---|
| $25,000 | 39.6% | $11.89 |
| $50,000 | 32.3% | $9.70 |
| $100,000 | 17.7% | $5.31 |
| ≈ $160,531 | 0% (break-even) | $0 |

Most meters sit far below break-even, so most progressives are among the most expensive bets in the casino.
Their tables vary, so the app gives you the method, not one number.

**Bad Beat.** It pays when your hand **loses** at showdown even though it's strong. Exact chances per hand that
your final hand is beaten by the dealer's:

| Your losing hand | Chance per hand |
|---|---|
| Three of a kind | 1 in 87 |
| Straight | 1 in 304 |
| Flush | 1 in 286 |
| Full house | 1 in 659 |
| Four of a kind | 1 in 11,810 |
| Straight flush | 1 in 540,043 |

Bad Beat tables vary widely, and some also pay the dealer's hand or every player at the table. To price
one, multiply each chance by its payout plus 1, add them up and subtract 1.

:::math Pricing any side bet
EV per $1 = Σ P(hand) × (payout + 1) − 1, where "payout" is "to 1". The probabilities come from exhaustive
counts: 6-card hands (20,358,520 in all, e.g. 188 royals), 5-card hands (2,598,960, 4 royals) and, for
Bad Beat, every showdown (2,781,381,002,400 player-dealer pairs).

Progressive example: fixed payouts return 0.5306 per $1, and each $1 of meter adds 19/6,497,400. Break-even
meter = (1 − 0.5306) × 6,497,400 / 19 ≈ $160,531.
:::

```quiz
- q: Which of these usually costs the most per hour, $5 a hand?
  options: ["Trips (8-6-5)", "Six Card Bonus (1000/200/100/20/15/10/7)", "The Ante with perfect strategy", "They're about equal"]
  answer: 1
  explain: "About $12.84 an hour for Six Card, vs $2.86 for Trips and $3.28 for a $5 Ante played perfectly."
- q: Why are most progressive bets expensive?
  options: ["They pay on the dealer's hand", "Most of their value is in a jackpot you hit about once in 650,000 hands, and the meter is usually far below break-even", "They're only offered at high-limit tables", "They change the main game's strategy"]
  answer: 1
  explain: "On the example table the bet breaks even only when the meter passes about $160,000."
```

---

### Lesson 21: `strategy-fun-per-dollar`: Perfect strategy III: the most fun per dollar

**Front matter:** `chapter: perfect-fun` · `minutes: 8` · summary: "Choose your evening's price, then spend it on what you enjoy."

**Objectives**

* Price a whole evening: main game plus side bets, per hour.
* Get more excitement for the same cost (smaller Ante plus a good Trips table).
* Spot the plans that cost a lot and add little.

**Lesson**

"Perfect" doesn't have to mean the lowest edge. If you enjoy the game, the question is: **how much fun can
I buy per dollar?** Here's what each plan costs, at 30 hands an hour (exact edges; Trips 8-6-5 unless noted):

| Plan | Expected cost / hour | What you get |
|---|---|---|
| $5 Ante, basic card | $3.57 | The cheapest way to play |
| **$5 Ante + $5 Trips** | **$6.43** | A side bet that pays about 4.6 times an hour, for less than a $10 Ante alone |
| $10 Ante, basic card | $7.14 | Twice the stakes |
| $10 Ante + $5 Trips | $10.00 | The "standard evening" |
| $10 Ante + $5 Trips at an 8-7-4 table | $12.39 | Same game, worse felt |
| $10 Ante + $1 progressive (meter $50,000) | $16.84 | A one-in-650,000 dream |
| $10 Ante + $5 Six Card Bonus | $19.98 | Almost three times the standard cost |
| $25 Ante, basic card | $17.86 | Big swings |

**Our recipe for the most fun per dollar:**

1. **Play the main game well.** The basic card is cheap fun: every hand gives you a real decision.
2. **If you like a side bet, make it Trips at an 8-6-5 (or 9-7-4) table**, and pay for it by
   **lowering your Ante**. $5 Ante + $5 Trips costs less per hour than $10 Ante alone ($6.43 vs $7.14
   with the basic card), and you get a payout most hours.
3. **Skip Six Card Bonus** and anything above 5%. The same $12.84 an hour buys you two more hours of the main game.
4. **Treat progressives as a lottery ticket.** Only the meter tells you the price. Below about $160,000 on
   the example table, every dollar costs you a third or more.
5. **Count the memorable moments.** At 30 hands an hour you'll bet 4x about 11 times, make a straight or
   better about 3 times, and hit Trips about 4.6 times. The price of all that is the same whatever stake you choose, so
   choose the stake that lets you play the hours you want.

:::math The hourly figures
Cost per hour = 30 × (Ante × edge per Ante + Trips × Trips edge + other side bet × its edge).
Basic card 2.3814%; Trips 8-6-5 1.9040%, 8-7-4 3.4979%; Six Card 8.5614%; progressive example 32.32% at a
$50,000 meter. For example, $10 + $5 Trips = 30 × ($10 × 0.023814 + $5 × 0.019040) = $10.00.
Straight or better in seven cards: 13,967,280 of 133,784,560 = 10.44%.
:::

**Simulator scenes**

```scene
id: l21-s1
title: Two evenings, same price
table: { bankroll: 1000000, ante: 1000, trips: 0 }
seed: 2101
allowed: []
showEv: true
autoPlay: { hands: 120, strategy: basic, speed: fast, compare: [ { strategy: basic, ante: 1000, trips: 0 }, { strategy: basic, ante: 500, trips: 500 } ] }
steps:
  - say: "Run two 4-hour evenings on the same cards: $10 Ante alone, or $5 Ante + $5 Trips."
    completeWhen: { autoPlayDone: true }
  - say: "The expected costs are close (about $29 vs $26). Count the green Trips payouts on the second line."
    completeWhen: { next: true }
```

```quiz
- q: Which plan costs less per hour?
  options: ["$10 Ante alone (basic card)", "$5 Ante + $5 Trips at an 8-6-5 table (basic card)"]
  answer: 1
  explain: "$6.43 vs $7.14 an hour, at 30 hands an hour."
- q: You love side bets. Which is the best value?
  options: ["Six Card Bonus", "Trips at an 8-6-5 table", "Progressive with a $20,000 meter", "Trips at an 8-6-4 table"]
  answer: 1
  explain: "1.90%, far below Six Card (8.56%+), a low-meter progressive, or an 8-6-4 Trips table (6.52%)."
- q: You want to play twice as long on the same budget. What's the most effective change?
  options: ["Halve your Ante", "Switch from the basic card to the simple card", "Add the progressive", "Bet 3x instead of 4x"]
  answer: 0
  explain: "Cost per hour scales with the Ante."
```

---

### Lesson 22: `at-the-casino`: Playing at a real table

**Front matter:** `chapter: real-casino` · `minutes: 6` · summary: "Buy-in, signals, cards and courtesy."

**Objectives**

* Buy in, bet and signal correctly at a real table.
* Handle your cards the way dealers expect.
* Know what to check on the felt before you sit down.

**Lesson**

**Before you sit.** Read the felt and the sign. Check the table minimum, the **Trips paytable** (lesson 19),
and any side bets and their tables. Most UTH tables have a minimum from $10 to $25 per Ante. Remember that
your first bet is really Ante + Blind, so a $15 table needs $30 for every hand plus up to $60 more for a
raise.

**Buying in.** Wait until a hand is over, put your cash on the felt (not in the dealer's hand) and say
"change, please". The dealer will slide you chips.

**Betting.** Put equal chips in **Ante** and **Blind**, plus **Trips** if you want it, before the dealer
starts the deal. When you raise, place chips in the **Play** circle: 4x or 3x preflop, 2x on the flop, 1x
on the river.

**Signals.**
* **Check**: tap the table with your finger.
* **Raise**: place chips in Play. Don't say "raise" and then hesitate.
* **Fold** (river only): slide your cards face down toward the dealer.

**Cards.** Keep your two cards on the table, in view of the dealer. Most casinos don't let players share
or show their hole cards to each other, because other players' cards would be information about the deck.
Look at yours, then leave them face down.

**Phones and strategy cards.** Many casinos are fine with a printed strategy card at the table, but not with
phones or devices during a hand. Practise in **Drill** before you go, and ask the dealer if you're unsure.

**Courtesy.** Act when it's your turn, and keep the pace up. If you want to tip, a small bet "for the
dealer" placed next to your Ante or Trips is common and appreciated.

:::tip
Before your first hand, ask the dealer, "Is the 3x raise allowed here?" The answer doesn't matter for you,
because you'll always use 4x or check. It's just a friendly way to start a conversation.
:::

```quiz
- q: How do you signal a check at a UTH table?
  options: ["Say 'pass'", "Tap the table", "Wave your hand over your cards", "Push your cards forward"]
  answer: 1
  explain: "A tap on the felt means check."
- q: The table minimum is $15. How much do you need on the felt to start a hand?
  options: ["$15", "$30", "$60", "$90"]
  answer: 1
  explain: "Ante $15 plus Blind $15. A 4x raise needs $60 more."
- q: What should you check on the felt before you bet Trips?
  options: ["The dealer's name", "The Trips paytable", "The shuffle machine", "Nothing, Trips is always the same"]
  answer: 1
  explain: "Trips edges range from 0.90% to 6.52% depending on the table."
```

---

### Lesson 23: `final-exam` ✔: Final exam

**Front matter:** `chapter: real-casino` · `minutes: 10` · summary: "Twelve questions from rules to bankroll."

**Lesson**

One last round. The scene deals five random hands. Play each with the basic card, then check the EV sheet.

```scene
id: l23-s1
title: Five hands for the road
table: { bankroll: 100000, ante: 1000, trips: 500 }
seed: 2301
allowed: all
showEv: true
steps:
  - say: "Play five hands with the basic card. Look at the EV sheet only after you've decided."
    completeWhen: { handsPlayed: 5 }
  - say: "Open the **session** panel: your decision cost vs perfect, your Trips results and your luck."
    completeWhen: { tap: session }
```

```quiz
- q: You win with a pair of kings and the dealer doesn't qualify. What does the Ante do?
  options: ["Wins", "Loses", "Pushes", "Pays 3 to 2"]
  answer: 2
  explain: "The Ante pushes when the dealer doesn't have a pair or better."
- q: The Blind pays 3 to 2 when you win with…
  options: ["A straight", "A flush", "A full house", "Any hand"]
  answer: 1
  explain: "Straight 1:1, flush 3:2, full house 3:1."
- q: Preflop. Best play?
  hand: { hole: Kh 3h }
  options: ["Bet 4x", "Check"]
  answer: 0
  explain: "Any suited king is a 4x hand."
- q: Preflop. Best play?
  hand: { hole: Jd 9c }
  options: ["Bet 4x", "Check"]
  answer: 1
  explain: "Offsuit jacks need a ten: JTo."
- q: Flop. Best play?
  hand: { hole: Kd 2c, board: Kh 8s 4d }
  options: ["Bet 2x", "Check"]
  answer: 0
  explain: "Hidden pair of kings."
- q: Flop. Best play?
  hand: { hole: 9c 8d, board: Ts 7h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Straight draws are checks."
- q: River. Best play?
  hand: { hole: Jc 9d, board: 8s 8h 5c 3d 2s }
  options: ["Play 1x", "Fold"]
  answer: 1
  explain: "23 dealer outs: fold."
- q: River. Best play?
  hand: { hole: Jd 8c, board: Kh Qs 4d 3c 2h }
  options: ["Play 1x", "Fold"]
  answer: 0
  explain: "19 dealer outs: play 1x."
- q: What's the element of risk of UTH under perfect play?
  options: ["0.53%", "1.09%", "2.19%", "4.15%"]
  answer: 0
  explain: "Expected loss divided by the average money in action (4.15 antes)."
- q: What's the biggest leak?
  options: ["Using the basic card", "Checking every hand to the river", "Skipping Trips", "Betting 4x with K5o"]
  answer: 1
  explain: "It raises the edge from 2.19% to 32%."
- q: Trips at an 8-6-5 table has a house edge of about…
  options: ["0.9%", "1.9%", "3.5%", "6.5%"]
  answer: 1
  explain: "48987/2572780 ≈ 1.904%."
- q: About how big are the swings in one hour (30 hands)?
  options: ["About 1 ante", "About 5 antes", "About 27 antes (one standard deviation)", "About 100 antes"]
  answer: 2
  explain: "4.94 antes per hand × √30 ≈ 27 antes."
```

---

## 6. Reference table: every bet and every decision

Rule set `standard`, Blind `blind-standard`. These figures are authoritative. The engine, math module and tests
must reproduce them; the exact fractions are in §11.

Definitions
* Payouts are "to 1": the net profit per unit. The stake comes back on a win.
* "Antes" = Ante units. Ante = Blind = 1. EVs are for the whole hand (Ante + Blind + Play) unless stated.
* "Qualifies" = the dealer's best five of seven is a pair or better.

### 6.1 Wagers

| id | Name | When placed | Win | Lose | Push | Pays | Notes |
|---|---|---|---|---|---|---|---|
| `ante` | Ante | Before the deal (required) | You beat a **qualifying** dealer | A qualifying dealer beats you; or you fold | Dealer doesn't qualify (win or lose); tie | 1:1 | The only bet that cares about qualifying |
| `blind` | Blind | Before the deal, = Ante (required) | You beat the dealer with a **straight or better** | The dealer beats you; or you fold | You win with less than a straight; tie | Royal 500:1, SF 50:1, Quads 10:1, FH 3:1, Flush 3:2, Straight 1:1 | Qualifying is irrelevant |
| `play` | Play | At your one raise: 4× or 3× preflop, 2× flop, 1× river | You beat the dealer | The dealer beats you | Tie | 1:1 | Qualifying is irrelevant. Never placed if you fold |
| `trips` | Trips | Before the deal (optional, needs an Ante) | Your best five of seven is trips or better | Anything less | — | Paytable (§2) | Independent of the dealer and of folding |

### 6.2 Decisions

| Street | Options | Legal when | What follows | Perfect-play frequency (share of all hands) |
|---|---|---|---|---|
| Preflop | `play-4`, `play-3`, `check` | After the deal | Play: board and dealer revealed, hand settled. Check: flop dealt | 4x **37.71%** (250/663) · 3x **0** · check 62.29% |
| Flop | `play-2`, `check` | After a preflop check | Play: settled. Check: turn and river dealt | 2x **21.28%** · check 41.01% |
| River | `play-1`, `fold` | After two checks | Play: settled. Fold: Ante and Blind lose, Trips settles, dealer revealed (D7) | 1x **21.82%** · fold **19.19%** |

EV of a Play bet of P antes at a decision point is **a + P·b**, with a = the EV of Ante + Blind over the
remaining cards and b = P(win) − P(lose). Folding is exactly −2. Checking is the average of the best
next-street option.

### 6.3 Probabilities and edges

**Showdown with no fold** (all 2,781,381,002,400 player/dealer/board combinations):

| Event | Probability |
|---|---|
| You win | 333531342323/695345250600 = 47.966% |
| You lose | 47.966% |
| Tie | 14141282977/347672625300 = 4.067% |
| Dealer qualifies | 789215/955604 = 82.588% |
| You win and the dealer doesn't qualify (Ante push) | 14.237% |

**The game** (Trips excluded):

| Strategy | EV per hand (antes) | House edge per Ante | Avg. total wagered | Element of risk | SD per hand |
|---|---|---|---|---|---|
| `perfect` | −0.0218497 | **2.1850%** | 4.1522 | **0.5262%** | 4.939 |
| `expert` | −0.0227139 | 2.2714% | 4.1521 | 0.5470% | 4.939 |
| `basic` | −0.0238140 | 2.3814% | 4.1633 | 0.5720% | 4.942 |
| `simple` (proposed definition, §7) | −0.0270761 | 2.7076% | 4.1957 | 0.6453% | 4.968 |
| `check-to-river` | −0.3203338 | 32.0334% | 2.7870 | 11.4938% | 3.786 |
| `never-fold` | −0.4070470 | 40.7047% | 3.0000 | 13.5682% | 3.876 |
| `always-max` | −0.4070470 | 40.7047% | 6.0000 | 6.7841% | 6.177 |

**Trips** (7-card counts out of 133,784,560; P(pays) = 60085/393484 = 15.270%):

| Hand | Count | 8-6-5 | 9-7-4 | 8-7-4 | 7-6-5 | 8-6-4 |
|---|---|---|---|---|---|---|
| Royal flush | 4,324 | 50 | 50 | 50 | 50 | 50 |
| Straight flush | 37,260 | 40 | 40 | 40 | 40 | 40 |
| Quads | 224,848 | 30 | 30 | 30 | 30 | 30 |
| Full house | 3,473,184 | 8 | 9 | 8 | 7 | 8 |
| Flush | 4,047,644 | 6 | 7 | 7 | 6 | 6 |
| Straight | 6,180,020 | 5 | 4 | 4 | 5 | 4 |
| Trips | 6,461,620 | 3 | 3 | 3 | 3 | 3 |
| **House edge** | | **1.904%** | 0.902% | 3.498% | 4.500% | 6.523% |

**Mentioned-only side bets.** Six Card Bonus 1000/200/100/20/15/10/7: 8.561% (6-card counts: royal 188,
SF 1,656, quads 14,664, FH 165,984, flush 205,792, straight 361,620, trips 732,160 of 20,358,520). Progressive
(5-card counts: royal 4, SF 36, quads 624, FH 3,744, flush 5,108, straight 10,200, trips 54,912 of 2,598,960).

**Bad Beat inputs**: the probability per hand that your final hand is of this category **and** the dealer's beats it:

| Your hand | Exact | 1 in |
|---|---|---|
| High card | 824966063/5794543755 | 7.02 |
| Pair | 486649771/1981040600 | 4.07 |
| Two pair | 1108608749/15452116680 | 13.94 |
| Trips | 2668739977/231781750200 | 86.85 |
| Straight | 126882479/38630291700 | 304.5 |
| Flush | 1214638037/347672625300 | 286.2 |
| Full house | 1722881/1136185050 | 659.5 |
| Quads | 2453336/28972718775 | 11,809.5 |
| Straight flush | 643787/347672625300 | 540,042.9 |
| Royal flush | 0 | never |

### 6.4 Preflop EV table (all 169 starting hands)

EV in antes for the whole hand, with perfect play afterwards. "Margin" = |EV(4x) − EV(check)|. The exact
numerators and denominators are in `/tmp/holdumb-scratch/curriculum/preflop-exact.json`. The generated
table in the app (§10) must match it exactly.

| Hand | Bet 4x | Bet 3x | Check | Best | Margin |
|---|---|---|---|---|---|
| AA | +3.6011 | +2.8970 | +2.1929 | **4x** | 1.4081 |
| AKs | +1.6583 | +1.3174 | +0.9867 | **4x** | 0.6716 |
| AKo | +1.1719 | +0.8655 | +0.5689 | **4x** | 0.6030 |
| AQs | +1.5727 | +1.2485 | +0.9357 | **4x** | 0.6370 |
| AQo | +1.0806 | +0.7920 | +0.5144 | **4x** | 0.5662 |
| AJs | +1.4895 | +1.1817 | +0.8860 | **4x** | 0.6035 |
| AJo | +0.9918 | +0.7205 | +0.4613 | **4x** | 0.5305 |
| ATs | +1.4093 | +1.1173 | +0.8379 | **4x** | 0.5714 |
| ATo | +0.9061 | +0.6516 | +0.4096 | **4x** | 0.4964 |
| A9s | +0.9536 | +0.6979 | +0.4582 | **4x** | 0.4953 |
| A9o | +0.6677 | +0.4522 | +0.2525 | **4x** | 0.4152 |
| A8s | +0.8689 | +0.6300 | +0.4096 | **4x** | 0.4593 |
| A8o | +0.5753 | +0.3779 | +0.1995 | **4x** | 0.3758 |
| A7s | +0.7674 | +0.5478 | +0.3520 | **4x** | 0.4155 |
| A7o | +0.4660 | +0.2892 | +0.1392 | **4x** | 0.3268 |
| A6s | +0.6493 | +0.4512 | +0.2857 | **4x** | 0.3636 |
| A6o | +0.3398 | +0.1861 | +0.0709 | **4x** | 0.2689 |
| A5s | +0.6902 | +0.4918 | +0.3297 | **4x** | 0.3605 |
| A5o | +0.3585 | +0.2046 | +0.0936 | **4x** | 0.2650 |
| A4s | +0.5901 | +0.4094 | +0.2741 | **4x** | 0.3160 |
| A4o | +0.2494 | +0.1148 | +0.0337 | **4x** | 0.2157 |
| A3s | +0.4967 | +0.3323 | +0.2214 | **4x** | 0.2753 |
| A3o | +0.1474 | +0.0306 | -0.0232 | **4x** | 0.1707 |
| A2s | +0.3999 | +0.2523 | +0.1665 | **4x** | 0.2333 |
| A2o | +0.0417 | -0.0568 | -0.0823 | **4x** | 0.1241 |
| KK | +3.2894 | +2.6414 | +1.9935 | **4x** | 1.2958 |
| KQs | +1.3126 | +1.0446 | +0.8164 | **4x** | 0.4962 |
| KQo | +0.7829 | +0.5538 | +0.3705 | **4x** | 0.4125 |
| KJs | +1.2275 | +0.9762 | +0.7676 | **4x** | 0.4599 |
| KJo | +0.6920 | +0.4806 | +0.3186 | **4x** | 0.3733 |
| KTs | +1.1485 | +0.9127 | +0.7213 | **4x** | 0.4272 |
| KTo | +0.6075 | +0.4127 | +0.2694 | **4x** | 0.3381 |
| K9s | +0.6946 | +0.4948 | +0.3448 | **4x** | 0.3498 |
| K9o | +0.3710 | +0.2148 | +0.1162 | **4x** | 0.2548 |
| K8s | +0.4816 | +0.3154 | +0.2091 | **4x** | 0.2725 |
| K8o | +0.1663 | +0.0459 | -0.0040 | **4x** | 0.1702 |
| K7s | +0.4039 | +0.2531 | +0.1672 | **4x** | 0.2367 |
| K7o | +0.0814 | -0.0224 | -0.0494 | **4x** | 0.1308 |
| K6s | +0.3091 | +0.1763 | +0.1165 | **4x** | 0.1927 |
| K6o | -0.0208 | -0.1052 | -0.1030 | **4x** | 0.0822 |
| K5s | +0.2191 | +0.1033 | +0.0706 | **4x** | 0.1485 |
| K5o | -0.1176 | -0.1839 | -0.1511 | **4x** | 0.0335 |
| K4s | +0.1170 | +0.0193 | +0.0189 | **4x** | 0.0981 |
| K4o | -0.2288 | -0.2754 | -0.2060 | check | 0.0228 |
| K3s | +0.0220 | -0.0591 | -0.0302 | **4x** | 0.0522 |
| K3o | -0.3324 | -0.3609 | -0.2583 | check | 0.0741 |
| K2s | -0.0745 | -0.1387 | -0.0799 | **4x** | 0.0054 |
| K2o | -0.4377 | -0.4479 | -0.3113 | check | 0.1264 |
| QQ | +3.0186 | +2.4201 | +1.8216 | **4x** | 1.1970 |
| QJs | +1.0242 | +0.8190 | +0.6936 | **4x** | 0.3306 |
| QJo | +0.4557 | +0.2930 | +0.2243 | **4x** | 0.2314 |
| QTs | +0.9436 | +0.7542 | +0.6480 | **4x** | 0.2956 |
| QTo | +0.3695 | +0.2237 | +0.1759 | **4x** | 0.1936 |
| Q9s | +0.4892 | +0.3359 | +0.2741 | **4x** | 0.2151 |
| Q9o | +0.1325 | +0.0253 | +0.0262 | **4x** | 0.1063 |
| Q8s | +0.2789 | +0.1586 | +0.1402 | **4x** | 0.1387 |
| Q8o | -0.0694 | -0.1414 | -0.0926 | **4x** | 0.0231 |
| Q7s | +0.0628 | -0.0233 | +0.0078 | **4x** | 0.0549 |
| Q7o | -0.2776 | -0.3129 | -0.2094 | check | 0.0682 |
| Q6s | -0.0061 | -0.0783 | -0.0281 | **4x** | 0.0220 |
| Q6o | -0.3530 | -0.3735 | -0.2487 | check | 0.1043 |
| Q5s | -0.0957 | -0.1511 | -0.0745 | check | 0.0212 |
| Q5o | -0.4493 | -0.4517 | -0.2975 | check | 0.1518 |
| Q4s | -0.1984 | -0.2356 | -0.1244 | check | 0.0740 |
| Q4o | -0.5612 | -0.5438 | -0.3503 | check | 0.2109 |
| Q3s | -0.2942 | -0.3145 | -0.1721 | check | 0.1220 |
| Q3o | -0.6655 | -0.6299 | -0.4009 | check | 0.2646 |
| Q2s | -0.3914 | -0.3948 | -0.2204 | check | 0.1710 |
| Q2o | -0.7716 | -0.7175 | -0.4522 | check | 0.3194 |
| JJ | +2.7497 | +2.2003 | +1.6510 | **4x** | 1.0988 |
| JTs | +0.7788 | +0.6283 | +0.6019 | **4x** | 0.1769 |
| JTo | +0.1740 | +0.0691 | +0.1103 | **4x** | 0.0637 |
| J9s | +0.3178 | +0.2046 | +0.2282 | **4x** | 0.0896 |
| J9o | -0.0700 | -0.1350 | -0.0385 | check | 0.0315 |
| J8s | +0.1074 | +0.0271 | +0.0963 | **4x** | 0.0111 |
| J8o | -0.2721 | -0.3019 | -0.1549 | check | 0.1172 |
| J7s | -0.1066 | -0.1531 | -0.0344 | check | 0.0722 |
| J7o | -0.4781 | -0.4717 | -0.2698 | check | 0.2082 |
| J6s | -0.3227 | -0.3348 | -0.1636 | check | 0.1591 |
| J6o | -0.6862 | -0.6430 | -0.3829 | check | 0.3033 |
| J5s | -0.3848 | -0.3845 | -0.1941 | check | 0.1907 |
| J5o | -0.7540 | -0.6976 | -0.4159 | check | 0.3382 |
| J4s | -0.4879 | -0.4693 | -0.2425 | check | 0.2453 |
| J4o | -0.8661 | -0.7899 | -0.4670 | check | 0.3991 |
| J3s | -0.5839 | -0.5485 | -0.2891 | check | 0.2948 |
| J3o | -0.9708 | -0.8763 | -0.5167 | check | 0.4541 |
| J2s | -0.6816 | -0.6291 | -0.3362 | check | 0.3453 |
| J2o | -1.0772 | -0.9642 | -0.5672 | check | 0.5100 |
| TT | +2.4808 | +1.9806 | +1.4803 | **4x** | 1.0005 |
| T9s | +0.1852 | +0.1046 | +0.2055 | check | 0.0203 |
| T9o | -0.2315 | -0.2621 | -0.0795 | check | 0.1520 |
| T8s | -0.0303 | -0.0770 | +0.0754 | check | 0.1057 |
| T8o | -0.4390 | -0.4334 | -0.1935 | check | 0.2455 |
| T7s | -0.2449 | -0.2577 | -0.0534 | check | 0.1915 |
| T7o | -0.6456 | -0.6037 | -0.3058 | check | 0.3397 |
| T6s | -0.4593 | -0.4381 | -0.1810 | check | 0.2783 |
| T6o | -0.8518 | -0.7737 | -0.4167 | check | 0.4351 |
| T5s | -0.6763 | -0.6206 | -0.3080 | check | 0.3683 |
| T5o | -1.0606 | -0.9456 | -0.5273 | check | 0.5333 |
| T4s | -0.7511 | -0.6817 | -0.3394 | check | 0.4118 |
| T4o | -1.1435 | -1.0136 | -0.5617 | check | 0.5819 |
| T3s | -0.8472 | -0.7610 | -0.3843 | check | 0.4629 |
| T3o | -1.2481 | -1.1000 | -0.6100 | check | 0.6381 |
| T2s | -0.9449 | -0.8416 | -0.4298 | check | 0.5150 |
| T2o | -1.3545 | -1.1879 | -0.6595 | check | 0.6950 |
| 99 | +2.1325 | +1.6914 | +1.2503 | **4x** | 0.8822 |
| 98s | -0.1705 | -0.1865 | +0.0511 | check | 0.2215 |
| 98o | -0.6094 | -0.5713 | -0.2361 | check | 0.3733 |
| 97s | -0.3835 | -0.3658 | -0.0717 | check | 0.3118 |
| 97o | -0.8142 | -0.7401 | -0.3420 | check | 0.4722 |
| 96s | -0.5970 | -0.5456 | -0.1966 | check | 0.4004 |
| 96o | -1.0196 | -0.9094 | -0.4500 | check | 0.5696 |
| 95s | -0.8125 | -0.7269 | -0.3235 | check | 0.4890 |
| 95o | -1.2267 | -1.0801 | -0.5605 | check | 0.6662 |
| 94s | -1.0492 | -0.9265 | -0.4525 | check | 0.5968 |
| 94o | -1.4580 | -1.2714 | -0.6747 | check | 0.7833 |
| 93s | -1.1161 | -0.9814 | -0.4825 | check | 0.6336 |
| 93o | -1.5323 | -1.3327 | -0.7087 | check | 0.8237 |
| 92s | -1.2135 | -1.0618 | -0.5279 | check | 0.6856 |
| 92o | -1.6384 | -1.4203 | -0.7582 | check | 0.8802 |
| 88 | +1.8115 | +1.4282 | +1.0452 | **4x** | 0.7663 |
| 87s | -0.4747 | -0.4334 | -0.0528 | check | 0.4219 |
| 87o | -0.9329 | -0.8339 | -0.3402 | check | 0.5927 |
| 86s | -0.6882 | -0.6131 | -0.1750 | check | 0.5132 |
| 86o | -1.1383 | -1.0031 | -0.4463 | check | 0.6920 |
| 85s | -0.9030 | -0.7939 | -0.3007 | check | 0.6023 |
| 85o | -1.3447 | -1.1732 | -0.5562 | check | 0.7885 |
| 84s | -1.1383 | -0.9923 | -0.4295 | check | 0.7088 |
| 84o | -1.5744 | -1.3633 | -0.6705 | check | 0.9039 |
| 83s | -1.3728 | -1.1902 | -0.5578 | check | 0.8150 |
| 83o | -1.8031 | -1.5528 | -0.7849 | check | 1.0182 |
| 82s | -1.4403 | -1.2458 | -0.5887 | check | 0.8516 |
| 82o | -1.8782 | -1.6148 | -0.8201 | check | 1.0582 |
| 77 | +1.4869 | +1.1622 | +0.8386 | **4x** | 0.6483 |
| 76s | -0.7463 | -0.6538 | -0.1410 | check | 0.6054 |
| 76o | -1.2219 | -1.0683 | -0.4309 | check | 0.7909 |
| 75s | -0.9606 | -0.8341 | -0.2642 | check | 0.6964 |
| 75o | -1.4277 | -1.2380 | -0.5386 | check | 0.8891 |
| 74s | -1.1941 | -1.0311 | -0.3921 | check | 0.8020 |
| 74o | -1.6556 | -1.4266 | -0.6522 | check | 1.0034 |
| 73s | -1.4273 | -1.2280 | -0.5209 | check | 0.9064 |
| 73o | -1.8829 | -1.6150 | -0.7670 | check | 1.1159 |
| 72s | -1.6673 | -1.4304 | -0.6504 | check | 1.0169 |
| 72o | -2.1176 | -1.8093 | -0.8828 | check | 1.2348 |
| 66 | +1.1599 | +0.8942 | +0.6326 | **4x** | 0.5273 |
| 65s | -0.9845 | -0.8472 | -0.2269 | check | 0.7577 |
| 65o | -1.4751 | -1.2740 | -0.5206 | check | 0.9545 |
| 64s | -1.2146 | -1.0413 | -0.3518 | check | 0.8627 |
| 64o | -1.6992 | -1.4594 | -0.6311 | check | 1.0681 |
| 63s | -1.4463 | -1.2370 | -0.4798 | check | 0.9665 |
| 63o | -1.9250 | -1.6465 | -0.7452 | check | 1.1798 |
| 62s | -1.6849 | -1.4383 | -0.6097 | check | 1.0752 |
| 62o | -2.1582 | -1.8397 | -0.8614 | check | 1.2968 |
| 55 | +0.8316 | +0.6251 | +0.4299 | **4x** | 0.4018 |
| 54s | -1.1662 | -0.9953 | -0.2990 | check | 0.8673 |
| 54o | -1.6700 | -1.4331 | -0.5977 | check | 1.0722 |
| 53s | -1.3931 | -1.1870 | -0.4237 | check | 0.9695 |
| 53o | -1.8906 | -1.6159 | -0.7083 | check | 1.1823 |
| 52s | -1.6295 | -1.3865 | -0.5524 | check | 1.0771 |
| 52o | -2.1214 | -1.8071 | -0.8233 | check | 1.2981 |
| 44 | +0.4616 | +0.3211 | +0.2106 | **4x** | 0.2510 |
| 43s | -1.5119 | -1.2847 | -0.4727 | check | 1.0392 |
| 43o | -2.0169 | -1.7198 | -0.7601 | check | 1.2569 |
| 42s | -1.7445 | -1.4811 | -0.5991 | check | 1.1454 |
| 42o | -2.2437 | -1.9077 | -0.8726 | check | 1.3711 |
| 33 | +0.0885 | +0.0146 | +0.0075 | **4x** | 0.0810 |
| 32s | -1.8428 | -1.5625 | -0.6493 | check | 1.1935 |
| 32o | -2.3481 | -1.9942 | -0.9258 | check | 1.4223 |
| 22 | -0.2879 | -0.2946 | -0.1795 | check | 0.1084 |

---

## 7. Strategy reference

The ids match the simulator spike's registry. The rules below are the copy for `content/strategy.json`.
The numbers come from math (never typed into JSON) and must equal these exact values.

### 7.1 The strategies

| id | Lens | Preflop | Flop | River | Edge per Ante | vs perfect | $/h extra at $10 × 30 |
|---|---|---|---|---|---|---|---|
| `perfect` | lowest edge | exact table (= the chart) | exact enumeration | exact enumeration | **2.1850%** | — | — |
| `expert` | lowest edge (for simulations) | chart | basic flop rule | exact enumeration | 2.2714% | +0.0864% | $0.26 |
| `basic` | practical | chart | basic flop rule | basic river rule | **2.3814%** | +0.1964% | $0.59 |
| `simple` | practical (lightest) | 33+, any A, any K, Q8+, JT | two pair+ or hidden pair (not 22) | basic river rule | **2.7076%** | +0.5226% | $1.57 |
| `check-to-river` | teaching ("the cautious player") | check | check | exact enumeration | 32.0334% | +29.85% | $89.55 |
| `never-fold` | myth demo | check | check | always 1x | 40.7047% | +38.52% | $115.56 |
| `always-max` | fun/maniac | 4x | — | — | 40.7047% | +38.52% | $115.56 |

**Rule text** (exact formalisations; the code and the solver use these):

* **Chart preflop** (`basic`, `expert`, and `perfect`'s table): 4x if pair ≥ 33; or high card A; or high
  card K and (suited, or low card ≥ 5); or high card Q and (suited and low ≥ 6, or offsuit and low ≥ 8); or high
  card J and (suited and low ≥ 8, or offsuit and low = T). Otherwise check. **This equals the exact optimum
  for all 169 classes** under `blind-standard`.
* **Basic flop rule**: 2x if (a) the category of best5(hole + flop) is ≥ two pair **and** greater than the
  flop's own category (high card / pair / trips); or (b) a hidden pair: a pocket pair other than 22, or a
  hole card whose rank matches a flop card; or (c) some suit has ≥ 4 cards among hole + flop and a hole card
  of that suit is T or higher. Otherwise check.
* **Basic river rule**: 1x if **hidden**: category(best of 7) ≥ pair **and** category(best of 7) >
  category(board's 5 cards). Or 1x if **dealer outs < 21**: the number of unseen cards c (45 of them)
  with value(board + c, best 5 of 6) > value(your 7 cards). Otherwise fold.
* **Simple preflop**: 4x if pair ≥ 33, or high card A or K, or Q with low ≥ 8, or J with low = T.
* **Simple flop**: (a) or (b) of the basic flop rule (no flush clause).

> ⚠ The simulator draft defined `simple` as "4x any pair or any ace; 2x any hidden pair; river 1x only
> with a hidden pair". That strategy costs **16.06%** of the Ante (exact −6205519211/38630291700), seven times
> the game's edge, and must not be taught as practical. The definition above replaces it (sent to main).
> If the simulator's `basic` river "hidden" test is worded differently (e.g. "a hole card makes a straight
> or better"), decisions.md must pick one, and the pinned EV must come from that one.

### 7.2 Costs of other habits (lesson 18; exact, not strategy-registry entries)

| Habit (everything else perfect unless stated) | Edge per Ante | Exact EV |
|---|---|---|
| 3x instead of 4x on every preflop raise | 9.8585% | −228501907703/2317817502000 |
| Never bet 2x on the flop | 9.4187% | −16373139857/173836312650 |
| 4x only with pairs and aces | 5.6472% | −196337758313/3476726253000 |
| Chart + basic flop, river "pair only" | 7.3470% | −20851744301/283814388000 |
| Check to the river, play 1x only with a hidden pair | 50.0392% | −1070600065/2139523848 |
| The draft `simple` | 16.0639% | −6205519211/38630291700 |

### 7.3 What the strategy chart shows (`#/strategy`)

* `perfect`, view `preflop-grid`: the 13×13 grid of 4x / check, with 3x never coloured. Each cell's tooltip:
  "4x +0.042 · check −0.082 · margin 0.124". Close cells (margin < 0.03: K4o, Q5s, T9s, K2s, J8s, Q6s, Q8o)
  get a "close call" dot.
* `perfect`, views `flop` and `river`: the basic rules as text, then "Perfect play differs in rare spots;
  the EV sheet always shows the exact answer", plus the costs 0.086% (flop) and 0.110% (river).
* `basic` and `simple`: their rule lists and the cost line from 7.1.

---

## 8. How EV is shown

Learner-facing copy is in quotation marks; the rest is guidance for implementers. This section and the
simulator spike's §2.4–2.5 describe the same sheet; the tier names and thresholds below are the simulator's.

### 8.1 The EV sheet (one per decision)

For each option, show:
1. **EV for the hand**, in dollars and antes: "**Bet 4x**: **+$36.01** (+3.601 antes)".
2. **Cost vs best**: the best option gets the "**Best play**" badge. Every other option shows
   "**−$14.08 vs best**" and its tier badge.
3. **Why?** (expandable): win / tie / lose percentages for this option against the dealer's possible hands,
   how often the dealer qualifies, and how often the Blind bonus pays. River example for {{Qc 7d}} on
   {{Kd Jh 9s 5c 2d}}: "Win **25.9%** (all against a dealer who didn't qualify) · Tie 0.9% · Lose 73.2%".
4. **How often this spot costs you** (preflop only, optional line): "Getting this wrong every time costs
   about **$1.91 an hour**" = 30 × P(hand class) × regret × Ante.

The game-level number shown in the sheet header and on `#/bets`: "**House edge 2.19%** of the Ante with
perfect play (element of risk 0.53%)". When Trips is on: "**Trips**: house edge 1.90% of the Trips bet, any
decision." The Trips line never changes between options.

### 8.2 Decision tiers (regret r in antes = EV(best) − EV(choice))

| Tier id | Regret | Badge | Colour | Confirm | Example |
|---|---|---|---|---|---|
| `best` | 0 | "**Best play**" | teal | one tap | 4x with {{As Ad}} |
| `close` | 0 < r ≤ 0.02 | "**Close**" | green | one tap | Check {{Js 8s}} (0.011) |
| `small` | ≤ 0.10 | "**Small mistake**" | yellow | one tap | 4x {{Kc 4d}} (0.023); check {{3c 3d}} (0.081) |
| `costly` | ≤ 0.50 | "**Mistake**" | orange | one tap + alternative card | 4x {{2c 2d}} (0.108); check a hidden pair on the flop, {{9s 7d}} on {{9h Kc 2s}} (0.437) |
| `blunder` | > 0.50 | "**Big mistake**" | red | **second tap** ("Do it anyway") | Check {{As Ad}} (1.408); 4x {{7s 2d}} (1.235); fold {{Td 4c}} on {{Ts Kh 7d 3s 2c}} (2.261) |

If two options are equal (within 1e-9 antes), both get `best`. Never show
"0.00 vs best" on a non-best option; show "−<$0.01 vs best" instead.

### 8.3 Wager tiers (Trips)

By house edge per bet (crappy's thresholds): `free` ≤ 0 "**Free bet**" · `good` ≤ 2% "**Good bet**" · `fair`
≤ 5% "**Fair**" · `poor` < 9% "**Costly**" · `avoid` ≥ 9% "**Sucker bet**". So 9-7-4 and 8-6-5 are Good,
8-7-4 and 7-6-5 are Fair, and 8-6-4 is Costly. For mentioned-only bets in lessons: Six Card 8.56% Costly,
Six Card 19.36% Sucker bet, progressive below break-even Sucker bet.

### 8.4 Better-alternative copy

The alternative card is always the best option. The copy is templated by situation (variables in `{}`):

| Situation | Copy |
|---|---|
| Preflop check of a chart hand | "**Bet 4x** instead: {hand} is a 4x hand. +{ev4} vs +{evCheck}." |
| Preflop 4x of a non-chart hand | "**Check** instead: {hand} isn't strong enough. 4x loses {cost} more on average." |
| Preflop 3x (any hand) | "**{best}** instead. 3x is never the best play: EV grows in a straight line with your bet, so it's 4x or nothing." |
| Flop check with a hidden pair / two pair+ | "**Bet 2x**: your {pairRank}s pair the board. You're ahead of most dealer hands." |
| Flop 2x without a qualifying hand | "**Check** and see the river. {reason: pair on the board only / straight draw / weak flush draw}." |
| River fold with a hidden pair | "**Play 1x**: a hidden pair beats every dealer hand that missed. Folding costs exactly $ {2·ante}." |
| River fold with < 21 outs | "**Play 1x**: only {outs} cards beat you. You need to win just 1 time in 5 to beat folding." |
| River fold when the board plays | "**Play 1x**: the board is your hand and the dealer's. It's usually a tie, and folding costs $ {2·ante}." |
| River 1x with ≥ 21 outs, no pair | "**Fold**: {outs} cards beat you. Folding costs $ {2·ante}; playing costs $ {cost} on average." |
| Any spot where the basic rule and perfect play disagree | Add: "(The basic card says {ruleAction} here, a rare exception worth {regret}.)" |

### 8.5 Session panel

* "**Hands** 42 · **Total wagered** $1,780 · **Expected** −$9.18 · **Actual** −$35.00 · **Luck** −$25.82"
* "**Decisions vs perfect**: −$1.20 (3 mistakes)". This is the sum of regrets over the session, with a link to the misses.
* "**Your edge per Ante**: 2.4%", with "(perfect play: 2.19%)".
* Trips line, if any: "Trips: wagered $210 · expected −$4.00 · actual +$25".
* In auto-play: the running result with the expected line dashed.

Expected = Σ over hands of the EV of the decisions actually taken (from each hand's starting EV, so that
"Expected" doesn't move with luck), plus the Trips EV.

### 8.6 Wording rules

* Say "**on average**" and "**expected**". Never "you will win/lose".
* Show EVs to the cent and in antes to three decimals; show edges to two decimals (three in reference screens).
* Never show a negative EV in green just because it's the best option: the badge says "Best play", and the
  number keeps its sign.
* Never call a decision a "house edge". Regrets are "cost vs best".
* Never suggest any strategy wins in the long run, or that Trips changes the right play.

---

## 9. Drill: spot categories and grading copy

Drill (`#/drill`) deals one decision at a time. Spot generation is a pure function in `src/sim/strategy/drill.ts`
(seeded): deal random cards, then keep the spot if it matches the category filter. Flop spots use only hands
that check preflop under the chart, and river spots only hands that check the flop too, so every spot is one
you'd really face. `?street=mixed` draws categories in proportion to how often they come up in real play;
`?focus=` draws only from missed cells or categories.

### 9.1 Categories

| id | Street | Filter | Pinned example (perfect answer) |
|---|---|---|---|
| `pre-premium` | preflop | pairs 77+, AK–AT, KQ, KJs | {{Ah Kd}}: 4x (+1.172 vs +0.569) |
| `pre-ace` | preflop | A2–A9, suited or not | {{Ac 2d}}: 4x (+0.042 vs −0.082) |
| `pre-king` | preflop | K2–KT | {{Kc 4d}}: check (−0.206 vs −0.229) |
| `pre-queen-jack` | preflop | Q2–QJ, J2–JT | {{Qc 8d}}: 4x (−0.069 vs −0.093) |
| `pre-small-pair` | preflop | 22–66 | {{2c 2d}}: check (−0.179 vs −0.288) |
| `pre-low` | preflop | top card T or lower, not a pair | {{Ts 9s}}: check (+0.205 vs +0.185) |
| `flop-hidden-pair` | flop | a hole card pairs the flop, or a pocket pair 33+ | {{9s 7d}} on {{9h Kc 2s}}: 2x (+0.866 vs +0.429) |
| `flop-two-pair-plus` | flop | two pair or better using a hole card | {{Qc 5d}} on {{Qs 5h 9d}}: 2x (+2.517 vs +1.726) |
| `flop-board-pair` | flop | paired flop, no hole-card help | {{9c 8d}} on {{Ks Kd 4c}}: check (−1.144 vs −1.548) |
| `flop-flush-draw` | flop | four to a flush | {{Th 4h}} on {{Jh 8h 2c}}: 2x; {{9h 4h}}: check |
| `flop-straight-draw` | flop | open-ended or gutshot, no pair, no 4-flush | {{9c 8d}} on {{Ts 7h 2c}}: check (−0.140 vs −0.235) |
| `flop-nothing` | flop | none of the above | {{Kc 3d}} on {{8s 5h 2c}}: check (−1.108 vs −1.373) |
| `flop-deuces` | flop | pocket 22 | {{2c 2d}} on {{9s 9h 5c}}: check (−0.131 vs −0.284) |
| `river-hidden-pair` | river | hidden pair or better | {{Td 4c}} on {{Ts Kh 7d 3s 2c}}: 1x (+0.261) |
| `river-outs-low` | river | no hidden pair, ≤ 18 outs | (generated) |
| `river-outs-edge` | river | no hidden pair, 19–23 outs | {{Qc 7d}} on {{Kd Jh 9s 5c 2d}}: 1x (19 outs); {{Jc 9d}} on {{8s 8h 5c 3d 2s}}: fold (23) |
| `river-outs-high` | river | no hidden pair, ≥ 24 outs | {{8c 6d}} on {{Kh Qs 4d 3c 2h}}: fold (31) |
| `river-board-plays` | river | your best five is the board | {{4c 3d}} on {{As Ks Qs Jd Th}}: 1x (−0.136) |

### 9.2 Grading copy

Grading is against the selected lens: `perfect` (exact EV) or `practical` (the `basic` card's action, with the
exact EV still shown). The tier comes from §8.2.

| Result | Headline | Body |
|---|---|---|
| `best` | "**Correct!**" | "{reminder}" |
| `close` | "**Close call.**" | "{best} is better by just {regret} antes ({$}). Either is fine." |
| `small` | "**Not quite.**" | "{best} is better by {regret} antes ({$} per hand). {reminder}" |
| `costly` | "**Mistake.**" | "{best} earns {regret} antes ({$}) more on average. {reminder}" |
| `blunder` | "**Big mistake.**" | "{best} earns {regret} antes ({$}) more on average. {reminder}" |
| practical lens, perfect differs | (append) | "Perfect play says {perfectAction} here, by {perfRegret} antes. The card's rule is still the one to remember." |

`{reminder}` per category:

| Category | Reminder |
|---|---|
| `pre-premium` | "Big hands want the biggest bet: 4x." |
| `pre-ace` | "Any ace is a 4x hand." |
| `pre-king` | "Suited kings: always 4x. Offsuit kings: K5 and up." |
| `pre-queen-jack` | "Queens: Q6 suited or Q8 offsuit and up. Jacks: J8 suited or JT offsuit and up." |
| `pre-small-pair` | "Every pair from 33 up is 4x. Deuces: check." |
| `pre-low` | "With a ten or lower as your top card, check (unless it's a pair)." |
| `flop-hidden-pair` | "A pair that uses your card: bet 2x." |
| `flop-two-pair-plus` | "Two pair or better that uses your cards: bet 2x." |
| `flop-board-pair` | "A pair on the board belongs to the dealer too: check." |
| `flop-flush-draw` | "Four to a flush: 2x only with a ten or better of that suit in your hand." |
| `flop-straight-draw` | "Straight draws: check, and play 1x on the river if it comes." |
| `flop-nothing` | "No pair, no draw: check." |
| `flop-deuces` | "Pocket deuces stay a check on the flop." |
| `river-hidden-pair` | "Hidden pair or better: always play 1x." |
| `river-outs-low` / `-edge` / `-high` | "Count the dealer's outs: fewer than 21, play 1x; otherwise fold. Here: {outs}." |
| `river-board-plays` | "When the board plays, play 1x: it's usually a tie." |

Streaks count `best` and `close` as correct. Accuracy per street is shown as a percentage, and "Review
misses" replays `small` and worse.

---

## 10. How EV is computed in the app (recommendation)

This agrees with the simulator spike's decisions (§0 there). Here are the measurements and alternatives behind it.

| Decision | Full enumeration on the device | Precomputed table | Monte Carlo |
|---|---|---|---|
| River 1x/fold | **990 dealer hands**. Measured 0.48 ms in Node 22 (unoptimised JS port of the evaluator); est. < 5 ms on a mid-range Android. **Use this**. | Unnecessary | Unnecessary |
| Flop 2x/check | **1,081 turn/river pairs × 990 dealer hands = 1,070,190 showdowns**, with an optimal river inside Check. Measured **150–170 ms** in Node 22 (unoptimised); est. 0.6–1.0 s on a mid-range Android, or 0.25–0.5 s with the incremental-mask evaluator the simulator spike specifies. **Use this, in the Web Worker**, started as the flop is dealt and cached per (hole, flop). | Not viable: ≈ 1.29 M canonical (hand, flop) pairs. Even 1 bit per decision is ≈ 160 kB; EVs are megabytes. That breaks the 150 kB table budget. | Fast but approximate: 10,000 runouts gives an SE of ≈ 0.05 antes, too coarse for "close" vs "small" tiers. Reject. |
| Preflop 4x/3x/check | ≈ 2 × 10¹⁰ showdowns per hand class, hours on a phone. Reject. | **169 classes × {EV(4x), EV(3x), EV(check)}** as exact fractions: ≈ 8–12 kB raw. **Use this**. | Reject (the chart needs exact margins down to 0.005 antes, e.g. K2s). |
| Trips, paytables | Constant per paytable | Constants in `paytables.ts` / `edges.ts` | — |
| Strategy EVs (§7) | — | Constants from the offline solve | Simulations only for bankroll paths, percentiles and bust rates (labelled "≈ simulated") |

Other points:
* **Auto-play** must not use `perfect`. Each flop check would cost an enumeration (0.25–1 s per hand on a
  phone). Use `expert` (0.086% from perfect): an exact river, which is cheap, plus the basic flop rule.
* **Drill** prefetches the next flop spot's EV in the worker while the learner reads the feedback.
* **Generator.** The exhaustive C solver here takes ≈ 25 min on 4 cores; a TS port would take hours. Recommend
  generating the preflop table offline (`npm run gen:tables`, or a committed C tool run manually), and in CI verifying:
  (a) the table's weighted average equals −50643648973/2317817502000 exactly; (b) EV(4x) for two classes
  (e.g. `AKs`, `72o`) recomputed exactly in TS using suit symmetry (≈ 3.6 × 10⁸ showdowns each, tens of seconds);
  (c) the pinned (hand, flop) and (hand, board) values in §11 recomputed by the app's own flop/river code; and
  (d) a sha256 of the generated file.
* **Single-file size**: the preflop table plus the evaluator add well under 20 kB to `holdumb.html`.

---

## 11. Exact values for unit tests

```
# evaluator (exhaustive)
5-card counts: royal 4, SF 36, quads 624, FH 3744, flush 5108, straight 10200, trips 54912, 2pair 123552, pair 1098240, high 1302540 (total 2598960)
6-card counts: royal 188, SF 1656, quads 14664, FH 165984, flush 205792, straight 361620, trips 732160, 2pair 2532816, pair 9730740, high 6612900 (total 20358520)
7-card counts: royal 4324, SF 37260, quads 224848, FH 3473184, flush 4047644, straight 6180020, trips 6461620, 2pair 31433400, pair 58627800, high 23294460 (total 133784560)
distinct values: 5-card 7462, 7-card 4824

# showdown (no folds), over 2598960 boards x 1081 player x 990 dealer = 2781381002400
P(win) = P(lose) = 333531342323/695345250600 ; P(tie) = 14141282977/347672625300
P(dealer qualifies) = 789215/955604 ; counts: W 1334125369292, T 113130263816, L 1334125369292, win&dealerNQ 395983710240
always-1x EV: ante −1330653811/11589087510, blind −25399871678/86918156325, play 0, total −6432686411/15803301150

# game EV (antes per hand, Trips excluded, blind-standard)
perfect        −50643648973/2317817502000   (−0.021849713762753)
perfect wager   29163830173/7023689400      (4.152209545741)
perfect EoR     50643648973/9624063957090   (0.005262189569687)
perfect P(4x) 250/663 ; P(2x) 1382947/6497400 ; P(1x) 510906653/2341229800 ; P(fold) 224592289/1170614900
expert         −106357031/4682459600
basic          −54758439/2299422125         (perfect − basic = 4552857539/2317817502000)
simple (§7)    −47068162901/1738363126500
check-to-river −111371309107/347672625300
never-fold     −6432686411/15803301150
always-max     −6432686411/15803301150
perfect but 3x −228501907703/2317817502000
draft simple   −6205519211/38630291700

# preflop (EV in antes, perfect continuation)
AA   4x 472094411/131098275   check 38331809/17479770
KK   4x 492833497/149826600   check 10100429/5066600
AKs  4x 27606823/16647400     3x 230284391/174797700   check 164266593/166474000
AKo  4x 307271677/262196550   check 2386734047/4195144800
A2o  4x 21882887/524393100    check −1726877029/20975724000
K5o  4x −493274081/4195144800 check −452775091/2996532000     (4x)
K4o  4x −959897959/4195144800 check −2160649801/10487862000   (check)
K2s  4x −31256633/419514480   check −209546801/2621965500     (4x, margin 0.0054)
Q8o  4x −14563139/209757240   check −1941573583/20975724000   (4x)
Q7o  4x −64699807/233063600   check −549008027/2621965500     (check)
J8s  4x 64357133/599306400    check 5101857/52969000          (4x)
JTo  4x 243351613/1398381600  check 462669397/4195144800      (4x)
J9o  4x −953443/13620600      check −202144889/5243931000     (check)
T9s  4x 15536221/83902896     check 2155095367/10487862000    (check)
33   4x 61847329/699190800    check 39089459/5243931000       (4x)
22   4x −150961079/524393100  check −470586269/2621965500     (check)
72o  4x −141008727/66589600   check −2645357879/2996532000
All 169 classes: 4x set == chart preflop (§7.1). 3x never best.

# flop (EV in antes; hole | flop -> 2x, check)
9s 7d | 9h Kc 2s  -> 154367/178365, 10203/23782      (2x)
7c 6d | Kh 7s 2d  -> 686351/1070190, 3180/11891      (2x)
8h 3c | Ah Kd 3s  -> −6421/35673, −30619/97290       (2x)
Qc 5d | Qs 5h 9d  -> 58549/23265, 102591/59455       (2x)
Th 4h | Jh 8h 2c  -> 6791/19458, 68041/214038        (2x)
9h 4h | Jh 8h 2c  -> 18608/107019, 279407/1070190    (check)
9c 8d | Ks Kd 4c  -> −828371/535095, −408029/356730  (check)
9c 8d | Ts 7h 2c  -> −3809/16215, −24974/178365      (check)
2c 2d | Kd 9c 5h  -> −1031141/1070190, −307123/356730 (check)
2c 2d | 9s 9h 5c  -> −6749/23782, −23377/178365      (check; basic says 2x)
7h 6h | 8h 5c 2h  -> 2403509/2140380, 2234863/2140380 (2x; basic says check)
Tc 8d | Js 9c 4h  -> −163271/1070190, −27322/178365  (2x by 0.0006)
Kc 3d | 8s 5h 2c  -> −44531/32430, −1186027/1070190  (check)
Jd 5c | 5h 5s Kc  -> 178927/46530, 1054403/356730    (2x)

# river (EV(1x) in antes; fold = −2; dealer outs per §7.1)
Td 4c | Ts Kh 7d 3s 2c -> 43/165      outs 3   (1x)   W/T/L 726/6/258
Qc 7d | Kd Jh 9s 5c 2d -> −601/330    outs 19  (1x)   Wq 0 Wn 256 T 9 Lq 609 Ln 116
Jd 8c | Kh Qs 4d 3c 2h -> −1871/990   outs 19  (1x)
8c 6d | Kh Qs 4d 3c 2h -> −2467/990   outs 31  (fold)
Jc 9d | 8s 8h 5c 3d 2s -> −193/90     outs 23  (fold)
6s 5d | Kh Kd 9c 9s 3h -> −479/198    outs 28  (fold)
7d 5c | Jh 9s 8d 3c 2h -> −221/90     outs 31  (fold)
4c 3d | As Ks Qs Jd Th -> −3/22       outs 0   (1x)   T 945, L 45
2c 4h | Qc Qh Kh Qs 9d -> fold is best though outs = 19 (1x ≈ −2.1242)
6d 5s | Kh 6h 8h 7c Qh -> fold is best though hidden pair (1x ≈ −2.0343)

# Trips (EV per 1 unit)
8-6-5 −48987/2572780 ; 9-7-4 −301629/33446140 ; 8-7-4 −233985/6689228 ; 7-6-5 −115779/2572780 ; 8-6-4 −545459/8361535
P(Trips pays) = 60085/393484
# mentioned-only side bets
Six Card 1000/200/100/20/15/10/7: −12816/149695 ; 1000/200/50/20/15/10/5: −70366/363545
Progressive example ($1): fixed return 0.530569150737 ; jackpot coefficient 19/6497400 per $ of meter ; break-even ≈ 160530.53

# hourly (30 hands/hour)
perfect $10: 6.555 ; basic $10: 7.144 ; simple $10: 8.123 ; Trips $5 8-6-5: 2.856
```

---

## 12. Verification notes and sources

**Computed in this spike** (exact unless marked):
* Evaluator category counts (5, 6 and 7 cards), distinct-value counts (7,462 / 4,824), and best-of-7 =
  max over 21 five-card subsets (2,000,000 random hands, 0 mismatches). `eval.h`, `counts.c`, `distinct.c`.
* The full UTH solution: every canonical flop (1,755 suit classes, weighted), every turn/river, every
  player hand and every dealer hand, with dealer outcome counts from a sorted sweep with
  inclusion–exclusion. All EVs are exact integers over stated denominators (`solve.c`, `solve3.c`,
  `analyze.py`, `easy.py`). It runs in ≈ 25 min on 4 cores.
* Spot EVs (`spot.mjs`, an independent JS port that enumerates directly, without the sweep). It agrees with the
  solver's preflop table and with every pinned spot.
* Showdown and Bad Beat probabilities over 134,459 canonical boards (`bb.c`).
* Trips, Six Card and progressive edges from exhaustive counts (`sidebets.py`, Python `fractions`).
* **Monte Carlo** (estimates, labelled "≈ simulated"): the hourly percentiles, P(losing hour) and bust rates
  (`mc.c`, 30 million hands with the basic card; 200,000 sessions per bankroll). The same run checks basic EV
  (−0.02385 ± 0.0009 vs exact −0.023814) and AKs 4x (1.650 ± 0.006 vs 1.6583).
* River rule vs perfect: 34 disagreements in 3,000 random river spots (`dis2.mjs`).
* Every scene's forced deal (9 distinct, valid cards) and every outcome a step describes, plus every
  quiz with a `hand:` whose answer is a decision, were checked against the engine math (`check_doc.py`).

**Cited, not computed**:
* The rules and the Blind table: casino rack cards and game guides (Crown Sydney, Tulalip, Sun International,
  Treasury Brisbane, Club Hotel Loutraki) and pokerlistings.com. Every source uses Blind 500/50/10/3/3:2/1.
* Trips tables seen in the wild: 8-7-4 (Tulalip, Crown Sydney), 7-6-5 (Sun International); 8-6-5 is the
  usual Shuffle Master table (D6a).
* Published game edge "≈ 2.19% of the Ante" (Crown Sydney, Treasury Brisbane ≈ 2.18%) and "≈ 0.53% of
  total wagered": they agree with our exact 2.185% / 0.526%.
* The basic strategy is the classic published simple strategy (Wizard of Odds' UTH page). That page wasn't
  reachable from this container, so the rules are the well-known version, and their formalisation and every
  number for them are ours.
* Six Card Bonus mechanics (best 5 of 6: your 2 hole cards plus 4 more) and its two example tables: OnTheStrip
  and Vegas Aces guides, plus the NJ regulation's separate bonus-card area. The edge doesn't depend on which 4
  cards are used, as long as they're unseen.
* Progressive structure (hole cards + flop; 100% / 10% of the meter; fixed lower awards): PA and Caesars
  rack cards. **The $1 example table in lesson 20 is illustrative, not a specific casino's.**

Sources (seen through search; direct fetches were blocked from this container):
[Crown Sydney game guide](https://www.crownsydney.com.au/getmedia/7e0e7cf9-52b9-40c5-bb26-59619e59aa22/Crown-Sydney-Gaming-Game-Guide-Poker-Ultimate-Texas-Holdem.pdf) ·
[Tulalip rack card](https://www.tulalipresort.com/wp-content/uploads/2024/04/ONEclub_0920_GameRules_RackCard_UltimateTexasHoldem-WEB.pdf) ·
[Sun International guide](https://suninternational.com/content/dam/suninternational/activities/gaming/documents/casino-tables-poker-texas-holdEm.pdf) ·
[Treasury Brisbane guide](https://www.treasurybrisbane.com.au/sites/treasurybrisbane.com.au/files/tbne_qld_gaming_guide_-_ultimate_texas_hold_em.pdf) ·
[Club Hotel Loutraki terms](https://www.clubhotelloutraki.gr/casino/wp-content/uploads/2023/02/clubhotelloutraki_casino_ultimate-texas-holdem_terms_en.pdf) ·
[PokerListings](https://www.pokerlistings.com/how-to-play-ultimate-texas-holdem) ·
[Wizard of Odds UTH](https://wizardofodds.com/games/ultimate-texas-hold-em/) ·
[OnTheStrip](https://onthestrip.com/casinos/ultimate-texas-holdem-on-the-strip/) ·
[Vegas Aces](https://www.vegas-aces.com/learn/how-to-play-ultimate-texas-holdem/) ·
[NJ 6-card bonus regulation](https://nj.gov/oag/ge/docs/TempRegs/SHFL6cardbonusfivepokerderivatives.pdf) ·
[PA gaming guide](https://edge.sitecorecloud.io/cordishc-4m5nplkf/media/Files/Pittsburgh/Gaming-Guides/Updated-2021-Gaming-Guides/PA-Gaming-GuidesULTIMATE-TEXAS-HOLDEM.pdf?rev=-1) ·
[Caesars rack card](https://www.caesars.com/content/dam/ccr/Gaming/tableGames/Ultimate%20Texas%20Holdem_Rack_Card.pdf)

**Teaching sequence**: casino guides teach the flow (bets → deal → three decisions → settlement → paytables).
Strategy guides teach the preflop chart, then flop rules, then the river outs count. This course follows that
order, puts EV and the EV sheet before strategy, and adds the metrics, variance and fun-per-dollar chapters
that casino guides leave out.

---

## 13. Assumptions and open points for decisions.md

1. **`simple` redefinition** (§7.1): the draft's `simple` costs 16.06%. The proposed definition costs 0.52% more
   than perfect. Sent to main. Lessons 16 and 18 depend on it.
2. **The basic river "hidden pair or better" test** = category(7 cards) ≥ pair and > category(board). The
   simulator's wording may differ in rare spots, and decisions.md should fix one definition for both the code
   and the pinned value (−54758439/2299422125 under this definition).
3. **Decision tiers** use the simulator's thresholds (0.02 / 0.10 / 0.50 antes). K4o 4x (0.023) is therefore
   "Small mistake", and the lesson copy says so.
4. **Hands per hour = 30** (D10), and **bust** = bankroll below 6 antes (can't cover a full 4x hand).
5. **Scene schema** (§1.2) is a proposal. `simulator.md` owns `SceneConfig`, and the content WPs adapt field
   names if they differ. This file needs: forced deals per hand, `startAt`, `best: true` with **Try again**
   (replay the same forced deal when a `best` step is missed), `tap` targets, `autoPlay` with `compare`
   specs (strategy, ante, trips) and `sessions` with a `bust-rate` chart.
6. **Mentioned-only side bets**: the Six Card description is "your 2 hole cards plus 4 more". The
   progressive example table is illustrative. Bad Beat has no single edge, so the app gives the probabilities.
7. **Chart cells** marked "close" use margin < 0.03 antes.
8. **Hand-ranking teaching** is one refresher lesson (D8). Its table of "how often in 7 cards" comes from the evaluator test counts.
