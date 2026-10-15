---
id: settling-bets
title: "Who gets paid: qualifying, the Blind and ties"
chapter: foundations
summary: "Ante, Blind and Play each have their own rule."
minutes: 8
---

At showdown, your best five cards are compared with the dealer's. Three bets get settled, each with its own rule.

**The Play bet** is the simple one. Win and it pays 1 to 1. Lose and it loses. Tie and it pushes.

**The Ante** has one extra condition: **the dealer must qualify**, which means the dealer needs **a pair or
better**. If the dealer doesn't qualify, your Ante comes back to you (a push), whether you won or lost the
hand. If the dealer does qualify, the Ante wins or loses just like Play.

**The Blind** is generous on big hands and stingy on small ones. If you win the hand, the Blind pays by this table:

| Your hand | Blind pays |
|---|---|
| Royal flush | 500 to 1 |
| Straight flush | 50 to 1 |
| Four of a kind | 10 to 1 |
| Full house | 3 to 1 |
| Flush | 3 to 2 |
| Straight | 1 to 1 |
| Anything less | push |

If you **lose** the hand, the Blind loses, whatever you held. If you **tie**, everything pushes.

**If you fold**, you lose the Ante and the Blind. Any Trips bet is still paid on your cards.

Put together, with a $10 Ante:

| What happened | Ante | Blind | Play (4x) | Net |
|---|---|---|---|---|
| You win with a pair, dealer qualifies | +$10 | push | +$40 | **+$50** |
| You win with a pair, dealer doesn't qualify | push | push | +$40 | **+$40** |
| You win with a flush, dealer qualifies | +$10 | +$15 | +$40 | **+$65** |
| Dealer wins with a pair | −$10 | −$10 | −$40 | **−$60** |
| Dealer wins with ace high (doesn't qualify) | push | −$10 | −$40 | **−$50** |
| Tie | push | push | push | **$0** |

The dealer fails to qualify about 1 time in 6 (17.4% of the time). When they don't qualify, you lose the
Ante's win, but you also can't lose the Ante.

:::math How often each thing happens
Over every possible deal where both hands go to showdown (2,598,960 boards × 1,081 player hands × 990
dealer hands):

* You win **47.97%**, you lose **47.97%** and you tie **4.07%**. The game is symmetric until you make
  decisions.
* The dealer qualifies **82.59%** of the time (789215/955604).
* You win **and** the dealer doesn't qualify 14.24% of the time. Those are the Ante pushes you'd rather
  have been paid.
:::

```scene
id: l04-s1
version: 1
title: The dealer doesn't qualify
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Ks, Jd], dealer: [Qc, 8h], flop: [Ah, 9d, 5c], turn: 3s, river: 2h }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: bet
    text: "**Bet 4x** with king-jack."
    allowedActions: [play]
    allowedOptions: [play-4]
    expect: [ { type: play, option: play-4 } ]
    completeWhen: { street: settled }
  - id: result
    text: "Neither of you has a pair, and your king beats the dealer's queen. But the dealer didn't qualify, so the **Ante pushes**. Play pays $40, the Blind pushes: **+$40**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l04-s2
version: 1
title: A Blind bonus
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Ah, Qh], dealer: [8s, 8c], flop: [Kh, 7h, 2c], turn: Jh, river: 5d }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: bet
    text: "**Bet 4x**."
    allowedActions: [play]
    allowedOptions: [play-4]
    expect: [ { type: play, option: play-4 } ]
    completeWhen: { street: settled }
  - id: result
    text: "An ace-high heart flush! You beat the dealer's eights. Ante +$10, Play +$40, and the **Blind pays 3 to 2: +$15**. Total **+$65**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l04-s3
version: 1
title: The board plays, it's a tie
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Ad, 4c], dealer: [As, 3d], flop: [Kc, Kd, Qh], turn: Qs, river: Jh }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: bet
    text: "**Bet 4x** with your ace."
    allowedActions: [play]
    allowedOptions: [play-4]
    expect: [ { type: play, option: play-4 } ]
    completeWhen: { street: settled }
  - id: result
    text: "You both have K-K-Q-Q with an ace kicker. The 4 and the 3 don't play. **Tie**: every bet pushes."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l04-s4
version: 1
title: Losing to a dealer who didn't qualify
bankroll: 50000
bets: { ante: 1000 }
showEV: false
steps:
  - id: deal
    text: "Tap **Deal**."
    deals:
      - { player: [Qc, 9d], dealer: [Ac, 3h], flop: [Ks, 8h, 6d], turn: 4c, river: 2s }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: bet
    text: "**Bet 4x** with queen-nine."
    allowedActions: [play]
    allowedOptions: [play-4]
    expect: [ { type: play, option: play-4 } ]
    completeWhen: { street: settled }
  - id: result
    text: "The dealer's ace high beats your queen high. The dealer didn't qualify, so only the **Ante** is saved. Play −$40, Blind −$10: **−$50**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```scene
id: l04-s5
version: 1
title: Fold, and Trips still pays
bankroll: 50000
bets: { ante: 1000, trips: 500 }
showEV: false
steps:
  - id: deal
    text: "This time you have a $5 Trips bet too. Tap **Deal**."
    deals:
      - { player: [7s, 2d], dealer: [Kc, Qd], flop: [9c, 9d, 9h], turn: Kh, river: 4s }
    allowedActions: [deal]
    completeWhen: { action: { type: deal } }
  - id: checks
    text: "Tap **Check** twice."
    allowedActions: [check]
    allowedOptions: [check]
    completeWhen: { street: river }
  - id: fold
    text: "Three nines are on the board, so the dealer has them too, and the king pairs any king the dealer holds. Tap **Fold**."
    allowedActions: [fold]
    allowedOptions: [fold]
    expect: [ { type: fold } ]
    completeWhen: { street: settled }
  - id: result
    text: "The dealer had a full house. Your Ante and Blind lose (−$20), but **Trips pays 3 to 1 on your three nines (+$15)**. Net **−$5**."
    allowedActions: []
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: The dealer has ace high and you have a pair of sixes. You bet 4×. What happens to your Ante?
  options: ["It wins", "It loses", "It pushes", "It pays 3 to 2"]
  answer: 2
  explain: "The dealer didn't qualify (no pair), so the Ante pushes. Play still wins."
- q: You win with a straight. What does the Blind pay?
  options: ["Push", "1 to 1", "3 to 2", "3 to 1"]
  answer: 1
  explain: "Straight 1 to 1, flush 3 to 2, full house 3 to 1, and up from there."
- q: You lose to the dealer's pair while holding a flush draw that missed. What happens to the Blind?
  options: ["Push", "It loses", "It pays 1 to 1", "It's returned because you lost"]
  answer: 1
  explain: "When the dealer beats you, the Blind loses."
- q: $10 Ante, you bet 2× on the flop and win with two pair. The dealer has a pair. What do you net?
  options: ["+$20", "+$30", "+$40", "+$50"]
  answer: 1
  explain: "Ante +$10, Play +$20, Blind pushes (two pair is below a straight)."
```
