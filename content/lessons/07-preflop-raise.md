---
id: preflop-raise
title: "Preflop: when to bet 4x"
chapter: perfect-lowest-edge
summary: "The exact preflop chart, in eight short rules."
minutes: 8
sources:
  - woo-uth-strategy
  - pokerlistings-uth
---

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
the app solved every hand, and all 169 kinds match these rules. The same list is published in the Wizard of Odds strategy[^1] and in the PokerListings guide[^2]. You'll bet 4x on **500 of the 1,326 hands
(37.7%)**.

```chart
strategy: perfect
view: preflop-grid
highlight: ["33", "A2o", "K2s", "K5o", "Q6s", "Q8o", "J8s", "JTo"]
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

Overall: −0.02185 antes per hand. 37.71% of hands are 4x, 21.28% bet 2x on the flop, 21.82% bet 1x on the
river and 19.19% fold.
:::

```scene
id: l07-s1
version: 1
title: Preflop calls
bankroll: 100000
bets: { ante: 1000 }
seed: 701
showEV: true
practice: true
steps:
  - id: h1
    text: "Six hands. Make each preflop call from the eight rules; the EV sheet appears after you confirm. Hand 1: ace-three offsuit."
    hint: "Any ace is a 4x hand."
    startAt: { street: preflop, deal: { player: [Ac, 3d] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h1-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h2
    text: "Hand 2: king-seven offsuit."
    hint: "Offsuit kings: K5 and up."
    startAt: { street: preflop, deal: { player: [Kh, 7c] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h2-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h3
    text: "Hand 3: queen-nine offsuit."
    hint: "Offsuit queens: Q8 and up."
    startAt: { street: preflop, deal: { player: [Qd, 9s] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h3-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h4
    text: "Hand 4: jack-nine offsuit."
    hint: "Offsuit jacks need a ten: JT."
    startAt: { street: preflop, deal: { player: [Js, 9h] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h4-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h5
    text: "Hand 5: pocket threes."
    hint: "Every pair from 33 up."
    startAt: { street: preflop, deal: { player: [3h, 3s] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h5-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h6
    text: "Hand 6: ten-nine suited."
    hint: "Top card a ten or lower, not a pair: check."
    startAt: { street: preflop, deal: { player: [Th, 9h] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h6-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
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
