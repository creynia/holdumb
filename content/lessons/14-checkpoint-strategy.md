---
id: checkpoint-strategy
title: "Checkpoint: perfect strategy"
chapter: perfect-lowest-edge
summary: "Ten quick decisions across all three streets."
minutes: 6
---

Time to put it together. Each question is one decision. Answer from the rules, then play out the scene
to see the EV sheet agree.

```scene
id: l14-s1
version: 1
title: One of each
bankroll: 100000
bets: { ante: 1000 }
seed: 1401
showEV: true
steps:
  - id: h1
    text: "Hand 1: preflop. Choose."
    hint: "Offsuit kings: K5 and up."
    startAt: { street: preflop, deal: { player: [Ks, 6d] } }
    allowedActions: [check, play]
    allowedOptions: [play-4, play-3, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: preflop } }
  - id: h1-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h2
    text: "Hand 2: you checked preflop. Make the flop decision."
    hint: "Your 3 pairs the board."
    startAt: { street: flop, deal: { player: [8h, 3c], flop: [Ah, Kd, 3s] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h2-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h3
    text: "Hand 3: you checked twice. Make the river decision."
    hint: "Count the outs: 19."
    startAt: { street: river, deal: { player: [Jd, 8c], flop: [Kh, Qs, 4d], turn: 3c, river: 2h } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
```

```quiz
- q: Preflop. Best play?
  hand: { hole: Qh 6h }
  options: ["Bet 4x", "Bet 3x", "Check"]
  answer: 0
  explain: "Q6s+ suited queens are 4x."
- q: Preflop. Best play?
  hand: { hole: Qd 7c }
  options: ["Bet 4x", "Bet 3x", "Check"]
  answer: 2
  explain: "Offsuit queens need Q8o+."
- q: Preflop. Best play?
  hand: { hole: 3c 3d }
  options: ["Bet 4x", "Check"]
  answer: 0
  explain: "Pairs from 33 up are 4x."
- q: Flop. Best play?
  hand: { hole: Jc 4d, board: Js 9h 8c }
  options: ["Bet 2x", "Check"]
  answer: 0
  explain: "Hidden pair of jacks."
- q: Flop. Best play?
  hand: { hole: 9h 4h, board: Jh 8h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Flush draw, but your best heart is below a ten."
- q: Flop. Best play?
  hand: { hole: Kc 3d, board: 8s 5h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "King high and no pair: check, and decide on the river."
- q: River. Best play?
  hand: { hole: Qc 7d, board: Kd Jh 9s 5c 2d }
  options: ["Bet 1x", "Fold"]
  answer: 0
  explain: "19 outs, fewer than 21."
- q: River. Best play?
  hand: { hole: 7d 5c, board: Jh 9s 8d 3c 2h }
  options: ["Bet 1x", "Fold"]
  answer: 1
  explain: "15 board-pair outs, plus 16 cards (A, K, Q, T) that beat your J-9-8-7: 31. Fold."
- q: Which is never the best play?
  options: ["Bet 4x", "Bet 3x", "Check preflop", "Fold on the river"]
  answer: 1
  explain: "3x is always beaten by 4x or by checking."
- q: Over many hands, what does perfect play cost at a $10 Ante, 30 hands an hour?
  options: ["About $0.66 an hour", "About $6.55 an hour", "About $16 an hour", "Nothing"]
  answer: 1
  explain: "30 × $10 × 2.185% ≈ $6.55."
```
