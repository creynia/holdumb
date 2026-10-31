---
id: strategy-lowest-edge
title: "Perfect strategy I: the whole picture"
chapter: perfect-lowest-edge
summary: "Everything on one page, and what 'perfect' can and can't do."
minutes: 7
sources:
  - woo-uth-strategy
  - grosjean-uth
  - woo-uth-figures
---

Here's the lowest-edge strategy for the standard Blind paytable. Its rules are the ones the Wizard of Odds publishes as basic strategy[^1], with flop and river rules after James Grosjean[^2]:

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
| Bet 1x on the river | 21.8% |
| Fold on the river | 19.2% |

On average you'll have **4.15 antes** in action per hand, and lose **2.185% of one Ante** per hand (the app computes this exactly; it agrees with the Wizard of Odds figure[^3]). At a $10
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

```scene
id: l13-s1
version: 1
title: Ten perfect hands
bankroll: 100000
bets: { ante: 1000 }
seed: 1301
showEV: true
ui: { showSession: true }
steps:
  - id: play
    text: "Play 10 hands. Before you confirm each decision, check the EV sheet and choose the **Best play**."
    completeWhen: { hands: 10 }
  - id: session
    text: "Open the **session** panel. Your decision cost vs perfect should read $0.00, and your result is just luck."
    completeWhen: { tapped: session }
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
