---
id: final-exam
title: "Final exam"
chapter: real-casino
summary: "Twelve questions from rules to bankroll."
minutes: 10
---

One last round. The scene deals five random hands. Play each with the basic card, then check the EV sheet.

```scene
id: l23-s1
version: 1
title: Five hands for the road
bankroll: 100000
bets: { ante: 1000, trips: 500 }
seed: 2301
showEV: true
practice: true
ui: { showSession: true }
steps:
  - id: play
    text: "Play five hands with the basic card. The EV sheet appears only after you confirm each decision."
    completeWhen: { hands: 5 }
  - id: session
    text: "Open the **session** panel: your decision cost vs perfect, your Trips results and your luck."
    completeWhen: { tapped: session }
```

```quiz
- q: You win with a pair of kings and the dealer doesn't qualify. What does the Ante do?
  options: ["Wins", "Loses", "Pushes", "Pays 3 to 2"]
  answer: 2
  explain: "The Ante pushes when the dealer doesn't have a pair or better."
- q: The Blind pays 3 to 2 when you win with…
  options: ["A straight", "A flush", "A full house", "Any hand"]
  answer: 1
  explain: "Straight 1:1, flush 3:2, full house 3:1."
- q: Preflop. Best play?
  hand: { hole: Kh 3h }
  options: ["Bet 4x", "Check"]
  answer: 0
  explain: "Any suited king is a 4x hand."
- q: Preflop. Best play?
  hand: { hole: Jd 9c }
  options: ["Bet 4x", "Check"]
  answer: 1
  explain: "Offsuit jacks need a ten: JTo."
- q: Flop. Best play?
  hand: { hole: Kd 2c, board: Kh 8s 4d }
  options: ["Bet 2x", "Check"]
  answer: 0
  explain: "Hidden pair of kings."
- q: Flop. Best play?
  hand: { hole: 9c 8d, board: Ts 7h 2c }
  options: ["Bet 2x", "Check"]
  answer: 1
  explain: "Straight draws are checks."
- q: River. Best play?
  hand: { hole: Jc 9d, board: 8s 8h 5c 3d 2s }
  options: ["Bet 1x", "Fold"]
  answer: 1
  explain: "23 dealer outs: fold."
- q: River. Best play?
  hand: { hole: Jd 8c, board: Kh Qs 4d 3c 2h }
  options: ["Bet 1x", "Fold"]
  answer: 0
  explain: "19 dealer outs: bet 1x."
- q: What's the element of risk of UTH under perfect play?
  options: ["0.53%", "1.09%", "2.19%", "4.15%"]
  answer: 0
  explain: "Expected loss divided by the average money in action (4.15 antes)."
- q: What's the biggest leak?
  options: ["Using the basic card", "Checking every hand to the river", "Skipping Trips", "Betting 4x with K5o"]
  answer: 1
  explain: "It raises the edge from 2.19% to 32%."
- q: Trips at an 8-6-5 table has a house edge of about…
  options: ["0.9%", "1.9%", "3.5%", "6.5%"]
  answer: 1
  explain: "48987/2572780 ≈ 1.904%."
- q: About how big are the swings in one hour (30 hands)?
  options: ["About 1 ante", "About 5 antes", "About 27 antes (one standard deviation)", "About 100 antes"]
  answer: 2
  explain: "4.94 antes per hand × √30 ≈ 27 antes."
```
