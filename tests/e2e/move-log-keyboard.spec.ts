import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const sim = (page: Page) => page.getByTestId('simulator');
const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });

async function act(page: Page, option: string) {
  await ready(page);
  await page.locator(`button[data-option="${option}"]`).click();
  const confirm = page.getByTestId('confirm');
  await confirm.click();
  if (await page.getByTestId('blunder-warning').isVisible()) await confirm.click();
}

/** One hand: check, check, fold (I087). The first hand is dealt, later ones are re-bet. */
async function playHand(page: Page, first: boolean) {
  await page.locator(first ? 'button[data-action="deal"]' : 'button[data-action="rebet"]').click();
  await act(page, 'check');
  await act(page, 'check');
  await act(page, 'fold');
  await expect(sim(page)).toHaveAttribute('data-street', 'settled');
}

async function openLog(page: Page): Promise<Locator> {
  const log = page.getByTestId('move-log');
  if ((await log.getAttribute('open')) === null) await log.locator('summary').click();
  await expect(log).toHaveAttribute('open', '');
  return log;
}

test('the move-log list scrolls with the keyboard (I087)', async ({ page }) => {
  await page.goto('/#/play?speed=instant');
  for (let i = 0; i < 20; i++) await playHand(page, i === 0);
  const log = await openLog(page);
  await expect(log.getByTestId('move-log-hand')).toHaveCount(20);
  const list = log.locator('ol.sim-movelog-hands');
  // The list must overflow, or the scroll check below proves nothing.
  const overflow = await list.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow, 'the list overflows its 50vh box').toBeGreaterThan(40);
  // Reach the list the way a keyboard user does: Tab from the summary.
  await log.locator('summary').focus();
  await page.keyboard.press('Tab');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className ?? ''))
    .toContain('sim-movelog-hands');
  const overflowY = await list.evaluate((el) => getComputedStyle(el).overflowY);
  expect(['auto', 'scroll']).toContain(overflowY);
  await page.keyboard.press('PageDown');
  // Chromium smooth-scrolls: poll for ~500ms and keep the largest offset seen.
  let max = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(50);
    max = Math.max(max, await list.evaluate((el) => el.scrollTop));
  }
  expect(max, 'PageDown scrolls the list').toBeGreaterThan(0);
  // ArrowDown from the top also moves the list, and End reaches the oldest hand.
  await list.evaluate((el) => (el.scrollTop = 0));
  await page.keyboard.press('ArrowDown');
  let down = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(50);
    down = Math.max(down, await list.evaluate((el) => el.scrollTop));
  }
  expect(down, 'ArrowDown scrolls the list').toBeGreaterThan(0);
  await page.keyboard.press('End');
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2), {
      timeout: 2000,
    })
    .toBe(true);
});

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
] as const;

for (const vp of VIEWPORTS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`the open move log has no serious or critical axe violations at ${vp.width}x${vp.height} ${scheme} (I087)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/#/play?speed=instant');
      for (let i = 0; i < 3; i++) await playHand(page, i === 0);
      await openLog(page);
      const { violations } = await new AxeBuilder({ page })
        .include('[data-testid="move-log"]')
        .analyze();
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad).toEqual([]);
    });
  }
}
