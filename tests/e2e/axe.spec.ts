import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Proves @axe-core/playwright compiles against our pinned Playwright and runs.
test('home has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/');
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad).toEqual([]);
});
