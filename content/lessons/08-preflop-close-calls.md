---
id: preflop-close-calls
title: "Preflop close calls"
chapter: perfect-lowest-edge
summary: "Where the chart's edges are, and how little they matter."
minutes: 6
---

Every chart has edges. Here are UTH's, with the exact EVs (in antes) of both choices:

| Hand | Bet 4x | Check | Best | Margin |
|---|---|---|---|---|
| {{Kc 5d}} K5o | −0.118 | −0.151 | **4x** | 0.034 |
| {{Kc 4d}} K4o | −0.229 | −0.206 | **Check** | 0.023 |
| {{Kh 2h}} K2s | −0.075 | −0.080 | **4x** | 0.005 |
| {{Qc 8d}} Q8o | −0.069 | −0.093 | **4x** | 0.023 |
| {{Qc 7d}} Q7o | −0.278 | −0.209 | **Check** | 0.068 |
| {{Qh 6h}} Q6s | −0.006 | −0.028 | **4x** | 0.022 |
| {{Qh 5h}} Q5s | −0.096 | −0.074 | **Check** | 0.021 |
| {{Js 8s}} J8s | +0.107 | +0.096 | **4x** | 0.011 |
| {{Js 7s}} J7s | −0.107 | −0.034 | **Check** | 0.072 |
| {{Jc Td}} JTo | +0.174 | +0.110 | **4x** | 0.064 |
| {{Jc 9d}} J9o | −0.070 | −0.039 | **Check** | 0.032 |
| {{3c 3d}} 33 | +0.088 | +0.007 | **4x** | 0.081 |
| {{2c 2d}} 22 | −0.288 | −0.179 | **Check** | 0.108 |
| {{Ts 9s}} T9s | +0.185 | +0.205 | **Check** | 0.020 |

Two things stand out.

**4x can be right when it loses money.** {{Kc 5d}} loses 0.118 antes on average if you bet 4x, but it loses
0.151 if you check. You paid your Ante and Blind already, so the question is never "is this hand a winner?"
It's "which option loses least, or wins most?"

**Close calls are cheap.** Get K4o wrong every single time it's dealt, and you give up about **6¢ an
hour** at a $10 Ante. Check pocket aces instead of betting 4x, and you give up **$1.91 an hour**, on a hand
you only see once every 221 deals. Learn the big hands first, and the edges second.

:::math How "per hour" is worked out for one hand
Cost per hour = hands per hour × P(this hand) × cost per time × Ante.
K4o: 30 × (12/1,326) × 0.0228 × $10 ≈ $0.06. Pocket aces checked: 30 × (6/1,326) × 1.408 × $10 ≈ $1.91.
Betting 4x with 7-2 offsuit every time: 30 × (12/1,326) × 1.235 × $10 ≈ $3.35.
:::

```scene
id: l08-s1
version: 1
title: Edge of the chart
bankroll: 100000
bets: { ante: 1000 }
seed: 801
showEV: true
steps:
  - id: h1
    text: "King-five offsuit."
    hint: "K5o is the lowest offsuit king to bet 4x."
    startAt: { street: preflop, deal: { player: [Kc, 5d] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h1-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h2
    text: "King-four offsuit."
    hint: "One below K5o: check (a close one)."
    startAt: { street: preflop, deal: { player: [Kd, 4c] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h2-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h3
    text: "Queen-eight offsuit."
    hint: "Q8o is the lowest offsuit queen to bet 4x."
    startAt: { street: preflop, deal: { player: [Qs, 8h] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h3-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h4
    text: "Queen-seven offsuit."
    hint: "One below Q8o: check."
    startAt: { street: preflop, deal: { player: [Qd, 7c] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h4-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h5
    text: "Pocket deuces."
    hint: "Deuces are the one pair you check."
    startAt: { street: preflop, deal: { player: [2c, 2h] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h5-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
```

```quiz
- q: Betting 4x with K5o has a negative EV (−0.118 antes). Why is it still the best play?
  options: ["It isn't, you should check", "Checking loses even more (−0.151)", "Because the Blind might pay", "Because kings are high cards"]
  answer: 1
  explain: "Your Ante and Blind are already in. Pick the option that loses least."
- q: Which is the best preflop play?
  hand: { hole: Js 8s }
  options: ["Bet 4x", "Bet 3x", "Check"]
  answer: 0
  explain: "Suited jacks need an 8 or better: J8s+. It's close (0.011 antes), but 4x."
- q: Which mistake costs more per hour at the same table?
  options: ["Betting 4x with K4o every time", "Checking pocket aces every time"]
  answer: 1
  explain: "About $1.91 an hour for the aces vs about 6¢ for K4o, at $10 and 30 hands an hour."
```
