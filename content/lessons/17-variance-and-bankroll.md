---
id: variance-and-bankroll
title: "Swings, sessions and bankroll"
chapter: perfect-practical
summary: "What a normal hour looks like, and how much to bring."
minutes: 9
---

A 2.19% edge is tiny next to the swings. In one hand you can win 6 antes or lose 6, and rarely win
hundreds (a royal flush pays 500 to 1 on the Blind). The **standard deviation** of one hand is about
**4.94 antes**. Over an hour of 30 hands it's about **27 antes**, while the expected loss is only 0.66
antes. In the short run, **luck is about 40 times bigger than the edge**.

Here's what an hour looks like with the basic card (≈ 1 million simulated hours of 30 hands, results in antes):

| Worst 10% of hours | Bottom quarter | Middle (median) | Top quarter | Best 10% |
|---|---|---|---|---|
| −29.5 or worse | −16 or worse | −1.5 | +13.5 or better | +27.5 or better |

About **52% of hours are losing hours**, and 48% are winning ones.

**How much to bring.** "Busting" here means dropping below 6 antes, when you can no longer cover a full 4x
hand. Chances of busting (≈ simulated, basic card, 30 hands an hour):

| Bankroll | Bust within 1 hour | Bust within 3 hours |
|---|---|---|
| 20 antes ($200 at $10) | 48% | 70% |
| 30 antes | 25% | 52% |
| 40 antes | 11% | 37% |
| 60 antes | 1.1% | 16% |
| 80 antes | 0.05% | 5.5% |
| 100 antes ($1,000 at $10) | ≈ 0% | 1.4% |

A good rule of thumb: **60 antes for an hour, 100 antes for an evening**. If that's more than you want to
risk, play a smaller Ante. Halving the Ante halves the cost and the swings.

Session rules that help:
* Set the bankroll **before** you sit down, and treat it as spent.
* Pick a time limit. The expected cost grows with every hand.
* A win goal ("stop if I'm up 30 antes") doesn't change your EV, but it lets good nights end as good nights.

:::math Where the swing figures come from
The standard deviation per hand under perfect play is exact: √24.3967 ≈ **4.94 antes** (basic card: 4.94 too).
An hour of 30 independent hands has SD ≈ 4.94 × √30 ≈ **27.1 antes**.

The percentiles and bust rates are **simulated** (30 million hands for the hour table, 200,000 sessions per
bankroll), so they're approximate. Real results are lumpy: about a third of the variance comes from rare
Blind bonuses such as royal flushes.
:::


```scene
id: l17-s1
version: 1
title: 300 hands in a few seconds
bankroll: 1000000
bets: { ante: 1000 }
seed: 1701
showEV: true
allowedActions: []
ui: { speed: fast }
autoPlay:
  enabled: true
  defaultStrategy: { id: expert, ante: 1000, trips: 0 }
  handOptions: [300]
  sessions: [1]
steps:
  - id: run
    text: "Start auto-play (300 hands). The app plays near-perfectly for 10 hours of hands."
    completeWhen: { autoPlayCompleted: { minHands: 300 } }
  - id: read
    text: "The dashed line is the expected result (about −$68). Your actual line wanders far above and below it. That's variance."
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l17-s2
version: 1
title: Bankroll test
bankroll: 40000
bets: { ante: 1000 }
seed: 1702
showEV: false
allowedActions: []
ui: { speed: fast }
autoPlay:
  enabled: true
  defaultStrategy: { id: basic, ante: 1000, trips: 0 }
  handOptions: [90]
  sessions: [100]
steps:
  - id: run
    text: "Run **100 sessions** of 3 hours (90 hands) each, starting with $400 (40 antes)."
    completeWhen: { autoPlayCompleted: { minHands: 90 } }
  - id: read
    text: "Read the **survival curve**: the share of sessions still going after each hand. The **bust rate** in the summary should be roughly a third (about 37%), and the p10–p90 band shows how wide a normal evening is."
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: What's the standard deviation of one hand of UTH, in antes?
  options: ["About 0.5", "About 2", "About 5", "About 27"]
  answer: 2
  explain: "About 4.94 antes per hand; about 27 per 30-hand hour."
- q: You play an hour at $10 with the basic card. Which result is most typical?
  options: ["Exactly −$6.55", "Somewhere between about −$300 and +$280", "Always a small loss", "Always a small win"]
  answer: 1
  explain: "The expected loss is $6.55, but 80% of hours land between about −30 and +28 antes."
- q: Which bankroll gives about a 1-in-100 chance of busting within an hour at a $10 Ante?
  options: ["$200", "$400", "$600", "$100"]
  answer: 2
  explain: "60 antes: about 1.1% within an hour (simulated)."
```
