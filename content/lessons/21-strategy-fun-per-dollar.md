---
id: strategy-fun-per-dollar
title: "Perfect strategy III: the most fun per dollar"
chapter: perfect-fun
summary: "Choose your evening's price, then spend it on what you enjoy."
minutes: 8
---

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
| $10 Ante + $5 Six Card Bonus | $19.99 | About twice the standard cost |
| $25 Ante, basic card | $17.86 | Big swings |

**Our recipe for the most fun per dollar:**

1. **Play the main game well.** The basic card is cheap fun: every hand gives you a real decision.
2. **If you like a side bet, make it Trips at an 8-6-5 (or 9-7-4) table**, and pay for it by
   **lowering your Ante**. $5 Ante + $5 Trips costs less per hour than $10 Ante alone ($6.43 vs $7.14
   with the basic card), and you get a payout most hours.
3. **Skip Six Card Bonus** and anything above 5%. The same $12.84 an hour buys you almost two more hours of the main game.
4. **Treat progressives as a lottery ticket.** Only the meter tells you the price. On the example table,
   below ≈ $160,500 it loses money, and below ≈ $46,500 it loses a third or more of every dollar.
5. **Count the memorable moments.** At 30 hands an hour you'll bet 4x about 11 times, make a straight or
   better about 3 times, and hit Trips about 4.6 times. The count is the same whatever stake you choose,
   so choose the stake that lets you play the hours you want.

:::math The hourly figures
Cost per hour = 30 × (Ante × edge per Ante + Trips × Trips edge + other side bet × its edge).
Basic card 2.3814%; Trips 8-6-5 1.9040%, 8-7-4 3.4979%; Six Card 8.5614%; progressive example 32.32% at a
$50,000 meter. For example, $10 + $5 Trips = 30 × ($10 × 0.023814 + $5 × 0.019040) = $10.00.
Straight or better in seven cards: 13,967,280 of 133,784,560 = 10.44%.
:::


```scene
id: l21-s1
version: 1
title: Two evenings, similar price
bankroll: 1000000
bets: { ante: 1000 }
seed: 2101
showEV: true
allowedActions: []
ui: { speed: fast }
autoPlay:
  enabled: true
  defaultStrategy: { id: basic, ante: 1000, trips: 0 }
  handOptions: [120]
  sessions: [1]
  compare:
    - { id: basic, ante: 1000, trips: 0 }
    - { id: basic, ante: 500, trips: 500 }
steps:
  - id: run
    text: "Run two 4-hour evenings on the same cards: $10 Ante alone, or $5 Ante + $5 Trips."
    completeWhen: { autoPlayCompleted: { minHands: 120 } }
  - id: read
    text: "The expected costs are close (about $29 vs $26). The **Trips hits** line in the summary shows how often the side bet paid on the second evening."
    completeWhen: { acknowledged: true }
    advance: button
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
