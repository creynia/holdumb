import { expect, test } from '@playwright/test';

// Keep the service worker out of the way so route aborts reach the network layer (I039).
test.use({ serviceWorkers: 'block' });

test('a failed chunk load shows a retry, and Retry loads the page once the network is back', async ({
  page,
}) => {
  let blocked = true;
  await page.route(/\/assets\/Lesson-[^/]*\.js$/, (route) =>
    blocked ? route.abort('failed') : route.continue(),
  );
  await page.goto('/#/learn/welcome');
  const failed = page.getByTestId('route-failed');
  await expect(failed).toBeVisible();
  await expect(failed).toContainText("Couldn't load this page");
  const retry = failed.getByRole('button', { name: 'Retry' });
  const box = await retry.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  blocked = false;
  await retry.click();
  await expect(page.getByTestId('route-failed')).toHaveCount(0);
  await expect(page.locator('main h1').first()).toContainText('Welcome to the table');
});

test('a cold load of a lesson page works', async ({ page }) => {
  await page.goto('/#/learn/welcome');
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('.route-loading, .route-failed')).toHaveCount(0);
});
