# Contributing to holdumb

Thanks for helping people learn Ultimate Texas Hold'em. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Setup

Prerequisite: Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

## Scripts

| Script                 | What it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Vite dev server                                             |
| `npm run build`        | Typecheck and build the PWA into `dist/`                    |
| `npm run build:single` | Build the self-contained `dist-single/holdumb.html`         |
| `npm run build:all`    | Both of the above; copies `holdumb.html` into `dist/`       |
| `npm run preview`      | Serve `dist/`                                               |
| `npm test`             | Unit tests (Vitest)                                         |
| `npm run test:e2e`     | Playwright end-to-end tests                                 |
| `npm run test:visual`  | Screenshot comparison against the committed baselines       |
| `npm run lint`         | ESLint                                                      |
| `npm run typecheck`    | TypeScript                                                  |
| `npm run format`       | Prettier (write)                                            |
| `npm run check`        | lint + typecheck + format check + unit tests (what CI runs) |

## How the code is organised

The architecture map is in [`docs/design/architecture.md`](docs/design/architecture.md); the rules of the simulator are in `docs/design/simulator.md`.

**The engine stays pure.** Engine, math, strategy and scene code under `src/sim/` must not import Preact or any UI/app code, and must not touch the DOM or browser storage. The layering (engine, math, strategy, scene, worker, ui, content, app, pwa) is enforced by ESLint and by `tests/build/layering.test.ts`, and keeps the maths testable. Every EV number must be checkable against exact fractions.

## Writing a lesson

Lessons are Markdown files under `content/`. (format: `docs/design/architecture.md` §3; a full guide, `docs/authoring.md`, is coming).

## End-to-end tests locally

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
npx playwright install chromium          # or: export PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers
npm run test:e2e
```

## Visual tests

The `visual` CI job (`tests/visual/visual.spec.ts`, `playwright.visual.config.ts`) screenshots about a dozen scenes (play on each street, a settled win, a lesson scene, a Drill result, an auto-play chart, Learn, More, Settings, Hand rankings, Strategy) at 360x740, 390x844, 844x390 and 667x375, in light and dark, and compares them with the PNGs in `tests/visual/__screenshots__/<project>/<scene>.png`. Every scene is deterministic: fixed seeds in the URL, `speed=instant`, reduced motion, no CSS animations or transitions, a frozen `Date`, and fonts loaded before the shot.

Baselines are only valid when they come from the container that CI uses, `mcr.microsoft.com/playwright:v1.56.1-noble`, because fonts and rasterisation differ between machines. Never commit baselines generated on your own machine outside that container.

When a PR changes the UI on purpose, regenerate the baselines in one of these ways:

1. **In CI (no Docker needed).** On a PR from this repository, add the label `update-visual`. The `Visual baselines` workflow regenerates the baselines in the CI container from the labelled commit, with a read-only token, and uploads them as the artifact `visual-baselines`. A second job, which runs none of the PR's code, accepts only `.png` files under `tests/visual/__screenshots__/`, commits them as `chore(visual): update baselines`, pushes (fast-forward only, never to `main`) and re-runs CI. You can also start it from Actions > Visual baselines > Run workflow on your branch, and either tick `push` or download the `visual-baselines` artifact and commit its PNGs yourself (unzip it over `tests/visual/__screenshots__/`).
2. **With Docker:** `npm run test:visual:update`.
3. **Without Docker:** use the chroot recipe in the [appendix](#appendix-visual-baselines-without-docker).

**Regenerate only what changed.** Every route above runs `--update-snapshots` in its default mode, which rewrites only the snapshots that differ beyond the threshold. Do not delete the folder and regenerate everything: a full set is about 6 MB, and every full regeneration adds that much to the history for no reason. Commit only the PNGs your change was meant to alter. If others changed too, find out why before you commit them.

A PR that changes baselines must say why in its description, and reviewers look at the changed images. When the job fails, it uploads the artifact `visual-diff` (open `playwright-report/index.html` in it for the expected, actual and diff images), lists each failed snapshot and its diff pixel count in the job summary, and keeps one sticky comment on the PR that links the artifact. A later green run updates that comment to "All snapshots match".

## Ideas to pick up

Deferred, self-contained ideas are collected in [`docs/chips.md`](docs/chips.md). Open an issue or PR and link it there when you start one.

## Pull requests

- Use conventional-ish commit messages: `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`, `chore: ...`.
- Every PR must pass `npm run check`. CI also runs the build and e2e tests.
- Keep PRs focused, and fill in the PR template.

## CI notes

- A GitHub Pages deploy can time out in "updating_pages", and the next one then fails with "deployment in progress". This is a GitHub-side flake: re-run the failed job from the Actions tab.
- The offline file must stay under 800 kB (target 600 kB); `npm run build:single` fails above that and on any external reference.

## Appendix: visual baselines without Docker

As root on Linux, you can run the CI image without a Docker daemon by extracting it and using `chroot`:

1. Download the amd64 manifest for `playwright:v1.56.1-noble` from `https://mcr.microsoft.com/v2/playwright/manifests/v1.56.1-noble`. Download its layers from `.../blobs/<digest>`, check each one's sha256, and untar them in order into `rootfs/`. For each `.wh.<name>` whiteout file, delete `<name>` and the whiteout.
2. Add `127.0.0.1 localhost` to `rootfs/etc/hosts`.
3. From a shell started with `unshare -m --propagation private`, bind-mount your checkout at `rootfs/w`. Mount `proc` at `rootfs/proc`, rbind `/dev` and `/sys`, and mount a tmpfs at `rootfs/tmp`.
4. Run `chroot rootfs env -i PATH=/usr/local/bin:/usr/bin:/bin PLAYWRIGHT_BROWSERS_PATH=/ms-playwright HOME=/root CI=1 bash -c 'cd /w && npx playwright test -c playwright.visual.config.ts --update-snapshots'`.
