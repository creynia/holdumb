import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
];

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxes(page: Page, sel: string): Promise<Box[]> {
  return page.locator(sel).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

test.describe('update toast (I037)', () => {
  for (const vp of VIEWPORTS) {
    test(`never covers the table or ActionBar at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/#/play?seed=7&speed=instant');
      const felt = page.getByTestId('felt');
      await expect(felt).toBeVisible();
      await page.waitForFunction('!!window.__holdumb?.simulateUpdateAvailable');
      const barBefore = (await boxes(page, '[role="group"][aria-label="Actions"]'))[0]!;
      await page.evaluate('window.__holdumb.simulateUpdateAvailable()');
      const toast = page.locator('.toast');
      await expect(toast).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();

      const [t] = await boxes(page, '.toast');
      expect(t).toBeTruthy();
      const targets = [
        ...(await boxes(page, '[role="group"][aria-label="Actions"]')),
        ...(await boxes(page, '[data-circle]')),
        ...(await boxes(page, 'g.sim-card')),
      ];
      expect(targets.length).toBeGreaterThan(4);
      for (const b of targets) expect(overlaps(t!, b)).toBe(false);
      // It lives inside the top bar: the ActionBar and felt do not move by even 1px.
      const [bar] = await boxes(page, '[role="group"][aria-label="Actions"]');
      expect(Math.abs(bar!.y - barBefore.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(bar!.height - barBefore.height)).toBeLessThanOrEqual(1);
      const [top] = await boxes(page, '.topbar');
      expect(t!.y).toBeGreaterThanOrEqual(top!.y);
      expect(t!.y + t!.height).toBeLessThanOrEqual(top!.y + top!.height + 1);
      const [f] = await boxes(page, '[data-testid="felt"]');
      expect(overlaps(t!, f!)).toBe(false);
      // Reload stays a 44px target.
      const [btn] = await boxes(page, '.toast button');
      expect(btn!.height).toBeGreaterThanOrEqual(44);
      expect(btn!.width).toBeGreaterThanOrEqual(44);
      // Hit-test: the Deal / ActionBar centre still reaches the ActionBar.
      const hit = await page.evaluate(() => {
        const g = document.querySelector('[role="group"][aria-label="Actions"]')!;
        const r = g.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!el && g.contains(el);
      });
      expect(hit).toBe(true);
      // No horizontal scroll.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }

  test('Reload is safe mid-hand: the sandbox snapshot restores the hand', async ({ page }) => {
    await page.goto('/#/play?speed=instant');
    await page.locator('button[data-action="deal"]').click();
    const sim = page.getByTestId('simulator');
    await expect(sim).toHaveAttribute('data-street', 'preflop');
    const hole = await page.locator('g.sim-card:not(.sim-card-back)').allTextContents();
    expect(hole.length).toBe(2);
    // What the toast's Reload does after a worker swap is a full page reload; pagehide flushes.
    await page.evaluate('window.__holdumb.simulateUpdateAvailable()');
    await page.reload();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'preflop');
    expect(await page.locator('g.sim-card:not(.sim-card-back)').allTextContents()).toEqual(hole);
  });
});
