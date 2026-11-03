import { expect, test } from '@playwright/test';

test('home renders a visible h1 and the title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page).toHaveTitle(/^Ultimate Texas Hold'em.*\| holdumb$/);
});

test('a tab-bar navigation changes the document title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/\| holdumb$/);
  await page
    .locator('nav[aria-label="Tabs"]:visible, nav[aria-label="Main"]:visible')
    .getByRole('link', { name: /Play/ })
    .click();
  await expect(page).toHaveTitle('Practice table · holdumb');
});

test('no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
