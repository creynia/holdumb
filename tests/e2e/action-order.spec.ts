// I012: the action bar keeps three fixed slots. Across betting -> preflop -> flop -> river ->
// settled the passive slot (Check / Fold / Clear / Change bets), the largest-bet edge and the
// whole action group stay put within 1px, and so does the landscape status bar.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '667x375', width: 667, height: 375 },
] as const;

type Box = { x: number; y: number; width: number; height: number };
interface Shot {
  state: string;
  passive: Box;
  largest: Box;
  group: Box;
  status: Box | null;
}

const PASSIVE: Record<string, string> = {
  betting: '[data-action="clear"]',
  preflop: '[data-option="check"]',
  flop: '[data-option="check"]',
  river: '[data-option="fold"]',
  settled: '[data-action="change-bets"]',
};
const LARGEST: Record<string, string> = {
  betting: '[data-action="deal"]',
  preflop: '[data-option="play-4"]',
  flop: '[data-option="play-2"]',
  river: '[data-option="play-1"]',
  settled: '[data-action="rebet"]',
};

async function box(l: Locator): Promise<Box> {
  await expect(l).toBeVisible();
  const b = await l.boundingBox();
  expect(b, 'element has a box').not.toBeNull();
  return b!;
}

async function street(page: Page, s: string) {
  await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', s, {
    timeout: 20_000,
  });
}

/** Acts on a decision: one tap, then the sheet's Confirm when the sheet asks for one. */
async function decide(page: Page, option: string, next: string, whileOpen?: () => Promise<void>) {
  await page.locator(`.sim-actions [data-option="${option}"]`).click();
  const sim = page.getByTestId('simulator');
  const confirm = page.getByTestId('confirm');
  // Today the sheet asks for Confirm; with one-tap acting (I013) the street just moves on.
  await expect(confirm.or(sim.and(page.locator(`[data-street="${next}"]`)))).toBeVisible();
  if (await confirm.isVisible()) {
    await whileOpen?.();
    await confirm.click();
  }
  await street(page, next);
}

async function measure(page: Page, state: string): Promise<Shot> {
  // Bounding boxes are viewport-relative: measure every state at scrollY 0.
  await page.evaluate(() => window.scrollTo(0, 0));
  const actions = page.locator('.sim-table .sim-actions');
  if (['preflop', 'flop', 'river'].includes(state))
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-ev', 'ready', {
      timeout: 20_000,
    });
  const status = page.locator('.sim-rail .sim-status');
  return {
    state,
    passive: await box(actions.locator(PASSIVE[state]!)),
    largest: await box(actions.locator(LARGEST[state]!)),
    group: await box(actions),
    status: (await status.count()) ? await box(status) : null,
  };
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1;

/** Fully inside the viewport at scrollY 0. */
async function onScreen(l: Locator, vp: { width: number; height: number }, what: string) {
  const b = await box(l);
  expect(b.y, `${what} top`).toBeGreaterThanOrEqual(0);
  expect(b.x, `${what} left`).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height, `${what} bottom`).toBeLessThanOrEqual(vp.height);
  expect(b.x + b.width, `${what} right`).toBeLessThanOrEqual(vp.width);
}

/**
 * The settled hand's outcome stays readable without scrolling (INVARIANTS): both hand names on the
 * felt, and the signed session net, now that the result toast sits below the bar.
 */
async function resultVisible(page: Page, vp: { width: number; height: number }) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const labels = page.locator('.sim-felt .sim-hand-label');
  await expect(labels).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(labels.nth(i)).not.toHaveText('');
    await onScreen(labels.nth(i), vp, `hand label ${i}`);
  }
  const net = page.getByTestId('session-net');
  await expect(net).toHaveText(/^([+\u2212]\$[\d,.]+|\$0)$/);
  await onScreen(net, vp, 'session net');
}

for (const vp of VIEWPORTS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`fixed action slots on every street at ${vp.name} ${scheme}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile', 'runs its own viewports');
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/#/play?seed=7&speed=instant');
      await street(page, 'betting');
      const landscape = vp.width > vp.height;

      const shots: Shot[] = [await measure(page, 'betting')];
      await page.locator('.sim-actions [data-action="deal"]').click();
      await street(page, 'preflop');
      shots.push(await measure(page, 'preflop'));
      // The open EV sheet (a modal in portrait, the rail body in landscape) moves no button and,
      // in landscape, leaves the status bar where it was.
      await decide(page, 'check', 'flop', async () => {
        shots.push({ ...(await measure(page, 'preflop')), state: 'preflop, sheet open' });
      });
      shots.push(await measure(page, 'flop'));
      await decide(page, 'check', 'river');
      shots.push(await measure(page, 'river'));
      await decide(page, 'play-1', 'settled');
      shots.push(await measure(page, 'settled'));
      await resultVisible(page, vp);
      // A fold settles with the fold reveal under the bar: still nothing moves.
      await page.locator('.sim-actions [data-action="rebet"]').click();
      await street(page, 'preflop');
      await decide(page, 'check', 'flop');
      await decide(page, 'check', 'river');
      await decide(page, 'fold', 'settled');
      shots.push({ ...(await measure(page, 'settled')), state: 'settled after a fold' });
      await resultVisible(page, vp);

      const [ref] = shots;
      for (const s of shots) {
        const where = `${s.state} vs ${ref!.state}`;
        for (const k of ['x', 'y', 'width', 'height'] as const) {
          expect(near(s.passive[k], ref!.passive[k]), `passive ${k} ${where}`).toBe(true);
          expect(near(s.group[k], ref!.group[k]), `group ${k} ${where}`).toBe(true);
        }
        if (landscape) {
          expect(near(s.largest.y, ref!.largest.y), `largest top ${where}`).toBe(true);
          expect(s.status, 'landscape status bar').not.toBeNull();
          expect(near(s.status!.y, ref!.status!.y), `status y ${where}`).toBe(true);
        } else {
          const right = (b: Box) => b.x + b.width;
          expect(near(right(s.largest), right(ref!.largest)), `largest right ${where}`).toBe(true);
        }
        // The passive action is the left slot in portrait and the bottom row in the rail.
        if (landscape) expect(s.passive.y).toBeGreaterThan(s.largest.y);
        else expect(s.passive.x).toBeLessThan(s.largest.x);
        expect(s.passive.height).toBeGreaterThanOrEqual(44);
        expect(s.largest.height).toBeGreaterThanOrEqual(44);
      }
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scroll).toBeLessThanOrEqual(vp.width);
    });
  }
}

test('Drill lists the choices in the table slot order (I012)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'one viewport is enough for the order');
  const want = {
    preflop: ['Check', 'Bet 3x', 'Bet 4x'],
    flop: ['Check', 'Bet 2x'],
    river: ['Fold', 'Bet 1x'],
  };
  for (const [s, labels] of Object.entries(want)) {
    await page.goto(`/#/drill?street=${s}`);
    await expect(page.getByTestId('drill-spot')).toHaveAttribute('data-street', s);
    await expect(page.locator('.choice-row button')).toHaveText(labels);
  }
});
