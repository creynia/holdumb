// I049: the overlay invariant (INVARIANTS.md). No toast, hint, strip, prompt, bar or other fixed /
// sticky element may cover the Ante, Blind, Trips or Play circle, the player's hole cards, the
// dealer's cards or the board, on any street, at the four test viewports, light and dark. The EV
// sheet is the one exception (it may cover the felt while it is open and dismissible).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
] as const;

const sim = (page: Page) => page.getByTestId('simulator');
const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });

/** Act on an option: one tap, plus the confirm step (and "Do it anyway") if the sheet asks. */
async function act(page: Page, option: string) {
  await ready(page);
  const before = await sim(page).getAttribute('data-street');
  await page.locator(`button[data-option="${option}"]`).click();
  const confirm = page.getByTestId('confirm');
  for (let i = 0; i < 50; i++) {
    if ((await sim(page).getAttribute('data-street')) !== before) return;
    if (await confirm.isVisible()) await confirm.click();
    await page.waitForTimeout(100);
  }
  throw new Error(`acting on ${option} did not move the table`);
}

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Protected regions and overlay candidates, in viewport coordinates at the current scroll.
 * Overlays: the known hint / toast / bar classes plus every position:fixed or sticky element,
 * except the open EV sheet and any element that contains the felt (a sticky table wrapper).
 */
async function collect(
  page: Page,
  root: string,
): Promise<{ protectedBoxes: Box[]; overlays: Box[] }> {
  return page.evaluate((root) => {
    const table = document.querySelector(root);
    if (!table) throw new Error(`no table at ${root}`);
    const box = (el: Element, name: string): Box => {
      const r = el.getBoundingClientRect();
      return { name, x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const protectedBoxes: Box[] = [];
    table.querySelectorAll('[data-circle]').forEach((el) => {
      protectedBoxes.push(box(el, `circle:${el.getAttribute('data-circle')}`));
    });
    for (const id of ['felt-dealer', 'felt-board', 'felt-hole']) {
      const el = table.querySelector(`[data-testid="${id}"]`);
      if (el && el.childElementCount > 0) protectedBoxes.push(box(el, id));
    }
    const felt = table.querySelector('[data-testid="felt"]');
    const sheet = document.querySelector('[data-testid="ev-sheet"]');
    const overlays: Box[] = [];
    const seen = new Set<Element>();
    const add = (el: Element, name: string) => {
      if (seen.has(el)) return;
      if (sheet && (sheet === el || sheet.contains(el) || el.contains(sheet))) return;
      if (felt && el.contains(felt)) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none')
        return;
      seen.add(el);
      overlays.push(box(el, name));
    };
    for (const sel of [
      '.sim-toast',
      '[data-testid="step-hint"]',
      '.toast',
      '.tabbar',
      '.topbar',
      '[data-testid="fold-reveal"]',
    ])
      document.querySelectorAll(sel).forEach((el) => add(el, sel));
    document.querySelectorAll('body *').forEach((el) => {
      const p = getComputedStyle(el).position;
      if (p === 'fixed' || p === 'sticky')
        add(el, `${p}:${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
    });
    return { protectedBoxes, overlays };
  }, root);
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

async function assertNoCover(page: Page, scenario: string, need: string[], root: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const { protectedBoxes, overlays } = await collect(page, root);
  // The spec must find what it protects, or it would pass on an empty page.
  expect(
    protectedBoxes.filter((b) => b.name.startsWith('circle:')),
    `${scenario}: circles`,
  ).toHaveLength(4);
  for (const n of need)
    expect(
      protectedBoxes.some((b) => b.name === n),
      `${scenario}: ${n} present`,
    ).toBe(true);
  expect(overlays.length, `${scenario}: overlay candidates found`).toBeGreaterThan(0);
  const hits: string[] = [];
  for (const p of protectedBoxes)
    for (const o of overlays) {
      const a = overlap(p, o);
      if (a > 1) hits.push(`${o.name} covers ${p.name} (${Math.round(a)} px²)`);
    }
  expect(hits, `${scenario}: overlays on protected regions`).toEqual([]);
}

const DEALT = ['felt-dealer', 'felt-hole'];
const TABLE = '[data-testid="simulator"]';
const SCENARIOS: { name: string; root?: string; run: (page: Page) => Promise<string[]> }[] = [
  {
    name: 'fresh betting',
    run: async (page) => {
      await page.goto('/#/play?seed=7&speed=instant');
      await expect(sim(page)).toHaveAttribute('data-street', 'betting');
      return [];
    },
  },
  {
    name: 'preflop',
    run: async (page) => {
      await page.goto('/#/play?seed=7&hole=AsKd&speed=instant');
      await ready(page);
      return DEALT;
    },
  },
  {
    name: 'flop',
    run: async (page) => {
      await page.goto(
        '/#/play?seed=7&hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant',
      );
      await ready(page);
      return [...DEALT, 'felt-board'];
    },
  },
  {
    name: 'river',
    run: async (page) => {
      await page.goto(
        '/#/play?seed=7&hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant',
      );
      await ready(page);
      return [...DEALT, 'felt-board'];
    },
  },
  {
    name: 'settled win with its result toast',
    run: async (page) => {
      await page.goto(
        '/#/play?seed=7&hole=AsAd&board=AhKs7d2c9h&dealer=Kd5c&street=river&speed=instant',
      );
      await act(page, 'play-1');
      await expect(sim(page)).toHaveAttribute('data-street', 'settled');
      await expect(page.locator('.sim-toast')).toBeVisible();
      return [...DEALT, 'felt-board'];
    },
  },
  {
    name: 'settled fold with the fold reveal',
    run: async (page) => {
      await page.goto(
        '/#/play?seed=7&hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant',
      );
      await act(page, 'fold');
      await expect(page.getByTestId('fold-reveal')).toBeVisible();
      return [...DEALT, 'felt-board'];
    },
  },
  {
    name: 'EV sheet open (the one allowed cover; other overlays still checked)',
    run: async (page) => {
      // Confirm every bet, so a tap opens the sheet instead of acting.
      await page.goto('/#/settings');
      await page.getByRole('checkbox', { name: /Confirm my bets/ }).check();
      await page.getByRole('radio', { name: /^All bets/ }).check();
      await page.goto(
        '/#/play?seed=7&hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant',
      );
      await ready(page);
      await page.locator('button[data-option="play-2"]').click();
      await expect(page.getByTestId('ev-sheet')).toBeVisible();
      return [...DEALT, 'felt-board'];
    },
  },
  {
    name: 'update toast forced',
    run: async (page) => {
      await page.goto('/#/play?seed=7&hole=AsKd&speed=instant');
      await ready(page);
      await page.waitForFunction('!!window.__holdumb?.simulateUpdateAvailable');
      await page.evaluate('window.__holdumb.simulateUpdateAvailable()');
      await expect(page.getByTestId('update-toast')).toBeVisible();
      return DEALT;
    },
  },
  {
    name: 'lesson step hint',
    root: '.scene [data-testid="simulator"]',
    run: async (page) => {
      // The step hint shows after 20 s idle: a fake clock skips the wait (last scenario, so
      // nothing after it runs on the fake clock).
      await page.clock.install();
      // Lesson 07's first step deals A3o and has a hint ("Any ace is a 4x hand.").
      await page.goto('/#/learn/preflop-raise');
      const scene = page.locator('.scene').first();
      await scene.scrollIntoViewIfNeeded(); // scenes mount when they scroll into view
      await expect(scene.getByTestId('step-panel')).toContainText(/Hand 1/);
      await page.clock.runFor(21_000);
      await expect(scene.getByTestId('step-hint')).toBeVisible();
      // The lesson's own table is the one checked: scroll it to the top of the viewport.
      await scene.locator('[data-testid="felt"]').evaluate((el) => {
        window.scrollBy(0, el.getBoundingClientRect().top - 60);
      });
      return DEALT;
    },
  },
];

for (const vp of VIEWPORTS)
  for (const scheme of ['light', 'dark'] as const)
    test(`no overlay covers the table at ${vp.width}x${vp.height} ${scheme}`, async ({ page }) => {
      // One project runs the whole matrix: each test sets its viewport and colour scheme itself.
      test.skip(test.info().project.name !== 'mobile', 'runs in the mobile project');
      await page.setViewportSize(vp);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const s of SCENARIOS) {
        await test.step(s.name, async () => {
          const need = await s.run(page);
          await assertNoCover(page, s.name, need, s.root ?? TABLE);
        });
      }
    });
