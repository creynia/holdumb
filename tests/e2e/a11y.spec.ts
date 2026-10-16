import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function clean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(bad).toEqual([]);
}
const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });

test.describe('axe: no serious or critical issues', () => {
  test('sandbox betting, a decision and the EV sheet', async ({ page }) => {
    await page.goto('/#/play?seed=7&speed=instant');
    await clean(page);
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    await clean(page);
    await page.locator('button[data-option="play-4"]').click();
    await expect(page.getByTestId('ev-sheet')).toBeVisible();
    await clean(page);
  });
  test('a lesson scene', async ({ page }) => {
    await page.goto('/#/learn/a-full-hand');
    await page.locator('.scene').first().scrollIntoViewIfNeeded();
    await expect(page.getByTestId('step-panel').first()).toBeVisible();
    await clean(page);
  });
  test('drill with a graded answer', async ({ page }) => {
    await page.goto('/#/drill?street=flop');
    await page.locator('.choice-row button').first().click();
    await expect(page.getByTestId('drill-result')).toBeVisible();
    await clean(page);
  });
  test('auto-play with a result', async ({ page }) => {
    await page.goto('/#/play?strategy=expert&speed=instant');
    await page.getByTestId('auto-play').getByRole('button', { name: 'Run' }).click();
    await expect(page.getByTestId('auto-play-result')).toBeVisible({ timeout: 30_000 });
    await clean(page);
  });
});
