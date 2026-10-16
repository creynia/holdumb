---
id: welcome
title: "Welcome to the table"
chapter: foundations
summary: "You against the dealer, four betting circles, one big decision."
minutes: 4
---

Ultimate Texas Hold'em borrows its cards from Texas Hold'em poker, but it's a casino table game.
There's no bluffing and no reading other players. **You play against the dealer**, and each player at the
table makes their own decisions about their own hand.

Here's what's in front of you:

* **Ante** and **Blind**: two circles that take **equal bets**. You must make both to play a hand. If your
  Ante is $10, your Blind is $10 too.
* **Trips**: an optional side bet on how good your own hand ends up. More on it in lesson 19.
* **Play**: empty when the hand starts. This is where your one raise goes.

You and the dealer each get **two cards** face down. Five **community cards** are shared by both of you:
first three (the **flop**), then two more (the **turn and river**). Each side makes its best five-card
poker hand out of its own two cards plus the five on the board.

The twist that makes UTH interesting is the Play bet. **You get exactly one chance to make it**, and its
size depends on how early you commit:

* **Before the flop**, you may bet **4×** your Ante (or 3×).
* **After the flop**, if you waited, you may bet **2×**.
* **After the river**, if you still waited, you must bet **1×** or **fold**.

Waiting costs you size, but it buys information. Most of this course is about when to commit and when to
wait, and the app will show you the exact value of each choice before you make it.

:::tip
You don't need to know any poker strategy to sit down. You do need to know which hand beats which. The next
lesson is a five-minute refresher, and **More → Hand rankings** is always one tap away.
:::

```scene
id: l01-s1
version: 1
title: Find the circles
bankroll: 50000
bets: { ante: 1000 }
allowedActions: []
showEV: false
steps:
  - id: ante
    text: "Tap the **Ante** circle."
    completeWhen: { tapped: ante }
  - id: blind
    text: "Now the **Blind**. It always matches the Ante."
    completeWhen: { tapped: blind }
  - id: trips
    text: "Tap **Trips**, the optional side bet."
    completeWhen: { tapped: trips }
  - id: play
    text: "And **Play**: it stays empty until you make your one bet."
    completeWhen: { tapped: play }
```

```scene
id: l01-s2
version: 1
title: Watch a hand
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Your $10 Ante and $10 Blind are already out. Tap **Deal**."
    deals:
      - { player: [Ah, Kd], dealer: [9c, 9h], flop: [Kh, 7s, 2d], turn: Jc, river: 4h }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: bet
    text: "Ace-king is a great start. Make the biggest Play bet: tap **Bet 4x** ($40)."
    allowedActions: [play]
    allowedOptions: [play-4]
    expect: [ { type: play, option: play-4 } ]
    completeWhen: { street: settled }
  - id: result
    text: "That was your only decision. The dealer now shows every card. Your pair of kings beats the dealer's nines: Ante and Play both pay, and the Blind pushes. You won **$50**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Who are you playing against in Ultimate Texas Hold'em?
  options: ["The other players", "The dealer", "Both", "Nobody, it's a slot game"]
  answer: 1
  explain: "Every player plays their own hand against the dealer's hand."
- q: Your Ante is $15. How much is your Blind?
  options: ["$0, the Blind is optional", "$7.50", "$15", "$30"]
  answer: 2
  explain: "Ante and Blind are always equal, and both are required."
- q: When can you make the biggest Play bet?
  options: ["Before the flop", "After the flop", "After the river", "Any time"]
  answer: 0
  explain: "Before the flop you may bet 4× the Ante. After the flop it's 2×, and after the river 1×."
```
