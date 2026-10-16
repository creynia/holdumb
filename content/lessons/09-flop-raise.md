---
id: flop-raise
title: "The flop: bet 2x or check"
chapter: perfect-lowest-edge
summary: "Hidden pairs, two pair and good flush draws are 2x hands."
minutes: 8
---

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
| {{9s 7d}} | {{9h Kc 2s}} | **+0.865** | +0.429 | 2x (hidden pair) |
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
* Check: for each turn and river, take the better of "bet 1x" and "fold (−2)", then average.

{{9s 7d}} on {{9h Kc 2s}}: EV(2x) = 154367/178365 ≈ 0.8655; EV(check) = 10203/23782 ≈ 0.4290.
:::

```scene
id: l09-s1
version: 1
title: Hidden pair, bet 2x
bankroll: 50000
bets: { ante: 1000 }
seed: 901
showEV: true
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [9s, 7d], flop: [9h, Kc, 2s] }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: preflop
    text: "Nine-seven offsuit isn't a 4x hand: **Check**."
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: flop
    text: "Your 9 pairs the board: a **hidden pair**. Check the EV sheet, then make the best play."
    hint: "A pair that uses your card: bet 2x."
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: finish
    text: "The rest of the cards are dealt and the hand is settled."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
```

```scene
id: l09-s2
version: 1
title: Three flops, three calls
bankroll: 100000
bets: { ante: 1000 }
seed: 902
showEV: true
steps:
  - id: h1
    text: "Hand 1: you checked preflop. Four hearts, with the ten of hearts in your hand."
    hint: "Four to a flush with a ten or better of that suit in hand: bet 2x."
    startAt: { street: flop, deal: { player: [Th, 4h], flop: [Jh, 8h, 2c] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h1-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h2
    text: "Hand 2: the same flop, but your best heart is the nine."
    hint: "Below a ten: check."
    startAt: { street: flop, deal: { player: [9h, 4h], flop: [Jh, 8h, 2c] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h2-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h3
    text: "Hand 3: a pair of kings on the board, nothing in your hand."
    hint: "A pair on the board belongs to the dealer too."
    startAt: { street: flop, deal: { player: [9c, 8d], flop: [Ks, Kd, 4c] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h3-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
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
