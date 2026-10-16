import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });
const opt = (page: Page, k: string) => page.locator(`button[data-option="${k}"]`);

test.describe('sandbox', () => {
  test('a full hand from betting: chips, deal, EV before confirming, result', async ({ page }) => {
    await page.goto('/#/play?seed=7&speed=instant');
    const sim = page.getByTestId('simulator');
    // Clear leaves the $5 minimum; one more $5 chip on Ante makes $10 and the Blind mirrors it.
    await page.getByRole('button', { name: /^Clear/ }).click();
    await page.locator('button[data-chip="500"]').click();
    await page.locator('[data-hit="ante"]').click();
    await expect(page.locator('[data-circle="ante"]')).toContainText('$10');
    await expect(page.locator('[data-circle="blind"]')).toContainText('$10');
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    await expect(page.locator('g.sim-card:not(.sim-card-back)')).toHaveCount(2);
    // Preview first: the EV is visible before anything is confirmed.
    await opt(page, 'play-4').click();
    const sheet = page.getByTestId('ev-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(/exact/i);
    await expect(sheet).toContainText(/\$\d/);
    await expect(sim).toHaveAttribute('data-street', 'preflop');
    await page.getByTestId('confirm').click();
    await expect(sim).toHaveAttribute('data-street', 'settled');
    await expect(page.locator('.sim-toast')).toContainText(/Net/);
    expect(Number(await sim.getAttribute('data-equity'))).not.toBe(50_000);
    await expect(page.getByRole('button', { name: /Rebet/ })).toBeVisible();
  });

  test('a preset flop hand shows both options, one best badge, and plays on', async ({ page }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await expect(page.locator('button[data-option].is-best')).toHaveCount(1);
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('ev-sheet')).toContainText(/Best play|mistake/i);
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
  });

  test('a blunder needs a second tap', async ({ page }) => {
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await ready(page);
    await opt(page, 'check').click();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('blunder-warning')).toBeVisible();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'preflop');
    await page.getByRole('button', { name: 'Do it anyway' }).click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
  });

  test('folding reveals the dealer and what would have happened (D7)', async ({ page }) => {
    await page.goto('/#/play?hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant');
    await ready(page);
    await opt(page, 'fold').click();
    await page.getByTestId('confirm').click();
    const reveal = page.getByTestId('fold-reveal');
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(/would have (won|lost)|pushed/);
  });

  test('practice mode hides the EV until you confirm', async ({ page }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await page.getByTestId('practice-toggle').check();
    await expect(page.locator('button[data-option]').first()).not.toContainText('·');
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('practice-hidden')).toBeVisible();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('practice-result')).toBeVisible();
  });

  test('the session is saved in the app store and restored after a reload', async ({ page }) => {
    await page.goto('/#/play?speed=instant');
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    // Best play on every street until the hand settles.
    for (let i = 0; i < 3; i++) {
      if ((await page.getByTestId('simulator').getAttribute('data-street')) === 'settled') break;
      await ready(page);
      await page.locator('button[data-option].is-best').click();
      await page.getByTestId('confirm').click();
      await page.waitForTimeout(100);
    }
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
    await page.waitForTimeout(600);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.filter((k) => k.startsWith('holdumb'))).toEqual(['holdumb:v1']);
    await page.reload();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-hands', '1');
  });

  test('money never wraps and nothing scrolls sideways', async ({ page }) => {
    await page.goto('/#/play?seed=3&speed=instant');
    const wraps = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll('.sim-status dd, .sim-money')) {
        if (getComputedStyle(el).whiteSpace !== 'nowrap') bad.push(el.className);
      }
      return bad;
    });
    expect(wraps).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tap targets are at least 44 px and the action buttons are on screen', async ({ page }) => {
    await page.goto('/#/play?seed=7&speed=instant');
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-hit]')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width < 43.5 || r.height < 43.5)
        .map((r) => `${r.width.toFixed(0)}x${r.height.toFixed(0)}`),
    );
    expect(small).toEqual([]);
    const vp = page.viewportSize()!;
    const box = await opt(page, 'play-4').boundingBox();
    expect(box).not.toBeNull();
    if (vp.width > vp.height && vp.height < 520)
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  });
});
