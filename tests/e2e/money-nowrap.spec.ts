import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Money never wraps inside an amount (I008): every signed amount in the settlement toast sits on
// one line, at a 360px and a 390px phone width.
const MONEY = /[−-]⁠?\$[\d,.]+/g;

async function playPresetHand(page: Page) {
  await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
  const sim = page.getByTestId('simulator');
  await expect(sim).toHaveAttribute('data-ev', 'ready', { timeout: 20_000 });
  for (let i = 0; i < 4; i++) {
    await expect(sim).toHaveAttribute('data-ev', 'ready', { timeout: 20_000 });
    const street = await sim.getAttribute('data-street');
    if (await page.locator('.sim-toast').first().isVisible()) return;
    const option = street === 'river' ? 'fold' : 'check';
    await page.locator(`button[data-option="${option}"]`).click();
    const confirm = page.getByTestId('confirm');
    if (await confirm.isVisible()) await confirm.click();
  }
  await expect(page.locator('.sim-toast').first()).toBeVisible();
}

for (const [width, height] of [
  [360, 740],
  [390, 844],
] as const) {
  test(`every signed amount in the settlement toast is on one line at ${width}x${height} (I008)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await playPresetHand(page);
    const toast = page.locator('.sim-toast').first();
    await expect(toast).toBeVisible();
    const text = (await toast.textContent()) ?? '';
    const amounts = text.match(MONEY) ?? [];
    expect(amounts.length, 'the settlement names money').toBeGreaterThan(0);
    for (const amount of amounts) {
      const lines = await toast.evaluate((el, needle) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const at = (n.textContent ?? '').indexOf(needle);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(n, at);
          range.setEnd(n, at + needle.length);
          const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
          return tops.size;
        }
        return -1;
      }, amount);
      expect(lines, `"${amount}" is on one line`).toBe(1);
    }
  });
}
