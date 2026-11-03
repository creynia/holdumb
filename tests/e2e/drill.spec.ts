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
      // scroll-margin-top (8px+) took effect: the heading is not flush with the top edge
      expect(box!.y, 'scroll margin keeps the heading below the top edge').toBeGreaterThanOrEqual(
        8,
      );
      expect(box!.y, 'heading top is inside the viewport').toBeLessThan(height);
    });
  }
}

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
    // the lens toggle lives in the same picker block, below the buttons
    const lens = (await page.getByTestId('drill-lens').boundingBox())!;
    expect(lens.y).toBeGreaterThan(plain);
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

// I015: the category label must not move the cards or the choice row (it sits in the card padding).
for (const vp of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`the category label adds no space above the choices at ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/drill?street=flop');
    await expect(page.getByTestId('drill-spot')).toBeVisible();
    const label = page.getByTestId('drill-category-label');
    await expect(label).toBeVisible();
    const rowWith = (await page.locator('.choice-row').boundingBox())!;
    const cardsWith = (await page.locator('.drill-cards').boundingBox())!;
    const spotWith = (await page.getByTestId('drill-spot').boundingBox())!;
    const lb = (await label.boundingBox())!;
    // inside the card, above the cards, not overlapping them
    expect(lb.y).toBeGreaterThanOrEqual(spotWith.y);
    expect(lb.y + lb.height).toBeLessThanOrEqual(cardsWith.y);
    await label.evaluate((e) => ((e as HTMLElement).style.display = 'none'));
    const rowWithout = (await page.locator('.choice-row').boundingBox())!;
    const cardsWithout = (await page.locator('.drill-cards').boundingBox())!;
    expect(Math.abs(rowWith.y - rowWithout.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(cardsWith.y - cardsWithout.y)).toBeLessThanOrEqual(1);
    // the choices stay on screen where main had them
    expect(rowWith.y + rowWith.height).toBeLessThanOrEqual(vp.height);
  });
}
