---
id: sample-quiz
title: Quiz with a hand (sample)
chapter: sample-chapter
summary: Placeholder lesson with a drawn hand and two quizzes.
minutes: 2
---

Quizzes can draw the hand above the question.

```quiz
- id: sample-quiz-pair
  q: What do you have on this flop?
  hand: { hole: Ah 5c, board: Ad 9s 2c }
  options: ["A pair of aces", "Two pair", "Nothing"]
  answer: 0
  explain: "Your {{Ah}} matches the {{Ad}} on the board."
- q: Which is stronger?
  options: ["{{9s 9d}}", "{{As 2d}}"]
  answer: 0
  explain: "A pair beats ace high."
```
