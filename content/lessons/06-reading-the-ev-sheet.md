---
id: reading-the-ev-sheet
title: "Reading the EV sheet (and why 3x is never right)"
chapter: ev-basics
summary: "Best play, close calls and big mistakes, plus the 3x trap."
minutes: 7
---

Whenever you have a decision, the EV sheet lists every option:

> **Bet 4x**: +$36.01 · **Best play**
>
> **Bet 3x**: +$28.97 · −$7.04 vs best · **Big mistake**
>
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
* If b < 0: EV(3) = a + 3b < a + b = EV(check, then always bet 1x) ≤ EV(check, then play the river perfectly).

For aces: EV(4x) = 472094411/131098275 ≈ 3.6011, EV(3x) ≈ 2.8970, EV(check) = 38331809/17479770 ≈ 2.1929.
Playing perfect strategy except always betting 3x instead of 4x raises the house edge from 2.19% to **9.86%**.
:::

```scene
id: l06-s1
version: 1
title: Three options, one best
bankroll: 50000
bets: { ante: 1000 }
seed: 601
showEV: true
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [As, Ad] }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: compare
    text: "Tap **Bet 3x** and **Check** to see their lines on the EV sheet. Don't confirm yet."
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    hint: "Not yet: this step is for reading. Tap Bet 3x and Check to see their lines; you confirm on the next step."
    expect: [ { type: fold } ] # nothing can be confirmed here (no fold exists preflop), previewing is the point
    completeWhen: { any: [ { all: [ { previewed: { option: play-3 } }, { previewed: { option: check } } ] }, { street: settled } ] }
  - id: decide
    text: "4x is +$36.01, 3x +$28.97, check +$21.93. Confirm the **Best play**."
    hint: "3x is never the best play."
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { any: [ { bestDecisions: { count: 1, street: preflop } }, { street: settled } ] }
  - id: finish
    text: "The hand plays out."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
```

```scene
id: l06-s2
version: 1
title: A big mistake, on purpose
bankroll: 50000
bets: { ante: 1000 }
seed: 602
showEV: true
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [7s, 2d] }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: look
    text: "Tap **Bet 4x** on seven-deuce, but don't confirm. See the red **Big mistake** badge and the suggested alternative."
    allowedActions: [check, play]
    allowedOptions: [play-4, check]
    expect: [ { type: check } ]
    hint: "Look at the badge first, then choose **Check**."
    completeWhen: { any: [ { previewed: { option: play-4 } }, { street: flop } ] }
  - id: decide
    text: "Now tap **Check**, the better option."
    allowedActions: [check, play]
    allowedOptions: [play-4, check]
    expect: [ { type: check, best: true } ]
    completeWhen: { any: [ { bestDecisions: { count: 1, street: preflop } }, { street: flop } ] }
  - id: finish
    text: "Play out the rest of the hand using the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
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
