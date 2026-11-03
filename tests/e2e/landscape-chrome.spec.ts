import { expect, test } from '@playwright/test';
import { seedSettings } from './settings-seed';

// I030: in short landscape the shell shows one 44px top bar (no bottom tab bar) and the whole
// table fits the viewport at scrollY 0, with nothing fixed on top of it.
const VIEWPORTS = [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
] as const;
const STREETS = [
  'street=preflop&hole=AhTc&dealer=9d9s',
  'street=flop&hole=AhTc&board=7dKs2c&dealer=9d9s',
  'street=river&hole=AhTc&board=7dKs2c4h9c&dealer=9d9s',
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`short landscape ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('one 44px bar, no bottom tab bar, nav targets stay 44px', async ({ page }) => {
      await page.goto('/#/play?speed=instant');
      await expect(page.getByTestId('felt')).toBeVisible();
      await expect(page.locator('.tabbar')).toBeHidden();
      const bar = (await page.locator('.topbar').boundingBox())!;
      expect(bar.y).toBe(0);
      expect(bar.height).toBeLessThanOrEqual(44);
      for (const a of await page.locator('.topnav a').all()) {
        expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      // Every route reaches the others through the top nav (the tab bar is gone).
      await page.locator('.topnav').getByRole('link', { name: 'Drill' }).click();
      await expect(page).toHaveURL(/#\/drill/);
      await expect(page.locator('.tabbar')).toBeHidden();
    });

    for (const q of STREETS) {
      test(`the felt is fully visible and unobstructed (${q.split('&')[0]})`, async ({ page }) => {
        await page.goto(`/#/play?${q}&speed=instant`);
        const felt = page.locator('svg.sim-felt');
        await expect(felt).toBeVisible();
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        const box = (await felt.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(44);
        expect(box.y + box.height, 'felt bottom inside the viewport').toBeLessThanOrEqual(
          vp.height,
        );
        // Hit-test a grid of points over the felt: each must land inside the felt, so neither
        // the top bar nor a tab bar covers any card or circle.
        const bad = await page.evaluate(
          ({ x, y, w, h }) => {
            const out: string[] = [];
            for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95])
              for (const fy of [0.03, 0.25, 0.5, 0.75, 0.97]) {
                const px = x + w * fx;
                const py = y + h * fy;
                const el = document.elementFromPoint(px, py);
                if (!el?.closest('svg.sim-felt')) out.push(`${px},${py}:${el?.className}`);
              }
            return out;
          },
          { x: box.x, y: box.y, w: box.width, h: box.height },
        );
        expect(bad).toEqual([]);
      });
    }

    test('the EV sheet keeps Confirm and Cancel on screen without page scroll', async ({
      page,
    }) => {
      // One tap acts by default (D40); confirmOn 'all' makes the tap open the confirm sheet.
      await seedSettings(page, { confirmOn: 'all' });
      await page.goto('/#/play?street=flop&hole=AhTc&board=7dKs2c&dealer=9d9s&speed=instant');
      await expect(page.getByTestId('felt')).toBeVisible();
      await page.locator('.sim-rail-actions button').filter({ hasText: 'Check' }).click();
      const confirm = page.getByTestId('confirm');
      await expect(confirm).toBeVisible();
      for (const b of [confirm, page.getByRole('button', { name: 'Cancel' })]) {
        const box = (await b.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  });
}
