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

  test('a table mistake is reviewable in Drill from the Session panel (I056)', async ({ page }) => {
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    const sim = page.getByTestId('simulator');
    await ready(page);
    // Check preflop with aces: a Big mistake. Then check the flop and bet the river.
    for (const [street, option] of [
      ['preflop', 'check'],
      ['flop', 'check'],
      ['river', 'play-1'],
    ] as const) {
      await expect(sim).toHaveAttribute('data-street', street);
      await ready(page);
      await opt(page, option).click();
      await page.getByTestId('confirm').click();
    }
    await expect(sim).toHaveAttribute('data-street', 'settled');
    await page.getByTestId('session-toggle').click();
    const link = page.getByTestId('session-review');
    await expect(link).toHaveText(/^Review \d+ mistakes?$/);
    expect(await link.getAttribute('href')).toContain('p:AsAh.');
    await link.click();
    await expect(page.getByTestId('drill-spot')).toBeVisible();
    await expect(page).toHaveURL(/#\/drill\?focus=.*p:AsAh\./);
    // Drill deals only the table's mistakes; the aces spot comes up, and Check grades as the table did.
    const cards = page.locator('[data-testid="drill-spot"] .drill-cards .cards').first();
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      const spot = page.getByTestId('drill-spot');
      if ((await spot.getAttribute('data-street')) === 'preflop') {
        const label = (await cards.getAttribute('aria-label')) ?? '';
        seen = /Ace of spades.*Ace of hearts|Ace of hearts.*Ace of spades/i.test(label);
      }
      if (!seen) {
        await spot.locator('.choice-row button').first().click();
        await page.getByRole('button', { name: 'Next hand' }).click();
      }
    }
    expect(seen, 'the aces spot is dealt from the table mistakes').toBe(true);
    await page.locator('.choice-row button', { hasText: 'Check' }).click();
    await expect(page.getByTestId('drill-result')).toHaveAttribute('data-tier', 'blunder');
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
    // The combined toast does not move the settled bar or the felt either (page coordinates).
    const rebet = page.getByRole('button', { name: /Rebet/ });
    const at = async () =>
      Promise.all(
        [rebet, page.locator('.sim-felt').first()].map((l) =>
          l.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return [r.x + scrollX, r.y + scrollY, r.width, r.height];
          }),
        ),
      );
    const withToast = await at();
    await toast.locator('button').click();
    await expect(toast).toHaveCount(0);
    const without = await at();
    withToast
      .flat()
      .forEach((v, i) => expect(Math.abs(v - without.flat()[i]!)).toBeLessThanOrEqual(1));
  });

  test('with EV set to Never there are no EV numbers in the toast (I080)', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: 'Off' }).first().check();
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await page.waitForSelector('[data-testid="simulator"]');
    await opt(page, 'check').click();
    await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'flop');
    await expect(page.getByTestId('ev-sheet')).toHaveCount(0);
    await expect(page.locator('.sim-toast')).toHaveCount(0);
  });

  test('a blunder needs a second tap with "Only bad bets"', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('checkbox', { name: 'Confirm my bets' }).check();
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

  test('EV "After" hides the EV until you confirm', async ({ page }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await page
      .getByRole('group', { name: 'Show EV' })
      .getByRole('radio', { name: 'After' })
      .check();
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
    // The hand history survives the reload (I055): one row, expandable, with a replay link.
    const rows = page.getByTestId('hand-history-row');
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole('button').click();
    await expect(page.getByTestId('replay-spot')).toHaveAttribute('href', /#\/play\?hole=/);
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

  test('the hand result stays on screen after the toast is dismissed (I051)', async ({ page }) => {
    await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
    await ready(page);
    await opt(page, 'play-2').click();
    await page.getByTestId('confirm').click();
    const sim = page.getByTestId('simulator');
    await expect(sim).toHaveAttribute('data-street', 'settled');
    const toast = page.locator('.sim-toast');
    await expect(toast).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(toast).toHaveCount(0);
    const result = page.getByTestId('hand-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Won|Lost|Push/);
    // Signed money uses the real minus, so a line break can't fall inside it.
    await expect(result).not.toContainText('-');
    // The pill never sits on a bet circle, a hole card or a board card.
    const box = await result.boundingBox();
    if (!box) throw new Error('hand result has no box');
    const overlaps = await page.evaluate((r) => {
      const hit = (b: DOMRect) =>
        !(b.right <= r.x || b.left >= r.x + r.width || b.bottom <= r.y || b.top >= r.y + r.height);
      return [...document.querySelectorAll('[data-hit], g.sim-card')]
        .map((e) => e.getBoundingClientRect())
        .filter((b) => hit(b)).length;
    }, box);
    expect(overlaps).toBe(0);
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

  test('Watch plays 3 perfect hands on the felt, announces them, and moves nothing (I078)', async ({
    page,
  }) => {
    // Normal speed (900 ms per move) and Pause: the layout is measured while the run is held, so
    // nothing here races the run.
    await page.goto('/#/play?seed=7&speed=normal');
    const sim = page.getByTestId('simulator');
    await expect(sim).toHaveAttribute('data-hands', '0');
    // Every insertion into a toast's spoken text, for the announcement checks at the end.
    await page.evaluate(() => {
      const w = window as unknown as { __said: string[] };
      w.__said = [];
      new MutationObserver(() => {
        document.querySelectorAll('.sim-toasts .sim-sr').forEach((el) => {
          const t = el.textContent ?? '';
          if (t && w.__said.at(-1) !== t) w.__said.push(t);
        });
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    const vp = page.viewportSize()!;
    const landscape = vp.width > vp.height && vp.height < 520;
    // Page (document) coordinates: scrolling the window is not a layout move.
    const doc = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
      });
    // Portrait: the strip takes the rack's place at the bottom of the table section, so everything
    // above it (status, felt, ActionBar) must stay put. Landscape: the whole table and rail.
    const boxes = async () => ({
      table: await doc(landscape ? '.sim-table' : '.sim-table-felt'),
      actions: await doc('.sim-actions'),
      rail: await doc(landscape ? '.sim-rail' : '.sim-status'),
    });
    const near = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      Math.abs(a.x - b.x) <= 1 &&
      Math.abs(a.y - b.y) <= 1 &&
      Math.abs(a.width - b.width) <= 1 &&
      Math.abs(a.height - b.height) <= 1;
    const before = await boxes();
    await page.getByTestId('watch-hands').selectOption('3');
    await page.getByTestId('watch-start').click();
    const status = page.getByTestId('watch-status');
    await page.getByTestId('watch-pause').click();
    await expect(page.getByTestId('watch-pause')).toHaveText('Resume');
    await expect(status).toContainText('of 3');
    await expect(page.locator('.sim-rack')).toHaveCount(0);
    // Held: starting Watch moved neither the table nor the ActionBar (nor the rail in landscape).
    const during = await boxes();
    expect(near(during.table, before.table)).toBe(true);
    expect(near(during.actions, before.actions)).toBe(true);
    expect(near(during.rail, before.rail)).toBe(true);
    // The strip never sits on the felt; Pause / Stop are full tap targets, on screen above any
    // tab bar.
    const felt = (await page.locator('svg.sim-felt').boundingBox())!;
    const strip = (await status.boundingBox())!;
    const overlaps =
      strip.x < felt.x + felt.width &&
      felt.x < strip.x + strip.width &&
      strip.y < felt.y + felt.height &&
      felt.y < strip.y + strip.height;
    expect(overlaps).toBe(false);
    const tab = await page.locator('.tabbar').boundingBox();
    for (const id of ['watch-stop', 'watch-pause']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.y + b.height).toBeLessThanOrEqual(tab && tab.height ? tab.y : vp.height);
    }
    await page.getByTestId('watch-pause').click();
    await expect(page.getByTestId('watch-summary')).toHaveText('Watched 3 hands of perfect play.', {
      timeout: 60_000,
    });
    await expect(sim).toHaveAttribute('data-hands', '3');
    await expect(status).toHaveCount(0);
    const after = await boxes();
    expect(near(after.table, before.table)).toBe(true);
    expect(near(after.actions, before.actions)).toBe(true);
    expect(near(after.rail, before.rail)).toBe(true);
    // One announcement per hand, each naming perfect play's moves.
    const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said);
    expect(said).toHaveLength(3);
    said.forEach((t, i) => expect(t).toMatch(new RegExp(`^Hand ${i + 1} of 3: .*(Bet|Check)`)));
    // Watched hands are the table's play: the session panel lists them on their own line.
    await page.getByTestId('session-toggle').click();
    await expect(page.getByTestId('session-watched')).toContainText('3 hands');
  });

  test('Watch: Stop stops, and Pause holds the table (I078)', async ({ page }) => {
    await page.goto('/#/play?seed=7&speed=fast');
    const sim = page.getByTestId('simulator');
    await page.getByTestId('watch-start').click();
    await expect(page.getByTestId('watch-option')).toHaveText(/Bet \dx|Check|Fold/, {
      timeout: 15_000,
    });
    await page.getByTestId('watch-pause').click();
    await expect(page.getByTestId('watch-pause')).toHaveText('Resume');
    const street = await sim.getAttribute('data-street');
    const hands = await sim.getAttribute('data-hands');
    await page.waitForTimeout(1500);
    await expect(sim).toHaveAttribute('data-street', street!);
    await expect(sim).toHaveAttribute('data-hands', hands!);
    await page.getByTestId('watch-pause').click();
    await expect
      .poll(async () => Number(await sim.getAttribute('data-hands')), { timeout: 30_000 })
      .toBeGreaterThan(Number(hands));
    await page.getByTestId('watch-stop').click();
    await expect(page.getByTestId('watch-status')).toHaveCount(0);
    await expect(page.getByTestId('watch-summary')).toContainText(/Stopped after \d+ hands?/);
    const after = await sim.getAttribute('data-hands');
    await page.waitForTimeout(1500);
    await expect(sim).toHaveAttribute('data-hands', after!);
  });

  test('Six Card Bonus: off by default, on it settles at the deal off the felt (I062)', async ({
    page,
  }) => {
    await page.goto('/#/play?seed=7&speed=instant');
    const sim = page.getByTestId('simulator');
    const panel = page.getByTestId('six-card');
    await expect(page.getByTestId('six-card-toggle')).not.toBeChecked();
    await page.getByTestId('six-card-toggle').check();
    await expect(page.getByTestId('six-card-edge')).toContainText('8.56%');
    await expect(page.getByTestId('six-card-edge')).toContainText('$12.84 an hour');
    const before = Number(await sim.getAttribute('data-equity'));
    await page.locator('button[data-action="deal"]').click();
    const last = page.getByTestId('six-card-last');
    await expect(last).toBeVisible();
    await expect(last.locator('.sim-inline-card')).toHaveCount(4);
    // The bet settled with the deal: equity moved by exactly the Six Card profit ($5 bet).
    const text = (await last.textContent()) ?? '';
    const m = /([+−])\$([\d,.]+)\s*$/.exec(text);
    expect(m).not.toBeNull();
    const profit = Math.round(Number(m![2]!.replace(/,/g, '')) * 100) * (m![1] === '−' ? -1 : 1);
    expect(profit === -500 || profit >= 3_500).toBe(true);
    expect(Number(await sim.getAttribute('data-equity'))).toBe(before + profit);
    // Never on the felt; its controls are full tap targets.
    const felt = (await page.locator('svg.sim-felt').boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(felt.y + felt.height);
    for (const id of ['six-card-amount', 'six-card-paytable'])
      expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

// I092: the status bar's Details opens the EV sheet without acting.
for (const vp of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`status-bar Details opens the sheet on the best option and changes no layout at ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/play?hole=AsAh&speed=instant&seed=1');
    await ready(page);
    const sim = page.getByTestId('simulator');
    const details = page.getByTestId('ev-details');
    await expect(details).toBeVisible();
    expect((await details.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const bar = page.locator('.sim-status');
    const barBefore = (await bar.boundingBox())!;
    expect(barBefore.height).toBeLessThanOrEqual(46);
    // four columns (Session) must not overflow: "Details" does not wrap
    expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const row = async () => {
      return (await page.locator('[role="group"][aria-label="Your decision"]').boundingBox())!;
    };
    const rowBefore = await row();
    await details.click();
    const sheet = page.getByTestId('ev-sheet');
    await expect(sheet).toBeVisible();
    const best = await page.locator('button[data-option].is-best').getAttribute('data-option');
    await expect(sheet.getByTestId('confirm')).toContainText(
      best === 'check' ? 'Confirm Check' : /Confirm Bet/,
    );
    await expect(sim).toHaveAttribute('data-street', 'preflop'); // nothing was played
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(details).toBeFocused();
    const rowAfter = await row();
    const barAfter = (await bar.boundingBox())!;
    expect(Math.abs(rowAfter.y - rowBefore.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(barAfter.height - barBefore.height)).toBeLessThanOrEqual(1);
    // Confirm acts
    await details.click();
    await page.getByTestId('confirm').click();
    await expect(sim).not.toHaveAttribute('data-street', 'preflop');
    // With the Session column present (four columns) Details still neither wraps nor overflows.
    while ((await sim.getAttribute('data-street')) !== 'settled') {
      await ready(page);
      await opt(page, 'check').click();
      await page.getByTestId('confirm').click();
      if ((await sim.getAttribute('data-street')) === 'river') break;
    }
    await page.getByRole('button', { name: /Rebet/ }).click();
    await ready(page);
    await expect(page.getByTestId('session-net')).toBeVisible();
    await expect(details).toBeVisible();
    expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await details.boundingBox())!.height).toBeLessThan(60);
    expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(46);
  });
}
