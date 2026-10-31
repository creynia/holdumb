---
id: strategy-practical
title: "Perfect strategy II: the card you can remember"
chapter: perfect-practical
summary: "A strategy card that costs 59¢ an hour more than perfect."
minutes: 8
sources:
  - woo-uth-strategy
  - grosjean-uth
---

The EV sheet plays perfectly, but at a real table you only have your memory. Here's the card that most
strong players use: the Wizard of Odds basic strategy[^1], with flop and river rules after James Grosjean[^2]. The prices below are computed by the app.

**The basic card**

* **Preflop: bet 4x** with 33+, any ace, any suited king, K5o+, Q6s+, Q8o+, J8s+, JTo. Otherwise check.
* **Flop: bet 2x** with two pair or better (using your cards), a hidden pair (not pocket deuces), or four to
  a flush with a ten or better of that suit in hand. Otherwise check.
* **River: bet 1x** with a hidden pair or better, or fewer than 21 dealer outs. Otherwise fold.

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
far more than all the other simplifications put together. "Bet 1x only with a pair" sounds safe, but it
folds hands that win often enough. Even with the chart's preflop and the basic flop rule, a river rule of
"bet 1x only with a hidden pair or better" raises the edge from 2.19% to **7.13%**. Simplifying preflop to
"any pair or ace" costs 3.5% on its own. Keep the chart's preflop rules and the outs count, and you're within
pennies of perfect.

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
