import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// A pair of kings with an ace kicker beats a pair of kings with a queen kicker; the Blind pushes.
const URL = '/#/drill?mode=showdown&spot=s:KdAc.Ks7h4c2d9s.KhQc';

test.describe('Drill: read the showdown (I061)', () => {
  for (const vp of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    test(`nine cards, three taps, feedback, no sideways scroll at ${vp.width}x${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto(URL);
      const spot = page.getByTestId('showdown-spot');
      await expect(spot).toBeVisible();
      await expect(spot.locator('.pc')).toHaveCount(9);
      // Every answer button is a 44px target with an accessible name.
      const boxes = await spot.locator('.sd-q button').evaluateAll((els) =>
        els.map((e) => ({
          h: e.getBoundingClientRect().height,
          w: e.getBoundingClientRect().width,
          n: e.textContent,
        })),
      );
      expect(boxes).toHaveLength(8);
      for (const b of boxes) {
        expect(b.h).toBeGreaterThanOrEqual(44);
        expect(b.w).toBeGreaterThanOrEqual(44);
        expect(b.n).toBeTruthy();
      }
      await page.locator('[data-testid="showdown-winner"] [data-value="you"]').click();
      await page.locator('[data-testid="showdown-qualifies"] [data-value="yes"]').click();
      await page.locator('[data-testid="showdown-blind"] [data-value="pushes"]').click();
      const fb = page.getByTestId('showdown-feedback');
      await expect(fb).toContainText('All three right.');
      await expect(spot.locator('.pc-out')).toHaveCount(2);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }

  test('Next spot puts a new code in the URL, and reloading keeps the same spot', async ({
    page,
  }) => {
    await page.goto('/#/drill?mode=showdown&seed=11');
    const spot = page.getByTestId('showdown-spot');
    await expect(spot).toBeVisible();
    const first = await spot.getAttribute('data-code');
    expect(page.url()).toContain(`spot=${first}`);
    await page.reload();
    await expect(page.getByTestId('showdown-spot')).toHaveAttribute('data-code', first!);
    for (const [g, v] of [
      ['winner', 'you'],
      ['qualifies', 'yes'],
      ['blind', 'pays'],
    ])
      await page.locator(`[data-testid="showdown-${g}"] [data-value="${v}"]`).click();
    await page.getByTestId('showdown-next').click();
    await expect(page.getByTestId('showdown-spot')).not.toHaveAttribute('data-code', first!);
    await expect(page.getByTestId('showdown-feedback')).toHaveCount(0);
  });

  test('stats persist per question type across a reload', async ({ page }) => {
    await page.goto(URL);
    await page.locator('[data-testid="showdown-winner"] [data-value="you"]').click();
    await page.locator('[data-testid="showdown-qualifies"] [data-value="no"]').click();
    await page.locator('[data-testid="showdown-blind"] [data-value="pushes"]').click();
    const stats = page.getByTestId('showdown-stats');
    await expect(stats).toContainText('Winner 1/1');
    await expect(stats).toContainText('Qualifies 0/1');
    await expect(stats).toContainText('Blind 1/1');
    await page.reload();
    await expect(page.getByTestId('showdown-stats')).toContainText('Qualifies 0/1');
  });

  test('has no serious or critical axe violations, answered or not', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('showdown-spot')).toBeVisible();
    for (const step of [0, 1]) {
      if (step === 1)
        for (const [g, v] of [
          ['winner', 'dealer'],
          ['qualifies', 'yes'],
          ['blind', 'loses'],
        ])
          await page.locator(`[data-testid="showdown-${g}"] [data-value="${v}"]`).click();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
        [],
      );
    }
  });

  test('the action drill links here, and the link opens the showdown drill', async ({ page }) => {
    await page.goto('/#/drill');
    await page.getByRole('link', { name: 'Read the showdown' }).click();
    await expect(page.getByRole('heading', { name: 'Read the showdown' })).toBeVisible();
  });
});
