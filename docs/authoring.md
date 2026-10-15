# Authoring lessons

Lessons are Markdown files in `content/lessons/`, compiled at build time by `src/content/compile.ts`
(`marked` and `yaml` never ship to the phone). Run `npm run dev` to preview with hot reload, and
`npm test` (`tests/content/`) before pushing. **Any invalid scene, quiz, chart, card code, glossary
link or container fails the build**, with the file name in the message.

## Files

| Path | Holds |
| --- | --- |
| `content/lessons/NN-slug.md` | One lesson. `NN-` orders the file; the slug must equal the front-matter `id`. |
| `content/chapters.json` | `[{ id, title, summary, lessons: [lessonId] }]`. Every lesson is in exactly one chapter. |
| `content/glossary.json` | `[{ term, slug?, definition (md), see?: [slug], seeAlso?: lessonId }]` |
| `content/bets.json` | `{ ante, blind, play, trips: { summary, howItWorks (md), tip?, name?, lessonId? } }` |
| `content/hands.json` | `{ [handCategory]: { name, example: "As Ks Qs Js Ts", summary } }` (all ten categories) |
| `content/strategy.json` | `{ [strategyId]: { title, summary, rules: [md] } }` (every id in the strategy registry) |
| `content/_sample-*` | Placeholders for a missing file. Leave them alone. |

Never put payouts, edges, counts or chart cells in these files. They come from the engine and math.

## A lesson

````markdown
---
id: flop-raise
title: The flop: bet 2x or check
chapter: perfect-lowest-edge
summary: When the flop helps you, and when it helps the dealer.
minutes: 7
---

You hold {{As 7d}} and the flop is {{Ah 9c 2s}}. See [[House edge]].
````

Headings: use any depth; the shallowest is shifted to `h2` (the page title is the `h1`).

## Constructs

| Construct | Syntax | Notes |
| --- | --- | --- |
| Show the math | `:::math Title` ... `:::` | Collapsed by default. Title required. The lesson must read fine closed. |
| Tip | `:::tip` ... `:::` | Callout. |
| Inline cards | `{{As Kd}}` | Rank `23456789TJQKA`, suit `shdc`. Parsed with the engine's `parseCards`: bad or duplicate cards fail. Works in prose, tips, math boxes, quiz text, options and explanations, scene step text. Not inside code spans. |
| Glossary link | `[[term]]` or `[[term\|label]]` | The term (or slug) must exist in `glossary.json`. |
| Chart | ` ```chart ` YAML `{ strategy, view, highlight? }` | `strategy` is a registry id, `view` is `preflop-grid`, `flop` or `river`, `highlight` is a list of **quoted** classes: `["33", "AKs", "T9o"]`. |
| Scene | ` ```scene ` YAML | A `SceneConfig` (`docs/design/simulator.md` §4.1, with the D25-D27a mappings). Checked by `validateScene`. Scene ids are unique within a lesson. |
| Quiz | ` ```quiz ` YAML list | See below. |

Unknown directives (` ```math `, ` ```callout `, an unknown `:::name`) and unclosed fences or containers are errors.

### Quizzes

```quiz
- id: optional-custom-id
  q: What do you have here?
  hand: { hole: Ah 5c, board: Ad 9s 2c }
  options: ["A pair of aces", "Two pair", "Nothing"]
  answer: 0
  explain: "Your {{Ah}} matches the {{Ad}}."
```

- At least two distinct options; `answer` is a 0-based integer index; `explain` is required.
- The default id is `<lessonId>-q<n>` (1-based per lesson). Ids must be unique.
- `hand` draws the cards above the question: `hole` is exactly two cards, `board` (optional) is three to five;
  no card may repeat.
- Quote option strings that contain `:` or start with `{{`.

### Scenes

Money is in cents. Put a forced deal on the step that deals it. Every reachable street needs at least
one allowed option (no dead ends). The text of each step may contain `{{cards}}`.

## Progress

All lessons are open. Completion, quiz results (first tries count toward the exam badge) and scene
progress are stored in `localStorage` under `holdumb:v1` and can be exported from Settings.
