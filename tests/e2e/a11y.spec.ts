import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedSettings } from './settings-seed';

const lessonIds: string[] = (
  JSON.parse(readFileSync('content/chapters.json', 'utf8')) as { lessons: string[] }[]
).flatMap((c) => c.lessons);

async function clean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(bad).toEqual([]);
}
const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });

test.describe('axe: no serious or critical issues', () => {
  // The confirm sheet in every EV mode (D40): the tap opens it because confirmOn is 'all'.
  for (const evMode of ['before', 'after', 'never'] as const)
    test(`sandbox betting, a decision and the confirm sheet (evMode ${evMode})`, async ({
      page,
    }) => {
      await seedSettings(page, { confirmOn: 'all', evMode });
      await page.goto('/#/play?seed=7&speed=instant');
      await clean(page);
      await page.locator('button[data-action="deal"]').click();
      await ready(page); // also past the double-tap guard after Deal (D40)
      await clean(page);
      await page.locator('button[data-option="check"]').click();
      await expect(page.getByTestId('ev-sheet')).toBeVisible();
      await expect(page.getByTestId('confirm')).toBeVisible();
      await clean(page);
    });
  test('a lesson scene', async ({ page }) => {
    await page.goto('/#/learn/a-full-hand');
    await page.locator('.scene').first().scrollIntoViewIfNeeded();
    await expect(page.getByTestId('step-panel').first()).toBeVisible();
    await clean(page);
  });
  test('drill with a graded answer', async ({ page }) => {
    await page.goto('/#/drill?street=flop');
    await page.locator('.choice-row button').first().click();
    await expect(page.getByTestId('drill-result')).toBeVisible();
    await clean(page);
  });
  test('auto-play with a result', async ({ page }) => {
    await page.goto('/#/play?strategy=expert&speed=instant');
    await page.getByTestId('auto-play').getByRole('button', { name: 'Run' }).click();
    await expect(page.getByTestId('auto-play-result')).toBeVisible({ timeout: 30_000 });
    await clean(page);
  });
});

test.describe('axe: every lesson', () => {
  test.describe.configure({ timeout: 60_000 });
  for (const id of lessonIds) {
    test(`lesson ${id}`, async ({ page }) => {
      await page.goto(`/#/learn/${id}`);
      await expect(page.locator('h1').first()).toBeVisible();
      await clean(page);
    });
  }
});

// I033: every visible control is at least 44x44 CSS px (chart cells 24).
const TARGET_SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
];
for (const size of TARGET_SIZES) {
  test.describe(`tap targets ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });
    for (const path of ['/play', '/settings', `/learn/${lessonIds[0]}`]) {
      test(`${path} controls are at least 44px`, async ({ page }) => {
        test.skip(test.info().project.name !== 'mobile', 'viewport is set by this spec');
        await page.goto(`/#${path}`);
        await expect(page.locator('main#main')).toBeVisible();
        if (path === '/play') await page.locator('details.sim-autoplay').waitFor();
        const small = await page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLElement>(
              'button, a, summary, input[type=checkbox], input[type=radio], select',
            ),
          ]
            .filter(
              (e) =>
                e.getClientRects().length > 0 &&
                e.getBoundingClientRect().width > 0 &&
                !e.closest('.sr, [hidden]') &&
                !(e.matches('a:not(.btn)') && e.closest('p, li, .prose')),
            )
            .map((e) => {
              const t = e.matches('[type=checkbox], [type=radio]') ? (e.closest('label') ?? e) : e;
              const r = t.getBoundingClientRect();
              const min = e.closest('.sim-chart-grid') ? 24 : 44;
              return {
                t: (e.textContent || e.tagName).trim().slice(0, 30),
                w: r.width,
                h: r.height,
                min,
              };
            })
            .filter((r) => r.w < r.min - 0.5 || r.h < r.min - 0.5),
        );
        expect(small, `${path} small targets`).toEqual([]);
      });
    }
  });
}

// I053: large text. With the root font at 200% (Android / iOS large-text settings), the Play table
// still fits: no horizontal scroll, no text clipped across inside an ActionBar button, the bar fully
// on screen at scrollY 0 and above the tab bar on every street; Settings and Drill do not scroll
// sideways either.
test.describe('text zoom 200%', () => {
  // Plus 5% letter spacing: CI's fonts run a little wider than local ones, and a fit that only
  // holds to the pixel here would scroll sideways there.
  const ZOOM = 'html { font-size: 200% !important; } * { letter-spacing: 0.05em !important; }';
  for (const [w, h] of [
    [360, 740],
    [390, 844],
  ] as const) {
    test(`${w}x${h}: table, Settings and Drill at 200% text`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'mobile', 'sets its own viewports');
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const zoom = () => page.addStyleTag({ content: ZOOM });
      const noHScroll = async (where: string) =>
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${where}: horizontal scroll`,
        ).toBeLessThanOrEqual(w);
      const bar = async (where: string) => {
        await page.evaluate(() => scrollTo(0, 0));
        const m = await page.evaluate(() => {
          const r = (s: string) => document.querySelector(s)?.getBoundingClientRect() ?? null;
          const clipped = [...document.querySelectorAll<HTMLElement>('.sim-act, .sim-act *')]
            .filter((e) => e.scrollWidth > e.clientWidth + 1)
            .map((e) => `${e.className}: ${e.textContent}`);
          return { act: r('.sim-actions'), tab: r('.tabbar'), clipped };
        });
        expect(m.clipped, `${where}: clipped labels`).toEqual([]);
        expect(m.act!.top, `${where}: bar top`).toBeGreaterThanOrEqual(0);
        expect(m.act!.bottom, `${where}: bar on screen`).toBeLessThanOrEqual(h);
        if (m.tab) expect(m.act!.bottom, `${where}: bar vs tab bar`).toBeLessThanOrEqual(m.tab.top);
        await noHScroll(where);
        return m.act!;
      };
      // HTML controls and the felt's circles stay 44px targets: at large text the felt keeps the
      // full table width and scrolls inside its own region (I053 ruling) instead of shrinking.
      const targets = async (where: string) => {
        const m = await page.evaluate(() => {
          const box = (e: Element) => {
            const r = e.getBoundingClientRect();
            return { w: r.width, h: r.height };
          };
          const svg = document.querySelector<SVGSVGElement>('svg.sim-felt')!;
          const r = svg.getBoundingClientRect();
          const region = svg.closest<HTMLElement>('.sim-table-felt')!;
          return {
            controls: [...document.querySelectorAll('.sim-actions button, .sim-options label')]
              .filter((e) => e.getClientRects().length > 0)
              .map(box),
            circles: [...document.querySelectorAll('[data-hit]')].map(box),
            felt: r.width,
            scrolls: region.scrollHeight > region.clientHeight,
            pageY: scrollY,
          };
        });
        for (const c of m.controls) {
          expect(c.w, `${where}: control width`).toBeGreaterThanOrEqual(44);
          expect(c.h, `${where}: control height`).toBeGreaterThanOrEqual(44);
        }
        expect(m.circles.length, `${where}: circles`).toBeGreaterThan(0);
        for (const c of m.circles)
          expect(Math.min(c.w, c.h), `${where}: circle`).toBeGreaterThanOrEqual(44);
        // Full width: the viewport minus the 24px page + table gutters each side.
        expect(m.felt, `${where}: felt width`).toBeGreaterThanOrEqual(w - 48 - 1);
        expect(m.scrolls, `${where}: the felt region scrolls`).toBe(true);
        expect(m.pageY, `${where}: the page did not scroll`).toBe(0);
        // Scrolling the felt region (only it) brings the dealer's cards and the board into view.
        const seen = await page.evaluate(() => {
          const region = document.querySelector<HTMLElement>('.sim-table-felt')!;
          const before = region.scrollTop;
          region.scrollTop = 0;
          const top = region.getBoundingClientRect().top;
          const label = [...document.querySelectorAll('.sim-felt .sim-hand-label')].find((e) =>
            (e.textContent ?? '').startsWith('Dealer'),
          );
          const ok = !!label && label.getBoundingClientRect().top >= top - 1;
          region.scrollTop = before;
          return ok && scrollY === 0;
        });
        expect(seen, `${where}: dealer in view after scrolling the felt`).toBe(true);
      };
      await page.goto('/#/play?seed=3&speed=instant');
      await zoom();
      const sim = page.getByTestId('simulator');
      await expect(sim).toHaveAttribute('data-street', 'betting');
      const first = await bar('betting');
      await targets('betting');
      await page.locator('button[data-action="deal"]').click();
      await expect(sim).toHaveAttribute('data-street', 'preflop');
      await expect(sim).toHaveAttribute('data-ev', 'ready', { timeout: 20_000 });
      // The bar keeps its box between states at large text too.
      const pre = await bar('preflop');
      expect(Math.abs(pre.top - first.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(pre.height - first.height)).toBeLessThanOrEqual(1);
      await targets('preflop');
      // Check to the flop and the river (one tap acts, D40): the bar keeps its box on every street.
      for (const next of ['flop', 'river'] as const) {
        await page.locator('.sim-actions button[data-option="check"]').click();
        await expect(sim).toHaveAttribute('data-street', next);
        await expect(sim).toHaveAttribute('data-ev', 'ready', { timeout: 20_000 });
        const b = await bar(next);
        expect(Math.abs(b.top - first.top), `${next}: bar top`).toBeLessThanOrEqual(1);
        expect(Math.abs(b.height - first.height), `${next}: bar height`).toBeLessThanOrEqual(1);
        await targets(next);
      }
      await page.goto('/#/settings');
      await zoom();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await noHScroll('settings');
      await page.goto('/#/drill?street=flop');
      await zoom();
      await expect(page.getByTestId('drill-spot')).toBeVisible();
      await noHScroll('drill');
      // The graded result (EV rows, links row) must fit too.
      await page.locator('.choice-row button').first().click();
      await expect(page.getByTestId('drill-result')).toBeVisible();
      await noHScroll('drill result');
      await page.close();
    });
  }
});
