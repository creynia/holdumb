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

test('a category deals only that category and the select is tappable', async ({ page }) => {
  await page.goto('/#/drill?street=flop');
  const sel = page.getByTestId('drill-categories');
  await expect(sel).toBeVisible();
  expect((await sel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('drill-spot')).toBeVisible();
  await sel.selectOption({ label: 'Flop flush draws' });
  await expect(page).toHaveURL(/street=flop&category=flop-flush-draw/);
  await expect(sel).toHaveValue('flop-flush-draw');
  await expect(page.getByTestId('drill-spot')).toBeVisible();
  await sel.selectOption({ label: 'All' });
  await expect(page).not.toHaveURL(/category=/);
});
