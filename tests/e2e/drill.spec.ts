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
  // The read-only result sheet carries the lesson 12 facts, basic card included (I057).
  const outs = res.getByTestId('dealer-outs');
  await expect(outs).toHaveAttribute('data-mode', 'after');
  await expect(outs).toContainText(/Dealer outs: \d+ of 45/);
  await expect(outs).toContainText(/Hidden pair or better: (yes|no)/);
  await expect(res.getByTestId('basic-river')).toContainText(/Basic card: (bet 1x|fold)/);
  await expect(page.getByRole('link', { name: 'See the chart' })).toBeVisible();
  const answered = await page.getByTestId('drill-stats').textContent();
  expect(answered).toMatch(/river\s*\d+%/);
});
