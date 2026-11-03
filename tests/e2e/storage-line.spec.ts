import { expect, test } from '@playwright/test';

// The storage line reserves its height while the check is pending, so the content below does
// not move when the answer arrives (I076). Measured at both portrait and landscape phone sizes.
for (const [width, height] of [
  [360, 740],
  [390, 844],
  [844, 390],
] as const) {
  test(`the storage line causes no layout shift at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/#/settings');
    const next = () =>
      page.evaluate(() => {
        const line = document.querySelector('[data-testid="storage-state"]');
        const below = line?.nextElementSibling ?? line?.parentElement?.nextElementSibling;
        return below ? below.getBoundingClientRect().top : null;
      });
    await expect(page.locator('[data-testid="storage-state"]')).toBeAttached();
    const before = await next();
    expect(before, 'a block below the storage line').not.toBeNull();
    await page.waitForTimeout(500);
    const after = await next();
    expect(Math.abs((after ?? 0) - (before ?? 0)), 'content below moved').toBeLessThanOrEqual(0.5);
  });
}
