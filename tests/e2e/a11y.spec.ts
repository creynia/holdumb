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
      if (evMode !== 'never') await ready(page);
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
