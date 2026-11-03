import { expect, test } from '@playwright/test';

test('the skip link is the first Tab stop and moves focus to the content', async ({ page }) => {
  await page.goto('/#/');
  await page.keyboard.press('Tab');
  const skip = page.locator('a.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  const box = await skip.boundingBox();
  expect(box, 'skip link has a box').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(page.url()).toMatch(/#\/$/);
});
