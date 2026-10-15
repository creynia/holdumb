---
id: hand-rankings
title: "Poker hands in five minutes"
chapter: foundations
summary: "The ten hands, best five of seven, and kickers."
minutes: 6
---

If you've played poker before, skim this and take the quiz. If not, this is all you need.

Every hand is exactly **five cards**. From strongest to weakest:

| Hand | Example | How often in 7 cards |
|---|---|---|
| Royal flush | {{As Ks Qs Js Ts}} | 1 in 30,940 |
| Straight flush | {{9h 8h 7h 6h 5h}} | 1 in 3,591 |
| Four of a kind ("quads") | {{Qc Qd Qh Qs 4d}} | 1 in 595 |
| Full house | {{8s 8d 8c Kh Kd}} | 1 in 38.5 |
| Flush (five of one suit) | {{Ad Jd 9d 6d 2d}} | 1 in 33.1 |
| Straight (five in a row) | {{Tc 9d 8h 7s 6c}} | 1 in 21.6 |
| Three of a kind ("trips") | {{7d 7h 7s Kc 2d}} | 1 in 20.7 |
| Two pair | {{Jc Jd 4h 4s Ac}} | 1 in 4.3 |
| One pair | {{Ts Th Ad 8c 3h}} | 1 in 2.3 |
| High card | {{Ah Qd 9s 6c 3d}} | 1 in 5.7 |

Aces count high or low in a straight: {{5d 4c 3h 2s Ah}} (the "wheel") is the lowest straight, and
{{Ah Kd Qc Js Td}} the highest. A straight can't wrap around: {{3c 2d Ah Ks Qh}} is just ace high.

**Best five of seven.** You have two cards and the board has five. Your hand is the **best five** of those
seven, using both, one or none of your own cards. The dealer does the same.

**Ties and kickers.** If both hands are the same kind, compare the cards that make them, highest first:
a pair of kings beats a pair of queens. If those are equal too, compare the leftover cards, the
**kickers**, one at a time. {{Ks Kd Ac 9h 4d}} beats {{Kh Kc Qd Jc 9s}}, because ace beats queen. Suits never
break ties. If all five cards match in rank, it's a tie.

**When the board plays.** Sometimes the best five cards are all on the board, for both of you. Then neither
hole card counts, and you tie.

:::tip
In UTH, the cards that come from **your hand** are what matter. A pair that sits on the board belongs to the
dealer just as much as to you. Later lessons call a pair that uses one of your cards a **hidden pair**.
:::

:::math Where the "how often" column comes from
There are C(52, 7) = 133,784,560 ways to get seven cards. The app's evaluator counts each hand type
exhaustively: 4,324 royal flushes, 37,260 other straight flushes, 224,848 quads, 3,473,184 full houses,
4,047,644 flushes, 6,180,020 straights, 6,461,620 trips, 31,433,400 two pair, 58,627,800 one pair and
23,294,460 high-card hands. "1 in 30,940" is 133,784,560 ÷ 4,324.

You're more likely to make one pair (43.8%) than nothing at all (17.4%), because seven cards give you
21 different five-card choices.
:::

```scene
id: l02-s1
version: 1
title: Best five of seven
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [9s, 8d], dealer: [Kc, Ks], flop: [Th, 7c, 2s], turn: Jd, river: Kh }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: see-board
    text: "Tap **Check** twice to see all five board cards."
    allowedActions: [check]
    allowedOptions: [check]
    completeWhen: { street: river }
  - id: bet
    text: "Find your hand: 7-8-9-10-J is a **straight**, using both your cards. Tap **Bet 1x**."
    allowedActions: [play]
    allowedOptions: [play-1]
    expect: [ { type: play, option: play-1 } ]
    completeWhen: { street: settled }
  - id: result
    text: "The dealer made three kings. A straight beats trips. And because you won with a straight, the **Blind pays 1 to 1** as well."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Which hand is stronger?
  options: ["A flush", "A straight", "They're equal", "It depends on the suits"]
  answer: 0
  explain: "A flush beats a straight. Suits never matter for ranking."
- q: You hold these cards. What is your best five-card hand?
  hand: { hole: Ah 5c, board: Kd Kh 9s 5d 2c }
  options: ["One pair, kings", "Two pair, kings and fives", "Two pair, kings and fives, ace kicker", "A straight"]
  answer: 2
  explain: "K-K and 5-5 with the ace as the fifth card."
- q: Both you and the dealer have a pair of jacks, and the best kickers are the same down to the fifth card. Who wins?
  options: ["You, if your suits are higher", "The dealer", "Nobody, it's a tie", "Whoever has the higher hole card"]
  answer: 2
  explain: "All five cards match in rank, so it's a tie. Suits never break ties."
- q: Is {{3c 2d Ah Ks Qh}} a straight?
  options: ["Yes", "No"]
  answer: 1
  explain: "Straights can't wrap around the ace. This is just ace high."
```
