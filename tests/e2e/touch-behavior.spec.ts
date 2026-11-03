import { expect, test } from '@playwright/test';

test('table controls use touch-action: manipulation; only /play contains overscroll', async ({
  page,
}) => {
  await page.goto('/#/play');
  const acts = page.locator('.sim-act');
  await expect(acts.first()).toBeAttached();
  const ta = await acts.evaluateAll((els) => els.map((e) => getComputedStyle(e).touchAction));
  expect(ta.length).toBeGreaterThan(0);
  for (const v of ta) expect(v).toBe('manipulation');
  expect(
    await page.locator('.sim-container').evaluate((e) => getComputedStyle(e).touchAction),
  ).toBe('manipulation');
  const oy = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);
  expect(await oy()).toBe('contain');
  await page.goto('/#/learn');
  await expect.poll(oy).toBe('auto');
});
