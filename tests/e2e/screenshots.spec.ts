// Not a test: `SHOTS=1 npx playwright test screenshots` refreshes docs/screenshots/ from the REAL app.
import { test } from '@playwright/test';

test.skip(!process.env.SHOTS, 'set SHOTS=1 to refresh docs/screenshots');

const dir = 'docs/screenshots';

test('screenshots', async ({ page }, info) => {
  const o = info.project.name === 'phone-landscape' ? 'landscape' : 'portrait';
  if (info.project.name === 'desktop') return;
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}-${o}.png` });
  const ready = () =>
    page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 15000 });

  await page.goto('/#/play?seed=7&hole=AsKd&speed=instant');
  await ready();
  await shot('play-preflop');

  await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
  await ready();
  await page.locator('button[data-option="play-2"]').click();
  await page.waitForSelector('[data-testid="ev-sheet"]');
  await shot('play-flop');

  await page.goto('/#/play?hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant');
  await ready();
  await page.locator('button[data-option="fold"]').click();
  await page.waitForSelector('[data-testid="ev-sheet"]');
  await shot('play-river');

  await page.goto('/#/learn/a-full-hand');
  const scene = page.locator('.scene').first();
  await scene.scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-testid="step-panel"]');
  await scene.getByRole('button', { name: /^Deal/ }).click();
  await page.waitForTimeout(900); // let the deal animation finish
  await scene.locator('button[data-option="play-4"]').scrollIntoViewIfNeeded();
  await shot('lesson-scene');

  await page.goto('/#/drill?street=flop');
  await page.waitForSelector('[data-testid="drill-spot"]');
  await page.locator('.choice-row button').first().click();
  await page.waitForSelector('[data-testid="drill-result"]');
  await shot('drill');

  await page.goto('/#/play?strategy=expert&speed=instant');
  await page.locator('[data-testid="auto-play"]').getByRole('button', { name: 'Run' }).click();
  await page.waitForSelector('[data-testid="auto-play-result"]', { timeout: 30000 });
  await page.locator('[data-testid="auto-play-result"]').scrollIntoViewIfNeeded();
  await shot('autoplay-chart');
});
