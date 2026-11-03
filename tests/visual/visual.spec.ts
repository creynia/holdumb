// Visual regression: one viewport snapshot per scene, plus one full-page snapshot per screen, in
// every project of playwright.visual.config.ts (4 viewports x light/dark). Baselines live in
// tests/visual/__screenshots__/<project>/<scene>.png and are only valid when generated inside
// mcr.microsoft.com/playwright:v1.56.1-noble (see CONTRIBUTING.md, "Visual tests").
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSettings } from '../e2e/settings-seed';

/** Frozen wall clock: Drill seeds its spot RNG from Date.now(), and no "today" text may drift. */
const FIXED_TIME = new Date('2026-01-15T12:00:00Z');

const FREEZE_CSS =
  '*, *::before, *::after { animation: none !important; transition: none !important; ' +
  'caret-color: transparent !important; }';

test.beforeEach(async ({ page }) => {
  // setFixedTime installs the fake clock with Date pinned while timers keep running in real
  // time, so the app's own setTimeout-driven pacing (EV skeleton delay etc.) still completes.
  await page.clock.setFixedTime(FIXED_TIME);
});

async function open(page: Page, hash: string) {
  await page.goto(`/#${hash}`);
  await page.addStyleTag({ content: FREEZE_CSS });
  await expect(page.locator('main#main')).toBeVisible();
}

/** Fonts loaded, no EV preview pending, layout stable for two frames, scrolled to the top. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator('[data-ev="pending"]')).toHaveCount(0);
  await expect(page.getByLabel('Simulation progress')).toHaveCount(0); // no auto-play run in flight
  await expect(page.locator('[data-lazy-pending]')).toHaveCount(0); // lazy panels have loaded
  // A click can scroll the page; the viewport snapshot is always of the first view.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

async function simReady(page: Page) {
  await expect(page.locator('[data-testid="simulator"][data-ev="ready"]')).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Full-page shots (below-the-fold content) only in the narrowest portrait and the smallest
 * landscape project, light scheme: the dark and roomier variants repeat the same layout and would
 * push the baselines past the 8 MB budget. The viewport shots cover all 8 projects.
 */
const FULL_PAGE_PROJECTS = ['p360-light', 'l667-light'];

const opt = (page: Page, k: string) => page.locator(`button[data-option="${k}"]`);

async function shoot(page: Page, scene: string, fullPage = false) {
  await settle(page);
  await expect(page).toHaveScreenshot(`${scene}.png`, { fullPage: false });
  if (fullPage && FULL_PAGE_PROJECTS.includes(test.info().project.name))
    await expect(page).toHaveScreenshot(`${scene}-full.png`, { fullPage: true });
}

test('play preflop', async ({ page }) => {
  await open(page, '/play?seed=7&hole=AsKd&speed=instant');
  await simReady(page);
  await shoot(page, 'play-preflop');
});

test('play flop with the EV sheet open', async ({ page }) => {
  // One tap acts by default (D40); with confirmOn 'all' the tap opens the sheet as the confirm step.
  await seedSettings(page, { confirmOn: 'all' });
  await open(page, '/play?seed=7&hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
  await simReady(page);
  await opt(page, 'play-2').click();
  await expect(page.getByTestId('ev-sheet')).toContainText(/Best play|mistake/i);
  await shoot(page, 'play-flop-ev');
});

test('play river fold result', async ({ page }) => {
  await open(
    page,
    '/play?seed=7&hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant',
  );
  await simReady(page);
  await opt(page, 'fold').click();
  await expect(page.getByTestId('fold-reveal')).toContainText(/would have (won|lost)|pushed/);
  await shoot(page, 'play-river-fold');
});

test('play settled win', async ({ page }) => {
  // Trip aces against the dealer's pair of kings: the dealer qualifies and the player wins.
  await open(
    page,
    '/play?seed=7&hole=AsAd&board=AhKs7d2c9h&dealer=Kd5c&street=river&speed=instant',
  );
  await simReady(page);
  await opt(page, 'play-1').click();
  await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
  await expect(page.locator('.sim-toast')).toContainText(/Net \+/);
  await shoot(page, 'play-settled-win');
});

test('auto-play result chart', async ({ page }) => {
  await open(page, '/play?seed=7&strategy=expert&speed=instant');
  const panel = page.getByTestId('auto-play');
  // 300 hands at the panel's default seed (1). The panel offers 30/300/3000/10000 hands only.
  await panel
    .locator('label', { hasText: /^Hands/ })
    .locator('select')
    .selectOption('300');
  await panel.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('auto-play-result')).toBeVisible({ timeout: 30_000 });
  await shoot(page, 'autoplay-chart', true);
});

test('lesson scene mid-step', async ({ page }) => {
  await open(page, '/learn/a-full-hand');
  const scene = page.locator('.scene').first();
  // Scenes mount when they scroll into view (IntersectionObserver); settle() scrolls back to 0.
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.getByTestId('step-panel')).toContainText(/Tap Deal/);
  await scene.getByRole('button', { name: /^Deal/ }).click();
  await expect(scene.getByTestId('step-panel')).toContainText(/Bet 4x/);
  await expect(scene.locator('g.sim-card:not(.sim-card-back)')).toHaveCount(2);
  await shoot(page, 'lesson-scene', true);
});

test('drill result', async ({ page }) => {
  // A single focus code pins the spot outright (nextSpot returns it without sampling), so a
  // change to the sampler cannot churn this baseline: 2dJd on a 4h6d9d flop (a flush draw).
  await open(page, '/drill?street=flop&focus=f:2dJd.4h6d9d');
  await expect(page.getByTestId('drill-spot')).toBeVisible();
  await expect(page.getByTestId('drill-spot')).toHaveAttribute('data-street', 'flop');
  // Bet 2x is the small-mistake answer here, so the baseline shows the mistake path.
  await page.locator('.choice-row button', { hasText: 'Bet 2x' }).click();
  await expect(page.getByTestId('drill-result')).toBeVisible();
  await shoot(page, 'drill-result', true);
});

for (const [scene, hash, heading] of [
  ['learn-index', '/learn', /Learn/],
  ['more', '/more', /More/],
  ['settings', '/settings', /Settings/],
  ['hand-rankings', '/hands', /Hand/],
  ['strategy-chart', '/strategy', /Strategy/],
] as const) {
  test(scene, async ({ page }) => {
    await open(page, hash);
    await expect(page.locator('main#main h1').first()).toContainText(heading);
    await shoot(page, scene, true);
  });
}
