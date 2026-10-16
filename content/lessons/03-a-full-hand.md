---
id: a-full-hand
title: "One hand, start to finish"
chapter: foundations
summary: "Three decision points, and what happens after each one."
minutes: 7
---

A hand of UTH is a short ladder with three steps. You can climb off at any step by making your Play bet.

**Step 1: preflop.** You see your two cards. Choose:
* **Bet 4×** (or 3×) the Ante in the Play circle, or
* **Check**: bet nothing for now and see the flop.

**Step 2: the flop.** If you checked, three community cards are dealt. Choose:
* **Bet 2×** the Ante, or
* **Check** again.

**Step 3: the river.** If you checked twice, the turn and river come out together. Now you must choose:
* **Bet 1×** the Ante, or
* **Fold**: give up your Ante and Blind and stop.

The moment you make a Play bet, at any step, **you're done deciding**. The dealer deals any remaining
community cards, turns over their two cards and settles everything.

Notice what you **can't** do. You can't fold before the river, and you can't raise twice. You also can't take a bet
back. Checking early is free, so the only ways to lose more than your Ante and Blind are by choosing to make
a Play bet.

There's one more thing to know about folding: it costs exactly **2 Antes** (your Ante and Blind), no
matter what the dealer has. If you bet 1x instead, you can win or lose up to 3 Antes. Lesson 11 shows when
that's worth it.

```scene
id: l03-s1
version: 1
title: Bet before the flop
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Qs, Qd], dealer: [Ac, 7h], flop: [7c, 3d, Qh], turn: 9s, river: 2c }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: bet
    text: "Pocket queens. **Bet 4x**: $40 goes into Play."
    allowedActions: [play]
    allowedOptions: [play-4]
    expect: [ { type: play, option: play-4 } ]
    completeWhen: { street: settled }
  - id: result
    text: "You made three queens; the dealer has a pair of sevens. Ante +$10, Play +$40, Blind pushes (trips is below a straight): **+$50**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l03-s2
version: 1
title: Check, check, bet 1x
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Jh, 8c], dealer: [6c, 4d], flop: [Kd, 5s, 2c], turn: Jd, river: 6h }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: preflop
    text: "Jack-eight isn't strong enough to bet 4x, so tap **Check**."
    allowedActions: [check]
    allowedOptions: [check]
    completeWhen: { street: flop }
  - id: flop
    text: "The flop missed you. **Check** again."
    allowedActions: [check]
    allowedOptions: [check]
    completeWhen: { street: river }
  - id: river
    text: "The board gave you a pair of jacks. **Bet 1x**."
    allowedActions: [play]
    allowedOptions: [play-1]
    expect: [ { type: play, option: play-1 } ]
    completeWhen: { street: settled }
  - id: result
    text: "Your jacks beat the dealer's sixes: Ante +$10, Play +$10, Blind pushes. **+$20**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l03-s3
version: 1
title: Knowing when to fold
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [8s, 3d], dealer: [Td, 6s], flop: [Kh, Qc, 6d], turn: Jc, river: 2s }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: checks
    text: "Tap **Check** before the flop and again on the flop."
    allowedActions: [check]
    allowedOptions: [check]
    completeWhen: { street: river }
  - id: fold
    text: "Eight high on a board of K-Q-J-6-2: almost any dealer hand beats you. Tap **Fold**."
    allowedActions: [fold]
    allowedOptions: [fold]
    expect: [ { type: fold } ]
    completeWhen: { street: settled }
  - id: result
    text: "The dealer had a pair of sixes. Folding cost $20 (Ante + Blind); betting 1x would have cost $30."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: You checked before the flop. What can you bet after the flop?
  options: ["4×", "3×", "2×", "1×"]
  answer: 2
  explain: "The flop raise is 2× the Ante."
- q: You bet 4× before the flop. What do you decide on the river?
  options: ["Whether to fold", "Whether to add 1×", "Nothing, your decisions are over", "Whether to take the bet back"]
  answer: 2
  explain: "One Play bet per hand. After it, the dealer just finishes the hand."
- q: When can you fold?
  options: ["Any time", "Only before the flop", "Only on the river, after checking twice", "Never"]
  answer: 2
  explain: "The only fold is at the last decision, instead of betting 1×."
- q: Your Ante is $10. How much does folding cost?
  options: ["$10", "$20", "$30", "Nothing"]
  answer: 1
  explain: "You lose the Ante and the Blind, $10 each."
```
