import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// I029: the Play table fits its vertical budget. At scrollY 0, on every street, the ActionBar sits
// at least 8px above the fixed tab bar and the whole felt is on screen above the bar.
const VIEWPORTS = [
  [360, 740],
  [390, 844],
  [844, 390],
  [667, 375],
] as const;

type Box = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};
const box = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  }, sel) as Promise<Box | null>;

/** The felt as drawn: the SVG keeps its aspect ratio inside its box. */
const drawnFeltWidth = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('svg.sim-felt')!;
    const vb = svg.viewBox.baseVal;
    const r = svg.getBoundingClientRect();
    return Math.min(r.width, (r.height * vb.width) / vb.height);
  });

async function check(page: Page, street: string, w: number, h: number) {
  const where = `${w}x${h} ${street}`;
  expect(await page.evaluate(() => scrollY), where).toBe(0);
  const act = await box(page, '.sim-actions');
  const felt = await box(page, 'svg.sim-felt');
  const tab = await box(page, '.tabbar');
  const top = await box(page, '.topbar');
  expect(act, `${where}: action bar`).not.toBeNull();
  expect(felt, `${where}: felt`).not.toBeNull();
  // The bar is fully on screen, below the top bar.
  expect(act!.top, `${where}: bar top`).toBeGreaterThanOrEqual(top!.bottom);
  expect(act!.bottom, `${where}: bar bottom`).toBeLessThanOrEqual(h);
  // ... and at least 8px above the tab bar (hidden at >= 768px wide).
  if (tab) expect(act!.bottom, `${where}: bar vs tab bar`).toBeLessThanOrEqual(tab.top - 8);
  if (w < h) {
    // Portrait: the whole felt is on screen above the bar, and at least 300px wide as drawn.
    expect(felt!.top, `${where}: felt top`).toBeGreaterThanOrEqual(top!.bottom);
    expect(felt!.bottom, `${where}: felt bottom`).toBeLessThanOrEqual(act!.top);
    expect(await drawnFeltWidth(page), `${where}: felt width`).toBeGreaterThanOrEqual(300);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    `${where}: h-scroll`,
  ).toBeLessThanOrEqual(w);
}

for (const [w, h] of VIEWPORTS) {
  test(`Play fits ${w}x${h}: the action bar clears the tab bar on every street`, async ({
    browser,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'sets its own viewports');
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('/#/play?speed=instant&seed=3');
    const sim = page.getByTestId('simulator');
    await expect(sim).toHaveAttribute('data-street', 'betting');
    await check(page, 'betting', w, h);
    await page.getByRole('button', { name: /^Deal/ }).click();
    await expect(sim).toHaveAttribute('data-street', 'preflop');
    await check(page, 'preflop', w, h);
    for (const [k, next] of [
      ['check', 'flop'],
      ['check', 'river'],
      ['fold', 'settled'],
    ] as const) {
      await page.locator(`button[data-option="${k}"]`).click();
      await page.getByTestId('confirm').click();
      const anyway = page.getByRole('button', { name: 'Do it anyway' });
      if (await anyway.isVisible().catch(() => false)) await anyway.click();
      await expect(sim).toHaveAttribute('data-street', next);
      await page.keyboard.press('Escape');
      await page.evaluate(() => scrollTo(0, 0));
      await check(page, next, w, h);
    }
    await page.close();
  });
}
