---
id: sample-cards
title: Cards and charts (sample)
chapter: sample-chapter
summary: Placeholder lesson showing every content feature.
minutes: 3
---

You hold {{As Kd}} before the flop. The [[Ante]] and Blind are both in.

:::tip
Tips render in a callout, with cards too: {{Qh Qc}}.
:::

:::math Counting the starting hands
There are 52 x 51 / 2 = 1,326 two-card hands, which fall into 169 classes.
:::

```chart
strategy: perfect
view: preflop-grid
highlight: ["AA", "AKs", "T9o"]
```

```scene
id: sample-scene
version: 1
title: Look at the table
steps:
  - id: look
    text: "Placeholder step with cards {{As Kd}}."
    completeWhen: { acknowledged: true }
    advance: button
```

```quiz
- q: Which hand class is {{As Kd}}?
  options: ["AKs", "AKo", "AA"]
  answer: 1
  explain: "Different suits, so it is offsuit: {{As Kd}} is AKo."
```
