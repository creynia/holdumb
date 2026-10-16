# content/

Lesson sources for holdumb. Everything is plain text and checked at build time and by `tests/content/`.
The full guide is `docs/authoring.md`.

- `lessons/NN-slug.md`: one lesson. Frontmatter `id` (equals the slug), `title`, `chapter`, `summary`, `minutes`.
- `chapters.json`: ordered chapters `{ id, title, summary, lessons: [lessonId] }`.
- `glossary.json`: `[{ term, slug?, definition, see?, seeAlso?: lessonId }]`.
- `bets.json`: keyed by wager id (`ante`, `blind`, `play`, `trips`). `hands.json`: keyed by hand category.
  `strategy.json`: keyed by strategy id. No numbers in these files: they come from the engine and math.
- `_sample-*`: placeholders used only for a file that is missing (and `_sample-*.md` lessons only while
  `chapters.json` is missing). Do not edit them to write real content.

Body extras: `:::math Title` ... `:::`, `:::tip` ... `:::`, inline cards `{{As Kd}}` (also in quiz text,
options and explanations), a ` ```chart ` block, a ` ```scene ` block (simulator `SceneConfig`, money in
cents) and a ` ```quiz ` block with an optional `hand:`. **An invalid scene, quiz, chart or card fails the build.**
