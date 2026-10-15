# holdumb: App & Repo Architecture

Status: design spike, ready for reconciliation into `decisions.md`.
Companion docs: `docs/design/curriculum.md` (lessons, quizzes, scenes, the
reference tables) and `docs/design/simulator.md` (engine, EV math, SVG table,
`SceneConfig`, strategies).

**Ownership of this doc.** It owns the boundaries between modules, the app
shell, the content pipeline, the EV transport (the Web Worker plumbing, not the
math inside it), tooling, CI, delivery and the work-package plan. The simulator
doc owns everything *inside* `src/sim/**` (types, payloads, algorithms). Where
the two disagree on something inside `src/sim/**`, the simulator doc wins;
`decisions.md` beats both.

**The constraint behind most decisions:** the user has only an Android phone.
Nothing in the build, deploy or use path may need a computer, the app must work
fully offline, and the single offline HTML file has to stay small and fast on a
mid-range phone.

**Reference implementation:** crappy (`/home/user/crappy`,
https://creynia.github.io/crappy/). Unless a section says "changes", the crappy
file is copied and renamed (`crappy` → `holdumb`).

---

## 1. Stack

### 1.1 Carries over unchanged from crappy

Versions were verified on 2026-10-15 by `npm ci` of crappy's lockfile in
`/tmp/holdumb-scratch/architecture/wk`. WP0 copies crappy's `package.json`
dependency block **verbatim**, then runs `npm install` once so the lockfile is
regenerated for the new name.

| Concern               | Choice                                                         | Version                          |
| --------------------- | -------------------------------------------------------------- | -------------------------------- |
| Runtime               | Node 22 (`.nvmrc` = `22`, `engines.node >=22.12`)              | 22.22.0 in session               |
| Bundler               | Vite                                                           | `vite@^8.3.4` (8.3.4)            |
| UI                    | Preact + hooks. No router lib, no state lib, no CSS framework  | `preact@^10.29.8` (only runtime dep) |
| JSX plugin            | `@preact/preset-vite`                                          | `^2.10.6`                        |
| Single file           | `vite-plugin-singlefile`                                       | `^2.3.3`                         |
| Language              | TypeScript, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` | `typescript@~6.0.3` (not 7: typescript-eslint peer range) |
| Build-time content    | `marked` + `yaml` (dev only, never shipped)                    | `^18.1.1`, `^2.9.1`              |
| Unit tests            | Vitest, two projects: `node` and `dom` (`happy-dom`)           | `vitest@^5.0.4`, `happy-dom@^21` |
| Component tests       | `@testing-library/preact`                                      | `^3.2.4`                         |
| E2E                   | Playwright, Chromium only, **exact pin**                       | `@playwright/test@1.56.1` (matches `/opt/pw-browsers/chromium-1194`) |
| A11y                  | `@axe-core/playwright`                                         | `^4.13.0`                        |
| Lint                  | ESLint 10 flat config + `typescript-eslint` `recommendedTypeChecked` + `eslint-config-prettier` + `globals` | `eslint@^10`, `typescript-eslint@^8.71.2` |
| Format                | Prettier `{ "singleQuote": true, "printWidth": 100 }`          | `prettier@^3`                    |
| Node types            | `@types/node@^22` (tests and build scripts need them)          |                                  |

Also carried over as-is (renamed): the hash router, `Store` + `storage.ts`
with in-memory fallback and export/import, the hand-written service worker and
`build/vite-plugin-sw.ts`, `scripts/finalize-single.mjs`,
`scripts/gen-icons.mjs` (zero-dep PNG writer), `build/vite-plugin-content.ts`
+ `src/content/{compile,load,types}.ts`, the `_sample-*` placeholder fallback,
the three workflows, `.editorconfig`, `.prettierignore`, `.gitignore`, the
update toast, the TierBadge pattern, theme tokens with the dark/light guard.

### 1.2 What changes for holdumb

| Area | crappy | holdumb | Why |
| --- | --- | --- | --- |
| EV compute | Synchronous, main thread (dice math is tiny) | Async **EV client** (`src/sim/worker`) with two transports: Web Worker or in-thread cooperative runner. Same API either way. | Card EV may need about 10^6 evaluations per decision (simulator.md decides). The main thread must stay at 60 fps on a phone. §4. |
| Vite config | `preact()`, content plugin, SW or singlefile | Adds `worker: { format: single ? 'iife' : 'es' }` and the `#ev-worker` alias that picks the transport per build mode | Verified in scratch: an inline **module** worker from a blob fails under `file://`; a classic (IIFE) one works. §4.3. |
| Precomputed tables | none | Optional `src/sim/math/tables/*.ts` (generated, committed) + `npm run gen:tables` + a verify test | Only if simulator.md wants a preflop table. Zero new deps. §4.6. |
| Content format | `:::math`, `:::tip`, ` ```scene `, ` ```quiz ` | Same, **plus** inline cards `{{As Kd}}`, an optional `hand:` field on quizzes, and a ` ```chart ` block that embeds a strategy chart | UTH lessons talk about specific hands constantly. §3. |
| Reference data | `bets.json` keyed by bet id | `bets.json` keyed by **wager id** (ante, blind, play, trips, plus any simulated side bet) + `hands.json` (hand-ranking copy) | Numbers still come from the engine registry, never the JSON. |
| Screens and tabs | Learn · Play · Bets · More; Bets, Glossary | Tabs **Learn · Play · Drill · More** (user answer D4). New screens: **Drill** (quick-fire decision trainer, a tab), **Strategy** charts (no tab; reached from Learn, More, Drill and lessons), **Hands** (rankings with exact counts), Paytables (`#/bets`) | §2. |
| Settings | rollsPerHour, confirmSuckerBets | `handsPerHour`, `confirmCostlyMoves`, `fourColorDeck`, `paytable` preset, `anteUnit` | §2.4. |
| Build info | `__APP_VERSION__` | Adds `__BUILD_SHA__` (short `GITHUB_SHA`, `dev` locally), shown in Settings → About and in the single file's footer | Lets the user confirm on the phone that the new build arrived (crappy lesson: the SW kept serving old builds). |
| Update path | toast only | toast + **Settings → Check for updates** (`registration.update()`) | Same lesson. |
| Size check | finalize-single only checks external refs | finalize-single also enforces a **size budget** (§5.4) | The single file now carries a worker copy of the math. |
| E2E | mobile, phone-landscape, desktop | Same three + a CPU-throttled `perf.spec.ts` (4x slowdown) for the EV latency budget | Phone performance. |
| Theme colour | felt green `#0b3d2e` | navy felt `#0b2e4a` (table-ui may refine the felt tokens) | Tells the two installed apps apart on the home screen. |
| Suit glyphs | n/a | Cards drawn as SVG; inline text suits use `︎` (text presentation) | Android otherwise renders ♥ ♦ as emoji. |

Nothing else is added: no router lib, no state lib, no chart lib, no zod, no
tsx/ts-node, no Workbox, no Comlink.

---

## 2. Routes and screens

### 2.1 Routes (hash based, `src/app/routes.tsx`)

| Hash | Screen | Contents |
| --- | --- | --- |
| `#/` | Home | "Continue" (next unfinished lesson), progress ring, quick links (Learn, Play, Drill, Strategy charts), "Download offline copy" and "Install app" when applicable |
| `#/learn` | Lesson list | A **"Strategy charts" card at the top** (→ `#/strategy`), then chapters in order, including the three Perfect-strategy chapters (lowest edge / practical / fun per dollar). All open; status done / in progress / new |
| `#/learn/:lessonId` | Lesson | Prose, `:::math` boxes, `:::tip`, inline cards, embedded scenes, charts, quizzes, Prev / Next, "Mark complete" |
| `#/play` | Sandbox | Full simulator. Query: `?seed=`, `?hole=AsKd`, `?board=QhJh2c`, `?dealer=`, `?street=preflop\|flop\|river`, `?strategy=<id>`, `?speed=instant` (tests). Links from Strategy cells, Drill answers and lessons open a preset hand here |
| `#/strategy` | Strategy charts (no tab) | Reached from the Learn card, More, every Drill answer ("See the chart") and lesson links. Segmented control per lens (`?lens=perfect\|practical\|fun`): preflop 13x13 grid (raise 4x / 3x / check), flop rules, river rules, the cost of each simplification vs perfect. `?highlight=AKs` / `?street=flop` deep-link a cell or section. Data comes from `src/sim/strategy`, never typed by hand. Tap a cell to open `#/play?hole=…` or `#/drill?focus=…` |
| `#/drill` | Drill (tab) | Quick-fire decision trainer. Deals a spot (street, hole cards, board), you tap **Raise 4x / 3x / Check** (preflop), **Raise 2x / Check** (flop) or **Raise 1x / Fold** (river), then see right/wrong, the EV sheet for every option, the cost of a mistake in ante units and $/hour, the matching strategy-chart cell (`StrategyChart`, highlighted) with "See the chart", and "Play it out" (→ `#/play` preset). Auto-advances (skippable). Query: `?street=preflop\|flop\|river\|mixed`, `?lens=perfect\|practical` (grade against which strategy), `?focus=<cell list>` (drill only chart cells you missed or tapped). Persisted: best streak, accuracy per street, recent misses ("Review misses"). Spot generation and grading are pure functions in `src/sim/strategy/drill.ts`; EV comes through the EV client |
| `#/hands` | Hand rankings | Ten categories, an example of each drawn as cards, exact 7-card counts and probabilities from the engine's evaluator tests, the tie-break ("kicker") rules |
| `#/bets` | Paytables | Ante, Blind, Play, Trips and any simulated side bet: payout table per preset, house edge and element of risk from math, tier badge |
| `#/bets/:wagerId` | Wager detail | Copy from `bets.json`, paytable, edge, "Learn" link, "Try it" |
| `#/glossary` | Glossary | Search, `?term=slug` anchors |
| `#/settings` | Settings | §2.4 |
| `#/more` | More | Strategy charts, Hands, Paytables, Glossary, Settings, About (version, build sha, license, disclaimer, help lines) |
| anything else | Not found | Link home |

Bottom tab bar on phones: **Learn · Play · Drill · More** (user answer D4;
Home is the app title/logo tap). Top nav at ≥ 768 px with the same four
items. There is no Strategy tab: the cheat-sheet chart is the first card in
Learn, the first item in More, and is linked from every Drill answer.

Card notation in URLs and content: rank `23456789TJQKA` + suit `shdc`, e.g.
`As`, `Td`. The parser is the engine's (`parseCards`), so the app, content and
tests share one definition.

### 2.2 Router

Copy `src/app/router.ts` from crappy unchanged (`parseHash`, `matchPath`,
`navigate`, `useRoute`, `consumeFreshNav` scroll restore).

### 2.3 Lesson ↔ simulator

As in crappy's final shape (decisions.md there): the **scene runner lives in
`src/sim/scene`** (steps, `completeWhen`, forced decks). The app's
`LessonScene` renders `<Simulator scene onEvent settings>` lazily
(IntersectionObserver), and persists progress from `step-completed` /
`scene-completed` events. API names follow simulator.md (`Simulator`,
`SimulatorEvent`, `validateScene`).

### 2.4 Storage and settings

One localStorage key, **`holdumb:v1`**, through `createStorage()` (probe, then
in-memory fallback with a "progress won't be saved in this copy, use Settings
→ Export" banner). `load()` validates, migrates by `version` and never throws;
`save()` is debounced by 300 ms.

```ts
interface PersistedV1 {
  version: 1;
  lessons: Record<LessonId, LessonProgress>; // same shape as crappy (quizzes incl. firstTry, scenes)
  settings: Settings;
  drill?: {
    bestStreak: number;
    byStreet: Record<'preflop' | 'flop' | 'river', { answered: number; correct: number }>;
    recentMisses: string[]; // spot codes from strategy/drill.ts, newest first, max 50
  };
  sandbox?: unknown; // opaque snapshot owned by sim/ui (engine state JSON, money in cents)
}
interface Settings {
  theme: 'system' | 'light' | 'dark';
  animationSpeed: 'normal' | 'fast' | 'instant'; // OS reduced motion forces 'instant'
  reduceMotion: boolean;
  defaultBankrollCents: number; // default 50_000 ($500)
  anteUnitCents: number;        // default 1_000 ($10); per-hour lines scale by it
  handsPerHour: number;         // default from curriculum.md (placeholder 30)
  confirmCostlyMoves: boolean;  // default true: red tier needs a second tap
  fourColorDeck: boolean;       // default false
  paytable: string;             // preset id from the engine registry; default per decisions.md
}
```

Settings flow into the simulator as props; `src/sim/**` never reads storage.
Export/Import uses the base64 JSON code from crappy.

### 2.5 Layout and quality bars (unchanged from playbook §4)

Mobile first, single column, max width 42 rem, 16 px gutters, tap targets ≥ 44
px, no horizontal scroll at 360 px, OS reduced motion forces instant
animation, light and dark tokens (`:root`, `@media (prefers-color-scheme: dark)
{ :root:not([data-theme=light]) }`, `:root[data-theme=dark]`), system fonts
only, axe with no serious or critical issues. **Landscape (863x360 Pixel 7 and
844x390)** keeps Deal / Check / Bet / Fold visible: the step panel and EV sheet
go in a side rail.

---

## 3. Content authoring and validation

### 3.1 Files

```
content/
  chapters.json        [{ id, title, summary, lessons: LessonId[] }]   (content lead)
  glossary.json        [{ term, slug?, definition (md), see?, seeAlso? }]
  bets.json            { [wagerId]: { summary, howItWorks (md), tip?, lessonId? } }
  hands.json           { [handCategoryId]: { name, example: "As Ks Qs Js Ts", summary } }
  strategy.json        { [strategyId]: { title, summary, rules: string[] (md) } }
  lessons/NN-slug.md   one lesson; NN is a two-digit order prefix
  _sample-*.json, lessons/_sample-*.md   placeholders used only when the real files are absent
  README.md
```

Numbers are never written in `bets.json`, `hands.json` or `strategy.json`:
payouts, edges, counts and chart cells come from the engine and math, so they
cannot drift.

### 3.2 Lesson format (crappy's, plus three UTH additions)

````markdown
---
id: flop-decision
title: The flop: raise 2x or check
chapter: perfect-lowest-edge
summary: When the flop helps you, and when it helps the dealer.
minutes: 7
---

You hold {{As 7d}} and the flop is {{Ah 9c 2s}}. You paired your ace…

:::math Why raising 2x here is worth it
…exact fractions…
:::

:::tip
Count your **outs** for the dealer, not just for you.
:::

```scene
# SceneConfig per simulator.md (money in cents, forced deck on the step that uses it)
```

```chart
strategy: perfect
view: flop        # preflop-grid | flop | river
highlight: [A7o]
```

```quiz
- q: You hold this hand on the flop. What's the best play?
  hand: { hole: As 7d, board: Ah 9c 2s }
  options: [Raise 2x, Check]
  answer: 0
  explain: Any pair (not a pair on the board alone) is a 2x raise.
```
````

| Construct | New? | Compiles to | Validation (build fails on error) |
| --- | --- | --- | --- |
| YAML front matter `id, title, chapter, summary, minutes` | no | `Lesson` fields | id unique, equals the file slug, listed in exactly one chapter, chapter matches |
| `:::math Title … :::` | no | `{ kind: 'math', title, html }` | title required, container closed |
| `:::tip … :::` | no | `{ kind: 'tip', html }` | closed |
| `[[term]]`, `[[term\|label]]` | no | glossary link | term must exist |
| `{{As Kd}}` inline cards | **yes** | `<span class="cards" role="img" aria-label="Ace of spades, King of diamonds">` with suit glyph + `︎` and suit colour classes (4-colour honoured by CSS) | every code parses with the engine's `parseCards`; no duplicate card inside one group |
| ` ```scene ` YAML | no | `{ kind: 'scene', scene }` | `validateScene` from `src/sim/scene` (decks have no duplicate cards and enough cards, ids exist, `completeWhen` known) |
| ` ```quiz ` YAML list `{ id?, q, options, answer (0-based), explain, hand? }` | `hand` is new | `{ kind: 'quiz', quiz }` | ≥ 2 options, no duplicates, answer in range, ids unique (default `<lessonId>-q<n>`), `hand` cards valid and disjoint |
| ` ```chart ` YAML `{ strategy, view, highlight? }` | **yes** | `{ kind: 'chart', chart }` rendered by `StrategyChart` from `src/sim/ui` | strategy id exists in the strategy registry; view known; highlight cells valid (`AKs`, `T9o`, `77`) |

Unknown fences that look like directives (` ```math `, ` ```callout `) and
unknown `:::` containers are build errors, as in crappy.

### 3.3 Pipeline

Unchanged from crappy: `build/vite-plugin-content.ts` exposes
`virtual:content`, built by `buildContent(root)` in `src/content/load.ts` using
the pure `compileLesson()` in `src/content/compile.ts`. The same functions run
in tests. HMR invalidates on `content/**`. The shipped bundle contains HTML
strings and validated JSON, never `marked` or `yaml`.

`ContentBundle` (owned by `src/content/types.ts`, stubbed in WP0):
`{ chapters, lessons, glossary, bets, hands, strategy }`.

### 3.4 Content tests (Vitest, node project)

- `tests/content/compile.test.ts` (app WP): every construct above, good and bad inputs.
- `tests/content/content.test.ts` (app WP): chapters ↔ lessons both ways;
  `bets.json` covers exactly the engine's wager ids; `hands.json` covers exactly
  the evaluator's categories; `strategy.json` covers exactly the strategy
  registry's ids; every `lessonId`/`see` resolves.
- `tests/content/lessons-{a,b,c}.test.ts` (one per content WP): their files
  exist, front matter, balanced containers, banned stale wording (as decided in
  decisions.md), and the pinned numbers their prose quotes, recomputed with the
  math module.
- `src/sim/scene/lessons.test.ts` (integration WP): **scripts every scene in
  every lesson to completion** (playbook §9).

`docs/authoring.md` (app WP) documents all of this for contributors.

---

## 4. EV transport: Web Worker support

simulator.md decides whether exact EV needs a worker. This section makes both
answers cost the same: math is written once as plain synchronous TS (or
generators), and the app always talks to it through one async client.

### 4.1 Rules

1. **Math stays pure and synchronous** in `src/sim/math` (and strategy
   simulation in `src/sim/strategy`). No `postMessage`, no `self`, no async.
2. Long jobs are written as **generator functions** that `yield` progress
   every few thousand evaluations:
   `type Job<Req, Res> = (req: Req) => Generator<Progress | undefined, Res, void>`.
   A short job simply never yields.
3. UI code (`src/sim/ui`, `src/app`) calls the math only through the
   **EV client**. Exception: trivially cheap lookups (paytables, tiers, a
   precomputed table read) may be imported directly.
4. Messages carry **plain data only**. Fractions cross the boundary as
   `{ num: bigint, den: bigint }` records (BigInt is structured-cloneable;
   class instances lose their prototype). A protocol test round-trips every
   result type through `structuredClone` and checks deep equality.

### 4.2 Modules (`src/sim/worker/`, owned by the math WP; stubs in WP0)

| File | Role |
| --- | --- |
| `protocol.ts` | **Frozen contract.** `EvJobs` map (`kind → { req; res }`, payload types imported from `math/types.ts` and `strategy/types.ts`), the `ToWorker` / `FromWorker` message unions, `PROTOCOL_VERSION` |
| `jobs.ts` | `JOBS: { [K in keyof EvJobs]: Job<EvJobs[K]['req'], EvJobs[K]['res']> }`, wiring kinds to math/strategy functions |
| `runner.ts` | `runSliced(job, req, { sliceMs, onProgress, isCancelled, yieldFn })`: steps the generator in time slices and yields to the event loop between slices, so `cancel` messages and UI frames get through. Shared by both transports |
| `ev.worker.ts` | Worker entry: `onmessage` → `runSliced(JOBS[kind], …)` with `sliceMs: 50`; answers `ping` with `pong` |
| `transport-url.ts` | `import W from './ev.worker.ts?worker'` (separate file, Pages/PWA build) |
| `transport-inline.ts` | `import W from './ev.worker.ts?worker&inline'` (single-file build) |
| `transport-inthread.ts` | No worker: runs `runSliced` on the main thread with `sliceMs: 8` and a `MessageChannel` yield. Used by Vitest, and as the runtime fallback |
| `client.ts` | `createEvClient(opts?): EvClient` (below), cache, cancellation, health check, fallback |
| `index.ts` | Re-exports the client and protocol types (through `src/sim/index.ts`) |

```ts
// protocol.ts (shape frozen in WP0; simulator.md fills the payload types)
export const PROTOCOL_VERSION = 1;
export interface EvJobs {
  preview: { req: PreviewRequest; res: DecisionPreview };   // EV of every option at a decision
  simulate: { req: SimulateRequest; res: SimulateResult };  // auto-play / multi-session runs
  // more kinds may be added by contract extension (message main first)
}
export type JobKind = keyof EvJobs;
export interface Progress { done: number; total: number }
export type ToWorker =
  | { t: 'ping' }
  | { t: 'run'; id: number; kind: JobKind; req: unknown }
  | { t: 'cancel'; id: number };
export type FromWorker =
  | { t: 'pong'; version: number }
  | { t: 'progress'; id: number; p: Progress }
  | { t: 'done'; id: number; res: unknown }
  | { t: 'error'; id: number; message: string };

// client.ts
export interface EvClient {
  run<K extends JobKind>(
    kind: K,
    req: EvJobs[K]['req'],
    opts?: { key?: string; signal?: AbortSignal; onProgress?: (p: Progress) => void },
  ): Promise<EvJobs[K]['res']>;  // rejects with AbortError when superseded or aborted
  readonly mode: 'worker' | 'inthread';
  dispose(): void;
}
```

Client behaviour:
- **Latest wins per `key`.** A new `run` with the same `key` (e.g. `'preview'`)
  cancels the one in flight. Tapping options quickly never queues work.
- **Memo cache:** LRU of 64 results keyed by `kind + canonical JSON of req`
  (bigint-safe serializer). Re-opening the same decision is instant.
- **Health check and fallback:** on creation the client posts `ping`. If the
  constructor throws, an `error` event fires, or no `pong` arrives within
  1500 ms, it switches to `transport-inthread` for the rest of the session and
  re-runs anything pending. This covers WebViews and embedding hosts (e.g. a
  Claude Artifact) whose CSP blocks workers.
- **One worker** per app, created lazily on first `run`. Never terminated on
  route change.
- The UI shows a skeleton on the EV sheet after 150 ms and a progress bar for
  `simulate`. The confirm button stays enabled; EV is advisory.

### 4.3 Build wiring (verified)

```ts
// vite.config.ts (additions to crappy's)
resolve: {
  alias: {
    '#ev-worker': fileURLToPath(new URL(
      single ? './src/sim/worker/transport-inline.ts' : './src/sim/worker/transport-url.ts',
      import.meta.url)),
  },
},
worker: { format: single ? 'iife' : 'es' },
```

```ts
// vitest.config.ts (shared block)
resolve: { alias: { '#ev-worker': fileURLToPath(new URL('./src/sim/worker/transport-inthread.ts', import.meta.url)) } },
```

`tsconfig.app.json` maps `"paths": { "#ev-worker": ["./src/sim/worker/transport-url.ts"] }`
for typechecking. All three transports export
`export const createTransport: TransportFactory` and a type test asserts each
`satisfies TransportFactory`.

**Scratch verification** (`/tmp/holdumb-scratch/architecture/wk`, Chromium
1194 via Playwright 1.56.1, Pixel 7 profile):

| Variant | `http://localhost` | `file://` |
| --- | --- | --- |
| blob URL, classic worker | works | works |
| blob URL, `type: 'module'` | works | **fails** (async `error` event, so Vite's try/catch fallback to `data:` never runs) |
| `data:` URL, classic | works | works |
| `data:` URL, module | works | works |
| Vite `?worker&inline`, `worker.format: 'es'` | works | **fails** |
| Vite `?worker&inline`, `worker.format: 'iife'` | works | **works** |
| Vite `?worker` (separate file), `es` | works | n/a (Pages build only) |

So the single-file build **must** use `worker.format: 'iife'`, and the worker
must not use dynamic `import()` (IIFE workers cannot code-split; nothing in the
app may use `import()` anyway, as in crappy). The client's ping fallback covers
`content://` and any host we could not test.

**PWA:** the worker chunk lands in `dist/assets/`, so crappy's SW plugin
(which walks every emitted file) precaches it with no change. Dedicated-worker
script fetches go through the page's service worker, so EV works offline;
`offline.spec.ts` asserts it.

**Size:** in the single file the worker is embedded as a string next to the
main bundle, so engine + math appear twice (the main copy serves the
in-thread fallback). That is accepted; §5.4 budgets for it.

### 4.4 If simulator.md says "no worker needed"

Keep the client and protocol (they are tiny). WP0 still stubs them; the math
WP sets `createEvClient({ mode: 'inthread' })` as the default and skips the
two worker transports and the `?worker` alias. Nothing in `src/sim/ui` or
`src/app` changes, because they only ever saw `EvClient`.

### 4.5 Performance budget (check in `perf.spec.ts` at 4x CPU throttle)

| Operation | Budget at 4x throttle |
| --- | --- |
| Main-thread task during a preview | < 50 ms (no long task while the table animates) |
| `preview` at the river | < 100 ms |
| `preview` at the flop | < 1.5 s (skeleton shows meanwhile) |
| `preview` preflop | < 100 ms (table lookup) or < 1.5 s (computed) |
| `simulate` 1,000 hands | < 3 s, with progress |

Numbers per street are placeholders; simulator.md sets the algorithm and may
tighten them in decisions.md.

### 4.6 Precomputed tables (only if simulator.md asks)

- Output: `src/sim/math/tables/<name>.ts`, `// @generated by npm run gen:tables`,
  compact (packed strings or bigint pairs as strings), listed in
  `.prettierignore` and the ESLint ignores.
- Generator: `tests/gen/tables.gen.test.ts`, run by
  `npm run gen:tables` = `GEN_TABLES=1 vitest run --project node --passWithNoTests tests/gen`.
  Running it through Vitest reuses the app's TS resolution with zero new deps.
  (Node 22's type stripping can't resolve our extensionless imports.)
- Verify: without `GEN_TABLES`, the same file recomputes a fixed sample of
  entries (all of them if that takes under 30 s in CI) and checks exact
  equality plus a sha256 recorded in the generated header.
- Budget: ≤ 150 kB raw across all tables.

---

## 5. Delivery

### 5.1 GitHub Pages (home)

`https://creynia.github.io/holdumb/`, built by `pages.yml` (§7.2). `base: './'`
and hash routing, so the same build works under `/holdumb/`, `file://` and
`content://`. One-time setup by the user: repo **public**, **Settings → Pages →
Source: GitHub Actions** (in Chrome, ⋮ → "Desktop site" if hidden). The
orchestrator may try `gh api -X POST repos/creynia/holdumb/pages -f build_type=workflow`
first; it only works with admin rights.

### 5.2 PWA

- `public/manifest.webmanifest`: `name: "holdumb: learn Ultimate Texas Hold'em"`,
  `short_name: "holdumb"`, `start_url: "./"`, `scope: "./"`,
  `display: "standalone"`, `background_color` and `theme_color` `#0b2e4a`,
  icons 192, 512, maskable 512, SVG.
- Icons: `assets/icon.svg` (two overlapping cards on navy felt, a spade pip)
  and `scripts/gen-icons.mjs` drawing the same procedurally (a spade is two
  circles, a triangle and a stem), as in crappy. Gitignored outputs; a unit
  test checks the PNG signature and IHDR sizes.
- SW: crappy's `src/pwa/sw.ts` with `PREFIX = 'holdumb-'`. Precache
  everything, cache first, navigation fallback to `index.html`, versioned
  cache, old caches deleted on activate. No automatic `skipWaiting`.
- Update: "Update available — Reload" toast (posts `SKIP_WAITING`, reloads on
  `controllerchange`), plus **Settings → Check for updates**, plus the build
  sha in About.
- Registration only when `!__SINGLE_FILE__`, not in dev, and only on
  `http(s):`.

### 5.3 Single offline file `holdumb.html`

- `npm run build:single` → `vite build --mode single` (singlefile plugin, no
  `public/`, no SW plugin, IIFE inline worker) → `scripts/finalize-single.mjs`
  renames to `dist-single/holdumb.html` and fails on any external reference
  (crappy's checks, unchanged), on SW registration, and on the size budget.
- `build:all` copies it to `dist/holdumb.html`; Home links to it ("Download
  offline copy") when not in single mode.
- Opens in Chrome from Downloads (choose **Chrome**, not "HTML Viewer").
  Storage may be unavailable under `file://`/`content://`: the in-memory
  fallback banner and Export/Import cover it.

### 5.4 Size budget

Baseline measured today: crappy's single file is **343,423 bytes raw / 105 kB
gzip**. holdumb adds a second copy of engine + math (the worker) and possibly
tables.

| | Budget (raw bytes) |
| --- | --- |
| Target for `holdumb.html` | ≤ 600 kB |
| Hard fail in `finalize-single.mjs` (`MAX_SINGLE_BYTES`) | 800 kB |
| Precomputed tables, total | ≤ 150 kB |

`tests/build/single-file.test.ts` also asserts the budget against a real build
when one exists, and prints the size so PR reviewers see the trend.

### 5.5 Rolling release

`release.yml` keeps a `latest-build` prerelease with `holdumb.html`, updated
on every push to `main` (force-moved tag, `gh release upload --clobber`, else
create), and makes a versioned release on `v*` tags. This is crappy's file,
renamed.

### 5.6 Claude Artifact preview

The orchestrator can publish `dist-single/holdumb.html` as an Artifact for the
first look. It has no external requests, sets `<title>holdumb</title>`, gives
the body a background, and defines its tokens on `:root` with the dark guard.
If the host blocks workers, the EV client's ping fallback runs the math in
thread. This is a preview channel; Pages/PWA is home.

---

## 6. Repo layout and file ownership

Tags name the work package that owns each path (§9). **[B]** marks a baton
file: shared, owned by the orchestrator, edited only under a baton grant.

```
holdumb/
├── .github/
│   ├── workflows/{ci,pages,release}.yml        [infra]
│   ├── ISSUE_TEMPLATE/{bug_report,lesson_idea}.md  [infra]
│   └── pull_request_template.md                [infra]
├── assets/icon.svg                             [infra]
├── build/
│   ├── vite-plugin-content.ts                  [app]
│   └── vite-plugin-sw.ts                       [infra]
├── content/
│   ├── chapters.json glossary.json bets.json hands.json strategy.json  [content-a = content lead] [B]
│   ├── lessons/NN-slug.md                      [content-a | content-b | content-c, by chapter]
│   ├── _sample-*.json, lessons/_sample-*.md    [app]
│   └── README.md                               [app]
├── docs/
│   ├── design/{curriculum,simulator,architecture}.md   [spikes; frozen after PR #1]
│   ├── design/decisions.md                     [orchestrator] [B]
│   ├── authoring.md                            [app]
│   ├── chips.md                                [orchestrator] [B]
│   └── screenshots/                            [table-ui, integration]
├── public/manifest.webmanifest                 [infra]   (public/icons/ generated, gitignored)
├── scripts/{gen-icons,finalize-single}.mjs     [infra]
├── src/
│   ├── main.tsx                                [WP0 → app] [B]
│   ├── env.d.ts                                [WP0] [B]   __SINGLE_FILE__, __APP_VERSION__, __BUILD_SHA__, virtual:content, '#ev-worker'
│   ├── sim/
│   │   ├── index.ts                            [WP0] [B]   public barrel
│   │   ├── engine/                             [engine]    types.ts FROZEN [B]; cards, deck, rng, evaluator, rules/paytables, game, wagers, validate
│   │   ├── math/                               [math]      exact EV, preview, tiers, alternatives, explain, fraction; tables/ (generated)
│   │   ├── worker/                             [math]      protocol.ts FROZEN [B]; jobs, runner, ev.worker, transport-*, client
│   │   ├── strategy/                           [strategy]  presets (perfect / practical / fun), simulate, metrics, chart data
│   │   ├── scene/                              [integration] runner, validate (WP0 stub), lessons.test.ts
│   │   └── ui/                                 [table-ui; Simulator.tsx container = integration]  Table, Card, ChipStack, EvSheet, StrategyChart, BankrollChart, layouts/
│   ├── content/{types,compile,load,cards}.ts   [app]   types.ts [B] (stub in WP0)
│   ├── app/                                    [app]
│   │   ├── App.tsx routes.tsx router.ts context.tsx store.ts storage.ts theme.ts
│   │   ├── screens/ Home Learn Lesson Play Strategy Drill Hands Bets Glossary Settings More NotFound
│   │   ├── components/ Shell Link Html Quiz LessonScene TierBadge ProgressRing UpdateToast InlineCards
│   │   └── styles/ tokens.css [B] app.css
│   └── pwa/{sw,register}.ts                    [infra]
├── tests/
│   ├── app/          [app]
│   ├── content/      compile.test.ts, content.test.ts [app]; lessons-{a,b,c}.test.ts [content-*]
│   ├── build/        icons.test.ts, single-file.test.ts [infra]
│   ├── gen/          tables.gen.test.ts [math] (only if tables exist)
│   └── e2e/          smoke.spec.ts [WP0 → integration]; others below
├── index.html                                  [WP0] [B]
├── vite.config.ts                              [WP0] [B]  one line per plugin; worker alias in WP0
├── vitest.config.ts                            [WP0] [B]
├── playwright.config.ts                        [WP0] [B]
├── tsconfig.json, tsconfig.app.json, tsconfig.node.json  [WP0] [B]
├── eslint.config.js                            [WP0] [B]
├── .prettierrc.json .prettierignore .editorconfig .gitignore .nvmrc  [WP0] [B]
├── package.json, package-lock.json             [WP0] [B]
├── LICENSE (MIT, exists)                       [orchestrator]
├── README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md  [infra]
```

Simulator unit tests are colocated (`src/sim/**/*.test.ts(x)`); everything
else is under `tests/**`, as in crappy.

E2E specs (`tests/e2e/`, integration WP unless noted): `smoke` (WP0),
`lessons` (quiz + scene to completion + reload persists), `sandbox` (deal,
preview shows EV before confirm, red-tier second tap, fold/raise paths,
auto-play chart), `strategy` (chart renders, cell → sandbox preset),
`settings` (theme, export → reset → import), `drill` (answer a spot, EV sheet and chart cell appear, streak persists after reload, "See the chart" deep-links), `layout` (360 px no horizontal
scroll, landscape keeps primary actions visible), `a11y` (axe on home, lesson, drill,
sandbox, strategy), `offline` [infra] (SW offline reload **and an EV preview
offline**), `single-file` [infra] (open via `file://`, deal a hand, EV preview
resolves with `mode === 'worker'`, no failed requests), `perf` (4x CPU
throttle budgets, mobile project only).

### 6.1 Layering (enforced by ESLint `no-restricted-imports` + `no-restricted-globals`)

```
engine    ← nothing
math      ← engine
strategy  ← engine, math
worker    ← engine, math, strategy        (may use self/postMessage; no document/window/localStorage)
scene     ← engine, math, strategy
ui        ← engine, math, strategy, scene, worker (client only)
content   ← sim (types, parseCards, validateScene, registries)
app       ← everything
pwa       ← nothing app specific
```

Copy crappy's rule blocks. They list **relative** patterns (`../ui`,
`../../*`) as well as globs, because a crappy WP0 review found that glob-only
patterns missed relative imports. Add a block for `src/sim/worker/**`. Add a
lint fixture test (`tests/build/layering.test.ts`, infra) that lints a
temporary bad import in each layer and expects an error, so the rules can't
silently stop working.

---

## 7. Scripts and workflows

### 7.1 `package.json` scripts

```json
{
  "predev": "node scripts/gen-icons.mjs",
  "dev": "vite",
  "prebuild": "node scripts/gen-icons.mjs",
  "build": "tsc -b && vite build",
  "build:single": "vite build --mode single && node scripts/finalize-single.mjs",
  "build:all": "npm run build && npm run build:single && cp dist-single/holdumb.html dist/holdumb.html",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "gen:tables": "GEN_TABLES=1 vitest run --project node --passWithNoTests tests/gen",
  "lint": "eslint .",
  "typecheck": "tsc -b --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "check": "npm run lint && npm run typecheck && npm run format:check && npm test"
}
```

`gen:tables` is added in WP0 even if unused (it exits 0 with no tests via
`--passWithNoTests`), so no later WP touches `package.json`.
`vite.config.ts` defines `__BUILD_SHA__` as
`JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7))`.

Playwright: `PORT` env (default 4173), `reuseExistingServer: !process.env.CI`,
projects `mobile` (Pixel 7), `phone-landscape` (Pixel 7 landscape, only
`sandbox|lessons|layout|drill`), `desktop`; `perf.spec.ts` runs only in
`mobile`. Locally: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and install
with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`.

### 7.2 Workflows (crappy's, renamed, with these notes)

**`ci.yml`**: `push` to `main` + `pull_request`; concurrency per ref, cancel
in progress; `permissions: contents: read`; `timeout-minutes: 20`.
Job `check`: checkout, setup-node (`.nvmrc`, npm cache), `npm ci`, lint,
typecheck, format:check, `build:all`, `npm test` (after the build so the
single-file tests see a real file), upload `holdumb-html`.
Job `e2e` (needs `check`): `npm ci`, `npx playwright install --with-deps
chromium`, `npm run test:e2e`, upload `playwright-report` on failure.

**`pages.yml`**: `push` to `main` + `workflow_dispatch`;
`permissions: { contents: read, pages: write, id-token: write }`;
`concurrency: { group: pages, cancel-in-progress: false }`.
Build: `npm ci`, `npm run check`, `npm run build:all`,
`actions/configure-pages@v5` (no `enablement`), `upload-pages-artifact@v3`
(`dist`). Deploy: `actions/deploy-pages@v4`, `environment: github-pages`.
Known GitHub-side flake (crappy): a deploy can time out in "updating_pages"
and the next one then fails with "deployment in progress". Fix: re-run the
failed job. Document in CONTRIBUTING.

**`release.yml`**: `push` tags `v*` + branches `main` + `workflow_dispatch`;
`permissions: contents: write`; concurrency per ref; `npm ci`,
`npm run build:single`; then the versioned-release step and the rolling
`latest-build` step from crappy (force-moved tag, upload `--clobber` with
edit, else create `--prerelease`), with `holdumb.html` and the notes line
"Download holdumb.html and open it in Chrome; it works offline."

---

## 8. WP0: scaffold and contracts (serial, one agent)

WP0 creates every [WP0] and [B] file above, so no later WP needs
`package.json`, a tsconfig, the ESLint config or the Vite config.

1. **Tooling:** the crappy dependency set exactly (§1.1), `npm install` with
   `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, all scripts (§7.1), all configs
   (Vite with the worker alias and `worker.format`, Vitest with both projects
   and the in-thread alias, Playwright with `PORT` and three projects,
   tsconfigs with `paths` and node types, ESLint with every layering block
   including `worker`), `.nvmrc`, `.editorconfig`, `.prettierrc.json`,
   `.prettierignore` (adds `src/sim/math/tables`), `index.html`
   (title `holdumb`, theme colour, inline SVG favicon), `src/env.d.ts`.
2. **Contract stubs** (real types, throwing bodies `throw new Error('TODO(<wp>)')`):
   - `src/sim/engine/types.ts` copied **verbatim** from simulator.md, then frozen.
   - Each `src/sim/<module>/index.ts` with the signatures from simulator.md,
     plus real small data where simulator.md lists it (wager ids, paytable
     preset ids, strategy ids, hand category ids) so content tests can run.
   - `src/sim/engine` `parseCards` implemented for real (the content compiler
     and URL parser need it; about 20 lines plus a test).
   - `src/sim/worker/protocol.ts` (frozen), `client.ts` with a working
     in-thread client over stub jobs, the three transports, and `ev.worker.ts`
     answering `ping`, so the worker path is proven end to end in WP0.
   - `src/sim/scene/validate.ts`: minimal `validateScene` (shape check only).
   - `src/sim/ui/Simulator.tsx`: placeholder rendering a heading and a
     "table coming soon" card; `EvSheet` and `StrategyChart` placeholders.
   - `src/sim/index.ts` barrel.
   - `src/content/types.ts` complete (blocks incl. `chart`, quiz `hand`,
     `ContentBundle` with `hands` and `strategy`).
   - `src/main.tsx` rendering a minimal shell with a visible `h1`.
3. **Tests:** one Vitest test per project (node: `parseCards`; dom: the
   placeholder renders), a worker protocol `structuredClone` round-trip test,
   `tests/e2e/smoke.spec.ts` (visible `h1`, title `holdumb`; assert structure,
   not placeholder text), and a WP0-only `tests/e2e/worker-smoke.spec.ts` that
   opens `dist-single/holdumb.html` via `file://` and checks the client reports
   `mode: 'worker'` after a ping (exposed for tests via `window.__holdumb`).
4. **Docs:** none beyond a README "under construction" line (infra writes the
   real ones).

**Exit criterion:** on a clean clone, `npm ci && npm run check && npm run
build:all && npm run test:e2e` are all green (e2e with
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), `dist-single/holdumb.html`
exists with no external references, the worker smoke passes under `file://`,
and an **Opus review of WP0** has checked: every dependency present, test
files typecheck with Node types, a deliberate bad relative import fails lint
in each layer, and the baton list matches the files. Only then fan out.

---

## 9. Parallel work packages

All of them branch from merged WP0. The simulator doc's chunk list wins on
the internal split of `src/sim/**`; this is the default mapping.

| WP | Owns | Depends on | Delivers |
| --- | --- | --- | --- |
| **engine** | `src/sim/engine/**` | WP0 | cards, seeded shuffle, forced decks, 7-card evaluator with exhaustive category-count tests, rules and paytable presets, wager registry, game state machine, validation, event log. **Pushes early.** |
| **math** | `src/sim/math/**`, `src/sim/worker/**`, `tests/gen/**` | engine (merge its branch early) | exact EV per decision, preview API, tiers, alternatives, "Why?" rows, worker jobs, client, tables if any, Monte-Carlo cross-checks |
| **strategy** | `src/sim/strategy/**` | engine, math | perfect / practical / fun presets, chart data, `drill.ts` (spot generator with a seeded RNG and street/focus filters, grading against a lens, spot codes), simulate & simulateMany (as worker jobs), per-hour metrics |
| **table-ui** | `src/sim/ui/**` except `Simulator.tsx` | engine types, math types | felt SVG portrait + landscape, cards (SVG suits, 4-colour), chips, EvSheet, StrategyChart, BankrollChart, animations, a gallery driven by the **real** engine (never mock data), screenshots |
| **app** | `src/app/**`, `src/content/**`, `build/vite-plugin-content.ts`, `content/_sample-*`, `content/README.md`, `tests/app/**`, `tests/content/{compile,content}.test.ts`, `docs/authoring.md` | WP0 | all screens and routes (incl. the Drill tab and the Strategy charts screen), store/storage, settings, content compiler incl. `{{cards}}`, `chart`, quiz `hand`; uses the placeholder Simulator until integration |
| **infra** | `src/pwa/**`, `build/vite-plugin-sw.ts`, `scripts/**`, `public/**`, `assets/**`, `.github/**`, `tests/build/**`, `tests/e2e/{offline,single-file}.spec.ts`, README, CONTRIBUTING, CODE_OF_CONDUCT | WP0 | SW + update flow + check-for-updates hook, manifest, icons, finalize-single with size budget, workflows, layering lint test, repo docs (README "Use it" first, disclaimer, help lines) |
| **content-a** (lead) | `content/{chapters,glossary,bets,hands,strategy}.json`, lessons of chapters 1–2, `tests/content/lessons-a.test.ts` | app (format), engine ids | per curriculum.md |
| **content-b** | lessons of the middle chapters, `lessons-b.test.ts` | content-a's JSON ids | |
| **content-c** | the three Perfect-strategy chapters, `lessons-c.test.ts` | strategy ids | |
| **integration** (after engine, math, table-ui, app) | `src/sim/scene/**`, `src/sim/ui/Simulator.tsx`, `tests/e2e/**` except infra's | all | scene runner with strict validation, Simulator container wiring engine + client + UI + scenes, session panel, persistence, **a test that scripts every scene to completion**, e2e on three projects + axe + perf, screenshots it views itself |

Merge order: engine → math → strategy / table-ui → app → infra (any time) →
integration → content (content PRs can merge as soon as their tests pass
against the real registries).

### 9.1 Baton list (shared files; orchestrator owns, `BATON REQUEST <path> <why>`)

| Path | Typical requester | Note |
| --- | --- | --- |
| `package.json`, `package-lock.json` | anyone | WP0 should make this unnecessary; the orchestrator adds deps serially |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | math (paths), infra | |
| `eslint.config.js` | infra, math | layering blocks |
| `vite.config.ts` | app, infra | one line per plugin; edits are one-line |
| `vitest.config.ts`, `playwright.config.ts` | integration | projects, `testMatch` |
| `index.html` | infra | meta tags |
| `src/main.tsx` | app (owner after WP0), infra | infra asks app; never edited directly (crappy lesson) |
| `src/env.d.ts` | infra, math | new globals |
| `src/sim/index.ts` | engine, math, strategy, table-ui | append exports only |
| `src/sim/engine/types.ts` | engine | **frozen**: contract change via main, relayed to all |
| `src/sim/worker/protocol.ts` | math, strategy | **frozen**: new job kinds via main |
| `src/content/types.ts` | app, content | |
| `src/app/styles/tokens.css` | table-ui, app | felt / card / tier colours |
| `content/{chapters,glossary,bets,hands,strategy}.json` | content-b, content-c | content-a owns; others request |
| `docs/design/decisions.md`, `docs/chips.md` | anyone | orchestrator writes |

---

## 10. Viewing it on the phone

**Right away (no setup):** ask the session to publish the single-file build as
an Artifact, then tap the link in the Claude app.

**The web app (once):**
1. In the Claude app, ask for the PR link. Open it and tap **Merge pull
   request** → Confirm (GitHub app or Chrome).
2. In Chrome go to `github.com/creynia/holdumb` → **Settings** (if missing, ⋮ →
   **Desktop site**). General → Danger Zone → **Change visibility → Public** if
   it is private. **Pages** → Build and deployment → Source → **GitHub
   Actions**.
3. **Actions** tab → "Deploy to GitHub Pages" → **Run workflow** (or wait for
   the next merge). When it's green, open
   **https://creynia.github.io/holdumb/**.
4. Chrome ⋮ → **Add to Home screen → Install**. It opens like an app and works
   offline after the first load.

**The offline file:**
1. GitHub app → holdumb → **Releases** → "Latest build" → tap
   **holdumb.html** (or on the site: Home → "Download offline copy").
2. Chrome ⋮ → **Downloads** → tap `holdumb.html`. If asked, open with
   **Chrome**, not "HTML Viewer" (it doesn't run scripts).
3. If progress doesn't stick in this copy, use **Settings → Export** and
   **Import** to move it between copies.

**Updating:** every merge to `main` redeploys Pages and refreshes the "Latest
build" release. The installed app shows **"Update available — Reload"**. If it
doesn't, open **Settings → Check for updates**, and compare the build code in
**Settings → About** with the latest commit. If a Pages deploy failed with
"deployment in progress", re-run the failed job in the Actions tab.

---

## 11. Questions sent to main (all four answered; D1–D4 in the decisions draft)

1. First viewing: **answered (a):** Artifact of the single file, then Pages.
2. Single file vs EV speed: **answered (a):** small file (≤ 600 kB) with
   exact EV on the phone in a Web Worker, about 1 s at most per decision. So
   the worker transport (§4) is the default, not the fallback.
3. Orientation: **answered (a):** portrait first with a landscape layout.
4. Tab bar: **answered (c): Learn · Play · Drill · More.** No Strategy tab;
   the chart lives under Learn and More, and Drill links to it.

## 12. Assumptions for decisions.md

- simulator.md decides whether a worker and tables are needed; §4 works either way.
- `hands.json` and `strategy.json` exist only if the curriculum wants copy
  for them. If not, drop them from `ContentBundle` and the content tests.
- Hands per hour default comes from curriculum.md (placeholder 30).
- Default paytable preset id comes from decisions.md.
- Drill is v1 and a tab (D4). It reuses engine + EV client + EvSheet + StrategyChart.
- Scratch evidence: `/tmp/holdumb-scratch/architecture/wk` (worker variants
  and the Vite build), `/tmp/holdumb-scratch/architecture/crappy` (size baseline).
