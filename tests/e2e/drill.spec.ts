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

for (const vp of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`the category picker never moves the action buttons at ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    const rowY = async (hash: string) => {
      await page.goto(`/#/drill${hash}`);
      await expect(page.getByTestId('drill-spot')).toBeVisible();
      return (await page.locator('.choice-row').boundingBox())!.y;
    };
    const plain = await rowY('?street=flop');
    const withCat = await rowY('?street=flop&category=flop-flush-draw');
    expect(Math.abs(withCat - plain)).toBeLessThanOrEqual(1);
    // the picker sits below the action buttons, so it cannot push them
    const sel = (await page.getByTestId('drill-categories').boundingBox())!;
    expect(sel.y).toBeGreaterThan(plain);
    // Mixed has the same stack above the spot card as every street (no picker row)
    await page.goto('/#/drill');
    await expect(page.getByTestId('drill-spot')).toBeVisible();
    const card = (await page.getByTestId('drill-spot').boundingBox())!;
    await page.goto('/#/drill?street=flop');
    await expect(page.getByTestId('drill-spot')).toBeVisible();
    const card2 = (await page.getByTestId('drill-spot').boundingBox())!;
    expect(Math.abs(card.y - card2.y)).toBeLessThanOrEqual(1);
  });
}
