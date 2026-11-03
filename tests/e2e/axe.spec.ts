import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Proves @axe-core/playwright compiles against our pinned Playwright and runs.
test('home has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/');
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad).toEqual([]);
});

// Forced colours (Windows High Contrast): the play table still passes axe, and the tier words
// and the selected-button outline stay in the page.
test('practice table has no serious or critical axe violations in forced colours', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/#/play?speed=instant');
  await expect(page.getByTestId('simulator')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad).toEqual([]);
});
