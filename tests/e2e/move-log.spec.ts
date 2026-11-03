import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const sim = (page: Page) => page.getByTestId('simulator');
const ready = (page: Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });

/** Tap an option and confirm it (a second tap when the sheet asks "Do it anyway"). */
async function act(page: Page, option: string) {
  await ready(page);
  await page.locator(`button[data-option="${option}"]`).click();
  const confirm = page.getByTestId('confirm');
  await confirm.click();
  if (await page.getByTestId('blunder-warning').isVisible()) await confirm.click();
}
const equity = async (page: Page) => Number(await sim(page).getAttribute('data-equity'));

async function openLog(page: Page): Promise<Locator> {
  const log = page.getByTestId('move-log');
  if ((await log.getAttribute('open')) === null) await log.locator('summary').click();
  await expect(log).toHaveAttribute('open', '');
  return log;
}

test.describe('move log', () => {
  test('three hands: one line per move, newest first, nets reconcile, kept on reload', async ({
    page,
  }) => {
    await page.goto('/#/play?speed=instant');
    const start = await equity(page);
    await page.locator('button[data-action="deal"]').click();

    // Hand 1: Bet 4x preflop.
    await act(page, 'play-4');
    await expect(sim(page)).toHaveAttribute('data-street', 'settled');
    // Hand 2: check, check, fold.
    await page.locator('button[data-action="rebet"]').click();
    await act(page, 'check');
    await act(page, 'check');
    await act(page, 'fold');
    await expect(sim(page)).toHaveAttribute('data-street', 'settled');
    // Hand 3: check, then Bet 2x on the flop.
    await page.locator('button[data-action="rebet"]').click();
    await act(page, 'check');
    await act(page, 'play-2');
    await expect(sim(page)).toHaveAttribute('data-street', 'settled');
    const end = await equity(page);

    const log = await openLog(page);
    const hands = log.getByTestId('move-log-hand');
    await expect(hands).toHaveCount(3);
    await expect(hands.nth(0)).toHaveAttribute('data-hand', '3');
    await expect(hands.nth(2)).toHaveAttribute('data-hand', '1');

    const lines = (i: number) => hands.nth(i).locator('li');
    const deal = /^Ante \$\d+, Blind \$\d+\. You: \S+ \S+\.$/;
    // EV shown before acting (default), so every decision carries its tier word.
    const tier = /(Best play|Close|Small mistake|Mistake|Big mistake)/;
    await expect(lines(2).nth(0)).toHaveText(deal);
    await expect(lines(2).nth(1)).toHaveText(
      new RegExp(`^Preflop: Bet 4x \\(\\$\\d+\\)\\. ${tier.source}`),
    );
    await expect(lines(2).filter({ hasText: /^Flop: / })).toHaveCount(1);
    await expect(lines(2).filter({ hasText: /^Turn and river: / })).toHaveCount(1);
    await expect(lines(2).filter({ hasText: /^Dealer: / })).toHaveCount(1);

    await expect(lines(1).filter({ hasText: /^Preflop: Check\. / })).toHaveCount(1);
    await expect(lines(1).filter({ hasText: /^Flop: Check\. / })).toHaveCount(1);
    await expect(lines(1).filter({ hasText: /^River: Fold\. / })).toHaveCount(1);
    await expect(lines(0).filter({ hasText: /^Flop: Bet 2x \(\$\d+\)\. / })).toHaveCount(1);
    for (const i of [0, 1, 2]) {
      await expect(lines(i).filter({ hasText: tier })).not.toHaveCount(0);
      await expect(lines(i).last()).toHaveText(/Net [+−-]?\$[\d,]+(\.\d\d)?\.$/);
    }

    // The settlement nets add up to the bankroll change, to the cent.
    const nets = await log
      .locator('li[data-kind="result"]')
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-net'))));
    expect(nets).toHaveLength(3);
    expect(nets.reduce((a, b) => a + b, 0)).toBe(end - start);

    // No live region inside the log: it must never announce.
    await expect(log.locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);

    await page.reload();
    const again = await openLog(page);
    await expect(again.getByTestId('move-log-hand')).toHaveCount(3);
    await expect(again.locator('li[data-kind="result"]').first()).toHaveAttribute(
      'data-net',
      String(nets[0]),
    );
  });

  test('a preset hand logs the deal it starts from; New session clears the log', async ({
    page,
  }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    const log = await openLog(page);
    await expect(log.locator('li[data-kind="deal"]')).toHaveText(/You: A♥ 10♣\.$/);
    await expect(log.locator('li[data-kind="board"]')).toHaveText('Flop: 7♦ K♠ 2♣.');
    await page.getByRole('button', { name: /^New session/ }).click();
    await expect(log.getByTestId('move-log-hand')).toHaveCount(0);
    await expect(log).toContainText('No hands yet');
  });

  for (const [w, h] of [
    [360, 740],
    [390, 844],
    [844, 390],
    [667, 375],
  ] as const) {
    test(`at ${w}x${h} the open log covers nothing and scrolls nothing sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
      await ready(page);
      const bar = page.locator('.sim-actions');
      // Document coordinates: opening the log may scroll the page, which is fine.
      const before = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
      });
      const log = await openLog(page);
      // The ActionBar does not move when the log opens.
      const after = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
      });
      expect(after).toEqual(before);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const box = (await log.boundingBox())!;
      const protectedRegions = page.locator('[data-circle], g.sim-card, .sim-actions');
      const n = await protectedRegions.count();
      expect(n).toBeGreaterThan(5);
      for (let i = 0; i < n; i++) {
        const r = await protectedRegions.nth(i).boundingBox();
        if (!r) continue;
        const overlaps =
          r.x < box.x + box.width &&
          box.x < r.x + r.width &&
          r.y < box.y + box.height &&
          box.y < r.y + r.height;
        expect(overlaps, `move log overlaps protected element ${i}`).toBe(false);
      }
      const summary = await log.locator('summary').boundingBox();
      expect(summary!.height).toBeGreaterThanOrEqual(44);
    });
  }
});
