import { expect, test } from '@playwright/test';

test('a drill answer is graded and recorded', async ({ page }) => {
  await page.goto('/#/drill?street=river');
  await expect(page.getByTestId('drill-spot')).toBeVisible();
  await page.locator('.choice-row button').first().click();
  const res = page.getByTestId('drill-result');
  await expect(res).toBeVisible();
  const tier = await res.getAttribute('data-tier');
  expect(['best', 'close', 'small', 'costly', 'blunder']).toContain(tier);
  await expect(res).toContainText(/\d\.\d{3}|best play/i);
  await expect(page.getByRole('link', { name: 'See the chart' })).toBeVisible();
  const answered = await page.getByTestId('drill-stats').textContent();
  expect(answered).toMatch(/river\s*\d+%/);
});

// Drill "See the chart" lands on the matching section, not at the top of the page (I019).
for (const [width, height] of [
  [390, 844],
  [844, 390],
] as const) {
  for (const street of ['flop', 'river'] as const) {
    test(`See the chart lands on the ${street} section at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/#/drill?street=${street}`);
      await expect(page.getByTestId('drill-spot')).toBeVisible();
      await page.locator('.choice-row button').first().click();
      await expect(page.getByTestId('drill-result')).toBeVisible();
      await page.getByRole('link', { name: 'See the chart' }).click();
      await expect(page).toHaveURL(new RegExp(`view=${street}`));
      const heading = page.locator(`[data-view="${street}"] h2`);
      await expect(heading).toBeFocused();
      const box = await heading.boundingBox();
      expect(box, 'section heading has a box').not.toBeNull();
      expect(box!.y, 'heading top is inside the viewport').toBeGreaterThanOrEqual(0);
      expect(box!.y, 'heading top is inside the viewport').toBeLessThan(height);
    });
  }
}
