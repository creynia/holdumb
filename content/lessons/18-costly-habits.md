---
id: costly-habits
title: "What common habits really cost"
chapter: perfect-practical
summary: "The leaks players actually have, priced exactly."
minutes: 6
---

Each line below is a whole strategy played the same way every hand, with everything else perfect. The
figures are exact, at a $10 Ante and 30 hands an hour.

| Habit | House edge per Ante | Cost per hour | Extra vs perfect |
|---|---|---|---|
| Perfect play | 2.19% | $6.55 | — |
| Basic card | 2.38% | $7.14 | $0.59 |
| Simple card | 2.71% | $8.12 | $1.57 |
| 4x only with pairs and aces | 5.65% | $16.94 | $10.39 |
| Never bet 2x on the flop | 9.42% | $28.26 | $21.70 |
| Bet 3x instead of 4x | 9.86% | $29.58 | $23.02 |
| Check to the river, then play perfectly | 32.03% | $96.10 | $89.55 |
| Never fold (check, check, always 1x) | 40.70% | $122.11 | $115.56 |
| Bet 4x on every hand | 40.70% | $122.11 | $115.56 |
| Check to the river, bet 1x only with a pair | 50.04% | $150.12 | $143.56 |

Three lessons hide in that table.

1. **Waiting is expensive.** "I'll see all the cards first" sounds careful, but it multiplies your cost by
   almost 15. The 4x and 2x bets are where your edge comes from. Strong hands need big bets **early**.
2. **Folding is a skill.** Never folding costs nearly as much as betting 4x on every hand. In fact, both
   cost exactly the same, because if you play every hand to the end, the Play bet is a coin flip and
   only its size changes.
3. **Bet size matters.** 3x leaves a quarter of your best bets on the table. Always choose 4x when you raise
   preflop.

```scene
id: l18-s1
version: 1
title: Careful vs perfect
bankroll: 1000000
bets: { ante: 1000 }
seed: 1801
showEV: true
allowedActions: []
ui: { speed: fast }
autoPlay:
  enabled: true
  defaultStrategy: { id: expert, ante: 1000, trips: 0 }
  handOptions: [300]
  sessions: [1]
  compare:
    - { id: expert, ante: 1000, trips: 0 }
    - { id: check-to-river, ante: 1000, trips: 0 }
steps:
  - id: run
    text: "Run both strategies on the **same cards** for 300 hands: near-perfect play vs 'check to the river'."
    completeWhen: { autoPlayCompleted: { minHands: 300 } }
  - id: read
    text: "The expected lines say it all: about −$68 vs about −$961 over 300 hands. Results wobble, but the gap is real."
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Which habit costs the most?
  options: ["Betting 3x instead of 4x", "Checking every hand to the river and playing only with a pair", "Using the basic card", "Never betting the flop"]
  answer: 1
  explain: "50% of the Ante: about $150 an hour at $10."
- q: Why do "never fold" and "bet 4x every hand" cost exactly the same?
  options: ["Coincidence", "If every hand goes to showdown, the Play bet is a coin flip, so its size doesn't change the EV", "Because the Blind pays the same", "They don't"]
  answer: 1
  explain: "Over every possible deal you win and lose equally often, so the Play bet's EV is zero at any size."
- q: The best fix for a player who checks every hand to the river is…
  options: ["Fold more", "Bet 4x preflop with the chart hands", "Add the Trips bet", "Bet 3x instead"]
  answer: 1
  explain: "Early raises with strong hands are where the game's value is."
```
