import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Settings: Show EV and Confirm bets (D40, I091). Axe is clean, and every control row is a
// 44px tap target, including the greyed-out Which bets radios.
test('settings has no serious or critical axe violations, with Which bets disabled', async ({
  page,
}) => {
  await page.goto('/#/settings');
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad).toEqual([]);
});

test('every Show EV, confirm and scope row is at least 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/#/settings');
  const rows = page.locator('fieldset.radios label.radio, .check-row label.check');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(6);
  for (let i = 0; i < n; i++) {
    const box = await rows.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
