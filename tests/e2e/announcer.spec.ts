import { expect, test } from '@playwright/test';

const LIVE = '[aria-live],[role=status],[role=log],[role=alert]';
const ROUTES = ['/play?speed=instant', '/learn/welcome', '/drill', '/strategy', '/settings', '/'];

test.describe('one live region (I036)', () => {
  for (const r of ROUTES) {
    test(`at most one polite and one assertive region on ${r}`, async ({ page }) => {
      await page.goto(`/#${r}`);
      await expect(page.locator('main h1').first()).toBeAttached();
      await expect(page.getByTestId('announcer')).toBeAttached();
      expect(await page.locator(LIVE).count()).toBe(2);
      expect(await page.locator('[aria-live=polite]').count()).toBe(1);
      expect(await page.locator('[aria-live=assertive]').count()).toBe(1);
    });
  }

  test('the update notice and a dealt hand are spoken by the same region, still two in total', async ({
    page,
  }) => {
    await page.goto('/#/play?seed=7&speed=instant');
    await page.waitForFunction('!!window.__holdumb?.simulateUpdateAvailable');
    await page.evaluate('window.__holdumb.simulateUpdateAvailable()');
    await page.locator('button[data-action="deal"]').click();
    const polite = page.locator('[aria-live=polite]');
    await expect(polite).toContainText(/Update available|Your cards/);
    expect(await page.locator(LIVE).count()).toBe(2);
  });
});
