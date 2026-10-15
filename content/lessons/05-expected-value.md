---
id: expected-value
title: "EV and the house edge, in plain English"
chapter: ev-basics
summary: "What a decision is worth on average, and what the game costs."
minutes: 7
---

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

Here's what decisions are worth. If you never raised early and always bet 1x at the river, never folding,
you'd lose **40.7% of your Ante per hand**. That's almost twenty times more. The Ante and the Blind are
built to lose if you just ride them to showdown. Your raises with strong hands, and your folds with hopeless
ones, win nearly all of it back.

:::math Where the 40.7% comes from
If you always bet 1x at the river, the Play bet is a pure coin flip. You win and lose equally often
(47.97% each), so its EV is exactly 0. Look at the other two bets:

* **Ante**: it's paid only when the dealer qualifies, but it is lost whenever a qualifying dealer beats you.
  It wins 33.73% and loses 45.21% of the time: EV = −1330653811/11589087510 ≈ **−0.1148** antes.
* **Blind**: it pays only on a straight or better, but it loses every hand you lose: EV ≈ **−0.2922** antes.

Total: −6432686411/15803301150 ≈ **−0.4070** antes per hand.

Under perfect play the EV is −50643648973/2317817502000 ≈ **−0.021850** antes. These are exact
enumerations over every deal (§12).
:::

```scene
id: l05-s1
version: 1
title: Meet the EV sheet
bankroll: 50000
bets: { ante: 1000 }
seed: 501
showEV: true
steps:
  - id: deal
    text: "Tap **Deal**. The **EV sheet** lists every option with its average result for the whole hand."
    deals:
      - { player: [Ah, Kd] }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: decide
    text: "Ace-king offsuit: **Bet 4x** is +$11.72, **Check** is +$5.69. Pick the best option."
    hint: "Look for the **Best play** badge."
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: finish
    text: "Whatever happens next is luck. Your decision was worth **+$11.72** on average."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: done
    text: "That's the whole idea of EV: judge the decision, not the result."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l05-s2
version: 1
title: A hand that loses either way
bankroll: 50000
bets: { ante: 1000 }
seed: 502
showEV: true
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [7s, 2d] }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: decide
    text: "Seven-deuce: every option is negative. Find the one that loses least."
    hint: "**Check** loses $8.83 on average; betting 4x loses $21.18."
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: finish
    text: "Play the rest of the hand however the EV sheet suggests."
    allowedActions: [check, play, fold]
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
