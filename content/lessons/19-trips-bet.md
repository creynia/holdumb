---
id: trips-bet
title: "The Trips bet"
chapter: perfect-fun
summary: "A side bet on your own hand. Its price depends entirely on the paytable."
minutes: 7
---

**Trips** is an optional bet you make before the deal. It pays if your final hand (your two cards plus the
five on the board) is **three of a kind or better**. The dealer's hand doesn't matter, and neither does
whether you fold. The standard table (`trips-8-6-5`):

| Your hand | Pays | How often |
|---|---|---|
| Royal flush | 50 to 1 | 1 in 30,940 |
| Straight flush | 40 to 1 | 1 in 3,591 |
| Four of a kind | 30 to 1 | 1 in 595 |
| Full house | 8 to 1 | 1 in 38.5 |
| Flush | 6 to 1 | 1 in 33.1 |
| Straight | 5 to 1 | 1 in 21.6 |
| Three of a kind | 3 to 1 | 1 in 20.7 |
| Anything less | loses | 84.7% |

It pays **about 1 hand in 6.5** (15.3%), or about 4.6 times an hour. The house edge is **1.90%** of the
Trips bet: a little cheaper than the main game per Ante, and a fair price for the excitement.

**The paytable is everything.** Casinos change the middle rows, and small changes matter a lot:

| Table (Full house / Flush / Straight) | House edge | Cost per hour, $5 Trips | Tier |
|---|---|---|---|
| 9 / 7 / 4 | 0.90% | $1.35 | Good bet |
| **8 / 6 / 5 (standard)** | **1.90%** | **$2.86** | Good bet |
| 8 / 7 / 4 | 3.50% | $5.25 | Fair |
| 7 / 6 / 5 | 4.50% | $6.75 | Fair |
| 8 / 6 / 4 | 6.52% | $9.79 | Poor bet |

Read the felt before you bet. If the straight pays 4 and the flush 6, walk to the next table.

**Trips never changes your play.** Its result depends only on your cards, not on any decision you make.
Keep playing the main game by the chart. Don't make bigger raises because Trips is riding.

:::math The Trips EV, row by row (8-6-5 table)
EV per $1 = Σ P(hand) × (pays) − P(lose):
royal 0.0016 + straight flush 0.0111 + quads 0.0504 + full house 0.2077 + flush 0.1815 + straight 0.2310 +
trips 0.1449 = 0.8283 returned on wins, minus 0.8473 lost on everything else = **−0.01904**.
Exact: −48987/2572780. The other tables: 9-7-4 −301629/33446140, 8-7-4 −233985/6689228,
7-6-5 −115779/2572780, 8-6-4 −545459/8361535.
:::


```scene
id: l19-s1
version: 1
title: Trips pays, the hand loses
bankroll: 50000
bets: { ante: 1000, trips: 500 }
showEV: true
steps:
  - id: deal
    text: "You have $5 on Trips. Tap **Deal**."
    deals:
      - { player: [7c, 7d], dealer: [Qh, 8s], flop: [7h, Ks, 9d], turn: Td, river: Jc }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: bet
    text: "Pocket sevens: **Bet 4x**."
    allowedActions: [play]
    allowedOptions: [play-4]
    expect: [ { type: play, option: play-4 } ]
    completeWhen: { street: settled }
  - id: result
    text: "Three sevens! The dealer makes a straight and wins the hand: Ante, Blind and Play lose (−$60). But Trips pays **3 to 1: +$15**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: You fold on the river holding three of a kind (two of them on the board). What happens to your Trips bet?
  options: ["It loses with the fold", "It pushes", "It pays 3 to 1", "It pays only if the dealer qualifies"]
  answer: 2
  explain: "Trips is paid on your own hand, even after a fold."
- q: Which Trips paytable is the best for you?
  options: ["Full house 8, flush 6, straight 4", "Full house 8, flush 6, straight 5", "Full house 7, flush 6, straight 5", "Full house 8, flush 7, straight 4"]
  answer: 1
  explain: "8-6-5 is 1.90%. The others are 6.52%, 4.50% and 3.50%."
- q: Should you raise more often when you have a Trips bet?
  options: ["Yes", "No, Trips doesn't depend on your decisions"]
  answer: 1
  explain: "Your Trips result is fixed by your cards. Play the main game normally."
```
