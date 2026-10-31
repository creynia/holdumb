---
id: river-call-or-fold
title: "The river: bet 1x or fold"
chapter: perfect-lowest-edge
summary: "Folding costs 2 antes for sure. Bet 1x when that's worse."
minutes: 8
sources:
  - woo-uth-strategy
  - grosjean-uth
---

You've checked twice and all five community cards are out. Now it's **bet 1x or fold**.

Folding is easy to price: you lose your Ante and your Blind, **exactly 2 antes**, every time. So the
question is: **does betting 1x lose less than 2 antes on average?**

If you bet 1x and win, you collect on Play and usually on the Ante (+2). If you lose, you lose Ante, Blind
and Play (−3). You're only putting 1 extra Ante at risk, to protect the 2 you'd give up by folding. That's
why the bar is low: when the dealer qualifies, **winning about 1 time in 5 is enough**.

Rule one is simple: **with a hidden pair or better, always bet 1x.** {{Td 4c}} on {{Ts Kh 7d 3s 2c}}
(a pair of tens) has an EV of **+0.261** for 1x against −2 for folding.

Without a pair it's closer, and you need to know how many dealer hands beat you. Lesson 12 shows a
quick way to count. The "fewer than 21 outs" rule comes from the Wizard of Odds strategy[^1], where the river rules are credited to James Grosjean[^2]. For now, look at the EV sheet:

| You | Board | Bet 1x | Fold | Best |
|---|---|---|---|---|
| {{Td 4c}} | {{Ts Kh 7d 3s 2c}} | **+0.261** | −2 | 1x (hidden pair) |
| {{Qc 7d}} | {{Kd Jh 9s 5c 2d}} | **−1.821** | −2 | 1x (queen high, but enough wins) |
| {{8c 6d}} | {{Kh Qs 4d 3c 2h}} | −2.492 | **−2** | Fold (eight high) |
| {{4c 3d}} | {{As Ks Qs Jd Th}} | **−0.136** | −2 | 1x (the board plays: mostly ties) |

{{Qc 7d}} loses money either way. Betting 1x loses 1.82 antes on average and folding loses 2, so you play.
Your queen high beats every dealer hand that didn't pair, and when the dealer doesn't qualify your
Ante can't lose.

When the board makes the best hand for everyone, as with {{As Ks Qs Jd Th}}, always bet 1x. Most of the
time it's a tie and everything pushes, which is much better than losing 2 antes.

:::math The "1 in 5" bar
Ignore ties and Blind bonuses for a moment, and say the dealer qualifies. Bet 1x: win +2 (Ante + Play), lose
−3 (Ante + Blind + Play). EV(1x) = 2w − 3(1 − w) = 5w − 3, which beats −2 when **w > 1/5**.

When the dealer doesn't qualify, the Ante pushes. Then a win pays +1 (Play) and a loss costs −2 (Blind +
Play), so EV(1x) = w − 2(1 − w) = 3w − 2, which beats −2 for **any** w > 0. Against a dealer who missed,
playing is never worse than folding. That's why "queen high" can be a 1x hand: many of its wins come
against dealers who don't qualify.

Exact for {{Qc 7d}} on {{Kd Jh 9s 5c 2d}}: of 990 dealer hands, you beat 256 (all non-qualifying), tie 9
and lose to 725 (609 qualifying, 116 not). EV(1x) = (256 × 1 − 609 × 3 − 116 × 2) / 990 = −601/330 ≈ −1.821.
:::

```scene
id: l11-s1
version: 1
title: Bet 1x or fold?
bankroll: 100000
bets: { ante: 1000 }
seed: 1101
showEV: true
steps:
  - id: h1
    text: "Four river decisions. Hand 1: the turn paired your ten."
    hint: "A hidden pair: always bet 1x."
    startAt: { street: river, deal: { player: [Td, 4c], flop: [Kh, 7d, 3s], turn: Ts, river: 2c } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
  - id: h2
    text: "Hand 2: queen high."
    hint: "Folding is −2 antes; compare with that."
    startAt: { street: river, deal: { player: [Qc, 7d], flop: [Kd, Jh, 9s], turn: 5c, river: 2d } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
  - id: h3
    text: "Hand 3: eight high."
    hint: "Almost every dealer hand beats you."
    startAt: { street: river, deal: { player: [8c, 6d], flop: [Kh, Qs, 4d], turn: 3c, river: 2h } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
  - id: h4
    text: "Hand 4: the board is a royal straight."
    hint: "When the board plays, it's usually a tie."
    startAt: { street: river, deal: { player: [4c, 3d], flop: [As, Ks, Qs], turn: Jd, river: Th } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
```

```quiz
- q: How much does folding on the river cost?
  options: ["1 Ante", "2 Antes", "3 Antes", "It depends on the dealer's cards"]
  answer: 1
  explain: "You give up your Ante and Blind: exactly 2 antes."
- q: You have a hidden pair on the river. What's the play?
  options: ["Always bet 1x", "Fold unless it's a high pair", "Bet 1x only if the board has no flush draw", "Fold"]
  answer: 0
  explain: "A hidden pair or better is always worth playing."
- q: Why can betting 1x be right even when its EV is negative (say −1.8 antes)?
  options: ["It can't", "Because folding is −2, which is worse", "Because the Blind might pay", "Because of the Trips bet"]
  answer: 1
  explain: "Compare it with folding, not with zero."
- q: What's the best river play?
  hand: { hole: 4c 3d, board: As Ks Qs Jd Th }
  options: ["Bet 1x", "Fold"]
  answer: 0
  explain: "The board plays, so it's usually a tie. Betting 1x costs 0.136 antes on average, and folding costs 2."
```
