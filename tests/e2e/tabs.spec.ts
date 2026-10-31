import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Smoke: every tab at phone portrait and landscape. Runs once (mobile project); sets its own sizes.
const SIZES = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
  { name: 'narrow', width: 360, height: 740 },
];
const TABS = ['Learn', 'Play', 'Drill', 'More'];
const SCREENS = [
  '/',
  '/learn',
  '/play',
  '/drill',
  '/strategy',
  '/hands',
  '/bets',
  '/settings',
  '/sources',
  '/about',
  '/more',
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('every tab opens and nothing scrolls sideways', async ({ page }) => {
      test.skip(test.info().project.name !== 'mobile', 'viewport is set by this spec');
      await page.goto('/');
      // bottom tab bar on narrow screens, the same four links in the top nav from 768px
      const bar = page.locator('nav[aria-label="Tabs"]:visible, nav[aria-label="Main"]:visible');
      await expect(bar.getByRole('link')).toHaveText(TABS.map((t) => new RegExp(t)));
      for (const tab of TABS) {
        await bar.getByRole('link', { name: new RegExp(tab) }).click();
        await expect(page.locator('main#main')).toBeVisible();
        await expect(page.locator('main#main :is(h1, h2)').first()).toBeAttached();
        await expect(bar.getByRole('link', { name: new RegExp(tab) })).toHaveAttribute(
          'aria-current',
          'page',
        );
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      }
    });

    test('tap targets are at least 44px and no screen overflows', async ({ page }) => {
      test.skip(test.info().project.name !== 'mobile', 'viewport is set by this spec');
      for (const path of SCREENS) {
        await page.goto(`/#${path}`);
        await expect(page.locator('main#main')).toBeVisible();
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('a, button, select, input:not([type=hidden])')]
            .filter(
              (e) =>
                e.getClientRects().length > 0 &&
                // the 13x13 chart cannot have 44 px cells at 390 px (WCAG 2.5.8 asks 24 px)
                !e.closest('.prose, .sr, .sim-chart-grid') &&
                !(e.matches('a:not(.btn)') && e.closest('p')),
            )
            .map((e) => {
              // a checkbox/radio is tapped through its label
              const t = e.matches('[type=checkbox], [type=radio]') ? (e.closest('label') ?? e) : e;
              const r = t.getBoundingClientRect();
              return {
                t: (e.textContent || e.tagName).trim().slice(0, 30),
                h: r.height,
                w: r.width,
              };
            })
            .filter((r) => r.h < 43.5),
        );
        expect(small, `${path} small targets`).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} overflow`).toBeLessThanOrEqual(0);
      }
    });
  });
}

test('light and dark themes both render legibly', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/#/learn');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(scheme === 'dark' ? 'rgb(14, 22, 32)' : 'rgb(246, 244, 238)');
  }
});

test('axe: no serious issues on the main screens in both themes', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ['/', '/learn', '/drill', '/hands', '/bets', '/settings', '/about']) {
      await page.goto(`/#${path}`);
      await expect(page.locator('main#main')).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${scheme} ${path} ${v.id}`)).toEqual([]);
    }
  }
});
