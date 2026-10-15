---
id: counting-dealer-outs
title: "Counting the dealer's outs"
chapter: perfect-lowest-edge
summary: "Fewer than 21 cards that beat you: bet 1x."
minutes: 9
---

Without a hidden pair, you need a quick way to tell "queen high, play it" from "eight high, fold it".
The trick is to imagine **one** card in the dealer's hand and ask: **which cards would beat me?** Those
are the dealer's **outs**. You can see 7 cards, which leaves 45 unseen.

How to count, step by step:

1. **Pairs with the board.** Every board card you don't pair gives the dealer 3 outs (the three other
   cards of that rank). Five unpaired board ranks = **15 outs**.
2. **Higher kickers.** Every rank that beats your best card, and isn't on the board, adds 4 outs. A
   card you hold counts as seen.
3. **Straights and flushes.** Add any single card that would complete one for the dealer.

Then: **fewer than 21 outs → bet 1x. 21 or more → fold.**

Example 1. {{Qc 7d}} on {{Kd Jh 9s 5c 2d}}. Board pairs: K, J, 9, 5, 2 = 15. Higher than your queen and
not on the board: only the ace = 4. No straight or flush is one card away. **19 outs → bet 1x.**

Example 2. {{8c 6d}} on {{Kh Qs 4d 3c 2h}}. Board pairs = 15. Cards that beat your K-Q-8 kicker: aces,
jacks, tens and nines = 16. **31 outs → fold.**

Example 3. {{Jd 8c}} on the same board {{Kh Qs 4d 3c 2h}}. Board pairs = 15, and only aces beat your
K-Q-J = 4. **19 outs → bet 1x.** One card made the difference.

Example 4. {{Jc 9d}} on {{8s 8h 5c 3d 2s}}. The board is paired, so you're playing 8-8 with J-9-5. The
dealer beats you with an ace, king or queen kicker (12), a 5, 3 or 2 for two pair (9), or the last two
eights (2). **23 outs → fold.**

**How good is the rule?** Very good. In a random sample of 3,000 river spots, it disagreed with perfect
play on about 1 in 90 (≈ sampled). Nearly all of those are at 19 or 20 outs, where perfect play folds by a few
hundredths of an Ante. One example is {{2c 4h}} on {{Qc Qh Kh Qs 9d}}: 19 outs, but folding is better
(1x is −2.124). Following the rule instead of perfect river play costs **0.11% of the Ante**, about 33¢
an hour at $10.

:::tip
On a board with four of one suit, a hidden pair isn't always enough: {{6d 5s}} on {{Kh 6h 8h 7c Qh}} is a
fold (1x is −2.034), because any heart beats you. The EV sheet will show it. It's rare enough that the
practical rule ignores it.
:::

```scene
id: l12-s1
version: 1
title: Count, then decide
bankroll: 100000
bets: { ante: 1000 }
seed: 1201
showEV: true
steps:
  - id: h1
    text: "Hand 1: count the dealer's outs before you look at the EV sheet: board pairs, higher cards, straights and flushes."
    hint: "15 board-pair outs plus 4 aces: 19."
    startAt: { street: river, deal: { player: [Jd, 8c], flop: [Kh, Qs, 4d], turn: 3c, river: 2h } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
  - id: h2
    text: "That was 19 outs. Hand 2: a paired board."
    hint: "A, K, Q kickers (12) + 5s, 3s, 2s (9) + two eights: 23."
    startAt: { street: river, deal: { player: [Jc, 9d], flop: [8s, 8h, 5c], turn: 3d, river: 2s } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
  - id: h3
    text: "23 outs. Hand 3: two pair on the board, and your best card is a six."
    hint: "Every card from 7 up beats your kicker."
    startAt: { street: river, deal: { player: [6s, 5d], flop: [Kh, Kd, 9c], turn: 9s, river: 3h } }
    allowedActions: [play, fold]
    allowedOptions: [play-1, fold]
    expect: [ { type: play, best: true }, { type: fold, best: true } ]
    completeWhen: { bestDecisions: { count: 1, street: river } }
  - id: wrap
    text: "28 outs (aces, queens, jacks, tens, eights and sevens beat your kicker, plus kings and nines for a full house): fold."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: No hidden pair. The dealer has 19 outs. What's the play?
  options: ["Bet 1x", "Fold"]
  answer: 0
  explain: "Fewer than 21 outs: bet 1x."
- q: How many outs does the dealer have here?
  hand: { hole: 8c 6d, board: Kh Qs 4d 3c 2h }
  options: ["15", "19", "27", "31"]
  answer: 3
  explain: "15 board pairs, plus 16 for aces, jacks, tens and nines, which beat your K-Q-8. Fold."
- q: Each unpaired board card gives the dealer how many outs?
  options: ["1", "2", "3", "4"]
  answer: 2
  explain: "The three other cards of that rank."
```
