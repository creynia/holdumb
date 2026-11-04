// I069: Learn's "Your skills" follows Drill answers.
import { expect, test } from '@playwright/test';

for (const vp of [
  { width: 360, height: 740 },
  { width: 844, height: 390 },
]) {
  test(`Drill answers move a skill from Not started to a status with links at ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/learn');
    const flop = page.locator('[data-skill="flop"]');
    await expect(flop).toContainText('Not started');
    await expect(flop.getByRole('link', { name: 'Practise in Drill' })).toBeVisible();
    // five answers in one flop category
    await page.goto('/#/drill?category=flop-nothing');
    for (let i = 0; i < 5; i++) {
      await expect(page.getByTestId('drill-spot')).toBeVisible();
      await page.locator('.choice-row button').first().click();
      await expect(page.getByTestId('drill-result')).toBeVisible();
      await page.getByRole('button', { name: 'Next hand' }).click();
    }
    await page.goto('/#/learn');
    await expect(flop).not.toContainText('Not started');
    await expect(flop).toContainText(/Practising|Solid/);
    await expect(flop).toContainText(/% of your last 5/);
    // no horizontal scroll, and the links are real tap targets
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      vp.width,
    );
    for (const l of await page.locator('.skill-links a').all()) {
      expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
}
