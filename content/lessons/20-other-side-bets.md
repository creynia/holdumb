---
id: other-side-bets
title: "Six Card Bonus, progressives and Bad Beat"
chapter: perfect-fun
summary: "The bets the app doesn't deal, and what they cost."
minutes: 7
---

Some UTH tables offer more side bets. The app doesn't deal them, but here's what they cost.

**Six Card Bonus.** It pays on the best five cards out of six: your two hole cards plus four more. On the
common 1000/200/100/20/15/10/7 table (royal, straight flush, quads, full house, flush, straight, trips),
the house edge is **8.56%**. On a 1000/200/50/20/15/10/5 table it's **19.36%**. A $5 Six Card bet costs about
**$12.84 an hour** at the better table, about four and a half times what $5 on Trips costs.

**Progressive jackpot.** It's usually a $1 to $5 bet on your two hole cards plus the flop. It pays a share
of a growing meter for a royal flush (100%) or straight flush (often 10%), and fixed amounts for smaller
hands. These awards are paid "for 1": the casino keeps your $1, so a "$300" award is $299 profit. A royal in those five cards comes 1 time in **649,740**. On one example $1 table (royal 100%,
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
  explain: "On the example table the bet breaks even only when the meter passes about $160,500."
```
