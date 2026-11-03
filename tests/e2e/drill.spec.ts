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

test('the grading lens toggle persists across a reload', async ({ page }) => {
  await page.goto('/#/drill?street=river');
  const basic = page.getByTestId('drill-lens').getByRole('button', { name: 'Basic card' });
  await expect(basic).toHaveAttribute('aria-pressed', 'false');
  await basic.click();
  await expect(basic).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(basic).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.choice-row button').first().click();
  await expect(page.getByTestId('drill-result')).toBeVisible();
});
