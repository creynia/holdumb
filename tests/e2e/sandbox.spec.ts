import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSettings } from './settings-seed';

const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });
const opt = (page: Page, k: string) => page.locator(`button[data-option="${k}"]`);

test.describe('sandbox', () => {
  test('a full hand from betting: chips, deal, one tap acts, result (D40)', async ({ page }) => {
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
    // The default policy is "no confirm": the tap acts at once, no sheet.
    await opt(page, 'play-4').click();
    await expect(sim).toHaveAttribute('data-street', 'settled');
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
    await expect(page.locator('.sim-toast')).toContainText(/Net/);
    expect(Number(await sim.getAttribute('data-equity'))).not.toBe(50_000);
    await expect(page.getByRole('button', { name: /Rebet/ })).toBeVisible();
  });

  test('defaults: the best option acts in one tap on every street, no sheet (D40)', async ({
    page,
  }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await expect(page.locator('button[data-option].is-best')).toHaveCount(1);
    await page.locator('button[data-option].is-best').click();
    await expect(page.getByTestId('simulator')).not.toHaveAttribute('data-street', 'flop');
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
  });

  test('confirmOn all: tap -> sheet with the EV -> "Confirm Check" acts (two taps, no "Yes")', async ({
    page,
  }) => {
    await seedSettings(page, { confirmOn: 'all' });
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    const sim = page.getByTestId('simulator');
    await ready(page);
    await opt(page, 'check').click();
    const sheet = page.getByTestId('ev-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(/exact/i);
    await expect(sheet).toContainText(/\$\d/);
    await expect(sim).toHaveAttribute('data-street', 'preflop');
    // Check on aces is a big mistake: the warning shows at once and the primary is "Do it anyway".
    await expect(page.getByTestId('blunder-warning')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await opt(page, 'play-4').click();
    await expect(page.getByTestId('confirm')).toHaveText('Confirm Bet 4x');
    await page.getByTestId('confirm').click();
    await expect(sim).toHaveAttribute('data-street', 'settled');
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
    await expect(page.getByText(/Yes, |Tap again/)).toHaveCount(0);
  });

  test('confirmOn all on the flop: "Confirm Check" is one tap in the sheet', async ({ page }) => {
    await seedSettings(page, { confirmOn: 'all' });
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await opt(page, 'check').click();
    await expect(page.getByTestId('confirm')).toHaveText(/^(Confirm Check|Do it anyway)$/);
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'river');
  });

  test('the flop sheet names the basic-card rule and whether perfect agrees (I058)', async ({
    page,
  }) => {
    await seedSettings(page, { confirmOn: 'all' });
    await page.goto('/#/play?hole=9s7d&board=9hKc2s&dealer=QdJd&street=flop&speed=instant');
    await ready(page);
    await opt(page, 'play-2').click();
    const line = page.getByTestId('flop-rule');
    await expect(line).toContainText('Basic card: rule (b), a hidden pair of nines: Bet 2x.');
    await expect(line).toContainText(/Perfect play (agrees|prefers Check)/);
  });

  test('with "After I choose" one tap acts, then the reveal shows the rule line (I058, D40)', async ({
    page,
  }) => {
    await seedSettings(page, { evMode: 'after' });
    await page.goto('/#/play?hole=9s7d&board=9hKc2s&dealer=QdJd&street=flop&speed=instant');
    await ready(page);
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('reveal-result')).toBeVisible();
    await expect(page.getByTestId('flop-rule')).toContainText('Basic card: rule (b)');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
  });

  test('"After I choose" + confirmOn all: EV hidden in the sheet, then the reveal in place', async ({
    page,
  }) => {
    await seedSettings(page, { evMode: 'after', confirmOn: 'all' });
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await expect(page.locator('button[data-option]').first()).not.toContainText('·');
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('ev-hidden')).toHaveText('EV is hidden until you act.');
    await expect(page.getByTestId('reveal-result')).toHaveCount(0);
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('reveal-result')).toBeVisible();
    await expect(page.getByTestId('ev-hidden')).toHaveCount(0);
  });

  test('by default a blunder acts at once: no sheet, no warning (D40)', async ({ page }) => {
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await ready(page);
    await opt(page, 'check').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
    await expect(page.getByTestId('blunder-warning')).toHaveCount(0);
  });

  test('"Only bad bets": Bet 4x on 7-2 warns at once; Cancel; Check acts in one tap', async ({
    page,
  }) => {
    await seedSettings(page, { confirmOn: 'blunder' });
    await page.goto('/#/play?hole=7s2d&dealer=9d9s&street=preflop&speed=instant');
    const sim = page.getByTestId('simulator');
    await ready(page);
    await opt(page, 'play-4').click();
    await expect(page.getByTestId('blunder-warning')).toBeVisible();
    await expect(page.getByTestId('confirm')).toHaveText('Do it anyway');
    await expect(sim).toHaveAttribute('data-street', 'preflop');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
    await expect(opt(page, 'play-4')).toBeFocused();
    await opt(page, 'check').click();
    await expect(sim).toHaveAttribute('data-street', 'flop');
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
  });

  test('"Only bad bets": "Do it anyway" acts', async ({ page }) => {
    await seedSettings(page, { confirmOn: 'blunder' });
    await page.goto('/#/play?hole=7s2d&dealer=9d9s&street=preflop&speed=instant');
    await ready(page);
    await opt(page, 'play-4').click();
    await page.getByRole('button', { name: 'Do it anyway' }).click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
  });

  test('EV off + confirmOn all: the sheet has no numbers and its Confirm acts (D40)', async ({
    page,
  }) => {
    await seedSettings(page, { evMode: 'never', confirmOn: 'all' });
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
    await opt(page, 'check').click();
    const sheet = page.getByTestId('ev-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('cost-vs-best')).toHaveCount(0);
    await expect(sheet.getByRole('radiogroup')).toHaveCount(0);
    await expect(page.getByTestId('confirm')).toHaveText(/^(Confirm Check|Do it anyway)$/);
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'river');
  });

  test('EV off + "Only bad bets": the warning names the better play, with no figures', async ({
    page,
  }) => {
    await seedSettings(page, { evMode: 'never', confirmOn: 'blunder' });
    await page.goto('/#/play?hole=7s2d&dealer=9d9s&street=preflop&speed=instant');
    await ready(page);
    await opt(page, 'play-4').click();
    const warn = page.getByTestId('blunder-warning');
    await expect(warn).toContainText('big mistake');
    await expect(warn).toContainText('Check');
    const text = (await page.getByTestId('ev-sheet').textContent()) ?? '';
    expect(text).not.toMatch(/\$|ante/i);
  });

  test('folding reveals the dealer and what would have happened (D7)', async ({ page }) => {
    await seedSettings(page, { confirmOn: 'all' });
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

  test('the practice toggle (EV after) reveals the move after one tap', async ({ page }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await page.getByTestId('practice-toggle').check();
    await expect(page.locator('button[data-option]').first()).not.toContainText('·');
    await opt(page, 'play-2').click();
    await expect(page.getByTestId('reveal-result')).toBeVisible();
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
    // Check, check to the river: one tap each with the default policy (D40).
    for (const street of ['preflop', 'flop']) {
      await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', street);
      await ready(page);
      await opt(page, 'check').click();
      await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
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
