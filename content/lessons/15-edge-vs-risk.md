---
id: edge-vs-risk
title: "House edge, element of risk and cost per hour"
chapter: perfect-practical
summary: "Three honest numbers for the same game, and the one that pays your bills."
minutes: 7
sources:
  - woo-uth-figures
  - guide-treasury-brisbane
---

You'll see three different numbers quoted for UTH's house edge. They all describe the same game; they just
divide the same expected loss by different things.

| Name | Divides the expected loss by | Perfect play |
|---|---|---|
| **House edge per Ante** | your Ante | **2.185%** |
| Edge per initial wager | your Ante + Blind | 1.092% |
| **Element of risk** | everything you put in action, raises included (4.15 antes on average) | **0.526%** |

The 2.185% and 0.526% figures are computed exactly by the app and agree with the Wizard of Odds analysis[^1]; the Treasury Brisbane gaming guide quotes about 2.18% and 0.53%[^2].

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
how fast the dealer is. Change it in **Settings → Hands per hour**, and every per-hour figure on the EV
sheet, in Drill and in auto-play scales with it.

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
