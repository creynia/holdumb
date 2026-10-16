---
id: flop-tricky-boards
title: "Tricky flops: paired boards, draws, small pairs"
chapter: perfect-lowest-edge
summary: "Where the flop rules need care, and where they're slightly wrong."
minutes: 7
---

The flop rules from lesson 9 are short on purpose. Here are the cases that trip people up.

**Pocket deuces.** You checked them preflop, and they stay a check on a flop like {{Kd 9c 5h}}: **−0.861**
for checking against **−0.964** for 2x. Any dealer pair beats them.

**"Two pair" made from the board's pair.** {{2c 2d}} on {{9s 9h 5c}} is technically two pair, nines and
deuces. But the nines belong to everyone, and your deuces are the lowest pair there is. Perfect play
**checks** (−0.131 vs −0.284 for 2x). The basic rule says "two pair, bet 2x" here, which is one of its
rare mistakes.

**Straight draws.** An open-ended draw like {{9c 8d}} on {{Ts 7h 2c}} is a **check** (−0.140 vs −0.235).
A straight comes only about 1 time in 3 by the river, and you can wait and bet 1x when it does. With a
higher draw like {{Tc 8d}} on {{Js 9c 4h}}, the two options are dead even (−0.1526 vs −0.1532). Either is fine.

**Flush draw plus straight draw.** {{7h 6h}} on {{8h 5c 2h}} has a flush draw (no high heart in hand) and an
open-ended straight draw. Perfect play bets **2x** (+1.123 vs +1.044), but the basic rule checks because
your best heart is only a seven. It's a small slip.

**Overcards.** {{Kc 3d}} on {{8s 5h 2c}}: king high with no pair. **Check** (−1.108 vs −1.373), and decide on
the river.

**Trips on a paired board.** {{Jd 5c}} on {{5h 5s Kc}} is three fives, using your card. Bet **2x** (+3.845 vs +2.956).

Put together, all of these slips cost very little. Using the three flop rules instead of perfect flop play
costs **0.086% of the Ante**: about 26¢ an hour at $10. In this chapter the EV sheet always shows you the
exact answer.

```scene
id: l10-s1
version: 1
title: Tricky flops
bankroll: 100000
bets: { ante: 1000 }
seed: 1001
showEV: true
steps:
  - id: h1
    text: "Hand 1: deuces on a board with a pair of nines."
    hint: "Your deuces are the lowest pair there is: check."
    startAt: { street: flop, deal: { player: [2c, 2d], flop: [9s, 9h, 5c] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h1-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h2
    text: "Hand 2: an open-ended straight draw."
    hint: "Straight draws are checks."
    startAt: { street: flop, deal: { player: [9c, 8d], flop: [Ts, 7h, 2c] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h2-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h3
    text: "Hand 3: a flush draw and a straight draw together."
    hint: "Both draws together are worth 2x here, though the basic card says check."
    startAt: { street: flop, deal: { player: [7h, 6h], flop: [8h, 5c, 2h] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h3-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
  - id: h4
    text: "Hand 4: three fives, one of them yours."
    hint: "Trips using your card: bet 2x."
    startAt: { street: flop, deal: { player: [Jd, 5c], flop: [5h, 5s, Kc] } }
    allowedActions: [check, play]
    allowedOptions: [play-2, check]
    expect: [ { type: play, best: true }, { type: check, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: flop } }
  - id: h4-finish
    text: "Play out the hand with the EV sheet."
    allowedActions: [check, play, fold]
    completeWhen: { street: settled }
```

```quiz
- q: What's the best flop play?
  hand: { hole: 2c 2d, board: Kd 9c 5h }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Pocket deuces are the one pair you check on the flop."
- q: What's the best flop play?
  hand: { hole: 9c 8d, board: Ts 7h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Straight draws are checks. You can bet 1x on the river if the straight comes."
- q: How much does following the three flop rules (instead of perfect flop play) cost?
  options: ["About 0.09% of the Ante", "About 1% of the Ante", "About 5% of the Ante", "Nothing"]
  answer: 0
  explain: "0.086% of the Ante, with a perfect river. About 26¢ an hour at $10."
```
