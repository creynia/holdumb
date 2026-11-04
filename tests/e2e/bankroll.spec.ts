import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });
const opt = (page: Page, k: string) => page.locator(`button[data-option="${k}"]`);
/** One tap acts with the default confirm policy (D40). */
const pick = async (page: Page, k: string) => {
  await opt(page, k).click();
};

test.describe('bankroll control (I083)', () => {
  test('bust a $10 session, top up, and play on without losing the stats', async ({ page }) => {
    await page.goto('/#/play?speed=instant');
    const sim = page.getByTestId('simulator');
    await page.getByTestId('new-session').click();
    await page.getByTestId('bankroll-custom').fill('10');
    await page.getByTestId('bankroll-confirm').click();
    // $5 Ante + $5 Blind are already on the felt, so the rack shows $0 of the $10.
    await expect(sim).toHaveAttribute('data-equity', '1000');
    await expect(page.getByTestId('new-session')).toContainText('$10');
    // The chosen amount is now the default bankroll in Settings.
    await page.reload();
    await expect(page.getByTestId('new-session')).toContainText('$10');

    // $5 ante + $5 blind empties the rack; check, check, fold loses both.
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    await pick(page, 'check');
    await ready(page);
    await pick(page, 'check');
    await ready(page);
    await page.locator('button[data-option="fold"]').click();
    await expect(sim).toHaveAttribute('data-street', 'settled');
    await expect(sim).toHaveAttribute('data-equity', '0');
    await expect(page.getByTestId('rack-short')).toBeVisible();

    // The rebet is refused until the rack is topped up.
    const before = await sim.getAttribute('data-hands');
    await page.getByTestId('top-up').click();
    await page.locator('[data-preset="100"]').click();
    await page.getByTestId('bankroll-confirm').click();
    await expect(page.getByTestId('bankroll')).toHaveText('$100');
    await expect(page.getByTestId('rack-short')).toHaveCount(0);
    await expect(page.getByTestId('session-net')).toHaveText(/^−\u2060?\$10$/);
    await expect(sim).toHaveAttribute('data-hands', before ?? '1');
    await page.getByTestId('session-toggle').click();
    await expect(page.getByTestId('session-topups')).toHaveText('$100');
    await expect(page.getByTestId('session-net-detail')).toHaveText(/^−\u2060?\$10$/);

    // Play on.
    await page.getByRole('button', { name: /Rebet/ }).click();
    await expect(sim).toHaveAttribute('data-street', 'preflop');
  });

  test('Settings > Default bankroll matches what New session chose', async ({ page }) => {
    await page.goto('/#/play');
    await page.getByTestId('new-session').click();
    await page.locator('[data-preset="250"]').click();
    await page.getByTestId('bankroll-confirm').click();
    await page.goto('/#/settings');
    await expect(page.getByLabel('Default bankroll ($)')).toHaveValue('250');
  });

  test('the chooser opens inside the viewport on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/#/play?speed=instant');
    await page.getByTestId('new-session').click();
    const picker = page.getByTestId('bankroll-picker');
    await expect(picker).toBeVisible();
    await expect(page.locator('[data-preset="100"]')).toBeFocused();
    await expect(page.locator('[data-preset="100"]')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('bankroll-confirm')).toBeInViewport();
  });
});
