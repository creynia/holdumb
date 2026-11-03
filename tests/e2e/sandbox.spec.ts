import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });
const opt = (page: Page, k: string) => page.locator(`button[data-option="${k}"]`);

test.describe('sandbox', () => {
  test('a full hand from betting: chips, deal, EV before confirming, result', async ({ page }) => {
    await page.goto('/#/play?seed=7&speed=instant');
    const sim = page.getByTestId('simulator');
    // Clear leaves the $5 minimum; one more $5 chip on Ante makes $10 and the Blind mirrors it.
    await page.getByRole('button', { name: /^Clear/ }).click();
    await page.locator('button[data-chip="500"]').click();
    await page.locator('[data-hit="ante"]').click();
    await expect(page.locator('[data-circle="ante"]')).toContainText('$10');
    await expect(page.locator('[data-circle="blind"]')).toContainText('$10');
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    await expect(page.locator('g.sim-card:not(.sim-card-back)')).toHaveCount(2);
    // Preview first: the EV is visible before anything is confirmed.
    await opt(page, 'play-4').click();
    const sheet = page.getByTestId('ev-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(/exact/i);
    await expect(sheet).toContainText(/\$\d/);
    await expect(sim).toHaveAttribute('data-street', 'preflop');
    await page.getByTestId('confirm').click();
    await expect(sim).toHaveAttribute('data-street', 'settled');
    await expect(page.locator('.sim-toast')).toContainText(/Net/);
    expect(Number(await sim.getAttribute('data-equity'))).not.toBe(50_000);
    await expect(page.getByRole('button', { name: /Rebet/ })).toBeVisible();
  });

  test('a preset flop hand shows both options, one best badge, and plays on', async ({ page }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await expect(page.locator('button[data-option].is-best')).toHaveCount(1);
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('ev-sheet')).toContainText(/Best play|mistake/i);
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
  });

  test('the flop sheet names the basic-card rule and whether perfect agrees (I058)', async ({
    page,
  }) => {
    await page.goto('/#/play?hole=9s7d&board=9hKc2s&dealer=QdJd&street=flop&speed=instant');
    await ready(page);
    await opt(page, 'play-2').click();
    const line = page.getByTestId('flop-rule');
    await expect(line).toContainText('Basic card: rule (b), a hidden pair of nines: Bet 2x.');
    await expect(line).toContainText(/Perfect play (agrees|prefers Check)/);
  });

  test('with "After I choose" the rule line appears only after the move (I058)', async ({
    page,
  }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: 'After I choose' }).check();
    await page.goto('/#/play?hole=9s7d&board=9hKc2s&dealer=QdJd&street=flop&speed=instant');
    await ready(page);
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('ev-sheet')).toBeVisible();
    await expect(page.getByTestId('flop-rule')).toHaveCount(0);
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('flop-rule')).toContainText('Basic card: rule (b)');
  });

  test('by default a blunder acts on Confirm with no second tap (D39)', async ({ page }) => {
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await ready(page);
    await opt(page, 'check').click();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
    await expect(page.getByTestId('blunder-warning')).toHaveCount(0);
  });

  test('after Check the toast names the tier and the same cost as the EV sheet (I080)', async ({
    page,
  }) => {
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await ready(page);
    await opt(page, 'check').click();
    const sheetCost = (await page.getByTestId('cost-vs-best').textContent())!.match(
      /Costs (\S+) against/,
    )![1]!;
    expect(sheetCost).toMatch(/^\$/);
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
    const toast = page.locator('.sim-toast');
    await expect(toast).toContainText('Check: a big mistake');
    await expect(toast).toContainText(`costs ${sheetCost} against Bet 4x`);
    await expect(toast).toContainText('Whole-hand expected result from here');
  });

  for (const vp of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 360, height: 740 },
    { width: 667, height: 375 },
  ]) {
    test(`the narration toast never moves the action bar or the felt at ${vp.width}x${vp.height} (I080)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
      await ready(page);
      await opt(page, 'check').click();
      await page.getByTestId('confirm').click();
      await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
      const toast = page.locator('.sim-toast');
      await expect(toast).toContainText('Whole-hand expected result from here');
      // Page coordinates: dismissing the toast may shorten the page and change the scroll offset.
      const boxes = async () => {
        const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
        const sel: Record<string, string> = {
          check: 'button[data-option="check"]',
          'play-2': 'button[data-option="play-2"]',
          felt: '.sim-felt',
        };
        for (const [k, q] of Object.entries(sel)) {
          out[k] = await page
            .locator(q)
            .first()
            .evaluate((el) => {
              const r = el.getBoundingClientRect();
              return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
            });
        }
        return out;
      };
      const withToast = await boxes();
      await toast.locator('button').click();
      await expect(toast).toHaveCount(0);
      const without = await boxes();
      for (const k of Object.keys(withToast)) {
        for (const f of ['x', 'y', 'width', 'height'] as const) {
          expect(
            Math.abs(withToast[k]![f] - without[k]![f]),
            `${k}.${f} moved when the toast went away`,
          ).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  test('a decision that ends the hand is narrated too, leading the result toast (I080)', async ({
    page,
  }) => {
    await page.goto('/#/play?hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant');
    await ready(page);
    await opt(page, 'play-1').click();
    const sheetCost = (await page.getByTestId('cost-vs-best').textContent())!.match(
      /Costs (\S+) against (\w+)/,
    )!;
    expect(sheetCost[1]).toBe('$3.59');
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
    const toast = page.locator('.sim-toast');
    await expect(toast).toContainText(
      `Bet 1x: a mistake, costs ${sheetCost[1]} against ${sheetCost[2]}.`,
    );
    await expect(toast).toContainText(/Whole-hand expected result from here: [+\u2212]\$/);
    await expect(toast).toContainText('Net');
  });

  test('with EV set to Never there are no EV numbers in the toast (I080)', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: 'Never' }).first().check();
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await page.waitForSelector('[data-testid="simulator"]');
    await opt(page, 'check').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
    await expect(page.locator('.sim-toast')).toHaveCount(0);
  });

  test('a blunder needs a second tap with "Only bad bets"', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: /Only bad bets/ }).check();
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await ready(page);
    await opt(page, 'check').click();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('blunder-warning')).toBeVisible();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'preflop');
    await page.getByRole('button', { name: 'Do it anyway' }).click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
  });

  test('folding reveals the dealer and what would have happened (D7)', async ({ page }) => {
    await page.goto('/#/play?hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant');
    await ready(page);
    await opt(page, 'fold').click();
    // Lesson 12 facts on every river preview: the outs count, which cards, and the basic card.
    const outs = page.getByTestId('dealer-outs');
    await expect(outs).toBeVisible();
    await expect(outs).toContainText('Dealer outs: 27 of 45');
    await expect(outs).toContainText('any ace (3)');
    await expect(outs).toContainText('Hidden pair or better: no');
    await expect(outs).toContainText('Basic card: fold (21+ outs, no hidden pair)');
    await page.getByTestId('confirm').click();
    const reveal = page.getByTestId('fold-reveal');
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(/would have (won|lost)|pushed/);
    // Exactly one live region speaks the fold, and it has the real net.
    const live = page
      .locator('[aria-live="polite"], [role="status"], [role="log"], [role="alert"]')
      .filter({ hasText: /folded/i });
    await expect(live).toHaveCount(1);
    await expect(live).toContainText('You folded. Net');
    await expect(live).toContainText('would have');
  });

  test('practice mode hides the EV until you confirm', async ({ page }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await page.getByTestId('practice-toggle').check();
    await expect(page.locator('button[data-option]').first()).not.toContainText('·');
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('practice-hidden')).toBeVisible();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('practice-result')).toBeVisible();
  });

  test('the session is saved in the app store and restored after a reload', async ({ page }) => {
    await page.goto('/#/play?speed=instant');
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    // Best play on every street until the hand settles.
    for (let i = 0; i < 3; i++) {
      if ((await page.getByTestId('simulator').getAttribute('data-street')) === 'settled') break;
      await ready(page);
      await page.locator('button[data-option].is-best').click();
      await page.getByTestId('confirm').click();
      await page.waitForTimeout(100);
    }
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
    await page.waitForTimeout(600);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.filter((k) => k.startsWith('holdumb'))).toEqual(['holdumb:v1']);
    await page.reload();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-hands', '1');
  });

  test('reloading on the river restores the same cards and bets', async ({ page }) => {
    await page.goto('/#/play?speed=instant');
    await page.getByRole('button', { name: /^Clear/ }).click();
    await page.locator('button[data-chip="500"]').click();
    await page.locator('[data-hit="ante"]').click();
    await page.locator('button[data-action="deal"]').click();
    // Check, check to the river (confirming a second time when a check is a "big mistake").
    for (const street of ['preflop', 'flop']) {
      await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', street);
      await ready(page);
      await opt(page, 'check').click();
      await page.getByTestId('confirm').click();
      // This scenario never flags a check as a big mistake, so the prompt is asserted absent.
      // If a change makes it appear, this fails and the scenario should say so explicitly.
      await expect(page.getByRole('button', { name: 'Do it anyway' })).toHaveCount(0);
      await page.waitForTimeout(150);
    }
    const sim = page.getByTestId('simulator');
    await expect(sim).toHaveAttribute('data-street', 'river');
    const snapshot = () =>
      page.evaluate(() => ({
        cards: [...document.querySelectorAll('g.sim-card:not(.sim-card-back)')].map((e) =>
          e.getAttribute('aria-label'),
        ),
        circles: [...document.querySelectorAll('[data-circle]')].map((e) => e.textContent),
        equity: document.querySelector('[data-testid="simulator"]')!.getAttribute('data-equity'),
      }));
    const before = await snapshot();
    expect(before.cards).toHaveLength(7);
    await page.waitForTimeout(600);
    await page.reload();
    await expect(sim).toHaveAttribute('data-street', 'river');
    expect(await snapshot()).toEqual(before);
    await expect(page.locator('button[data-action="deal"]')).toHaveCount(0);
  });

  test('money never wraps and nothing scrolls sideways', async ({ page }) => {
    await page.goto('/#/play?seed=3&speed=instant');
    const wraps = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll('.sim-status dd, .sim-money')) {
        if (getComputedStyle(el).whiteSpace !== 'nowrap') bad.push(el.className);
      }
      return bad;
    });
    expect(wraps).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tap targets are at least 44 px and the action buttons are on screen', async ({ page }) => {
    await page.goto('/#/play?seed=7&speed=instant');
    await page.locator('button[data-action="deal"]').click();
    await ready(page);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-hit]')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width < 43.5 || r.height < 43.5)
        .map((r) => `${r.width.toFixed(0)}x${r.height.toFixed(0)}`),
    );
    expect(small).toEqual([]);
    const vp = page.viewportSize()!;
    const box = await opt(page, 'play-4').boundingBox();
    expect(box).not.toBeNull();
    if (vp.width > vp.height && vp.height < 520)
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  });
});
