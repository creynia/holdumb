import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Money never wraps inside an amount (I008). The settlement toast (the one with "Net") is swept from
// 160px to 340px wide; at every width each signed amount in it sits on one line.
// An amount is the sign, the dollar sign and digits (with an optional cents part); the sentence's
// full stop is not part of it.
const MONEY = /[\u2212-]\u2060?\$\d[\d,]*(?:\.\d\d)?/g;

async function playToSettlement(page: Page) {
  await page.goto('/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant');
  const sim = page.getByTestId('simulator');
  await expect(sim).toHaveAttribute('data-ev', 'ready', { timeout: 20_000 });
  const settlement = page.locator('.sim-toast', { hasText: 'Net' }).first();
  for (let i = 0; i < 4; i++) {
    if (await settlement.isVisible()) return settlement;
    await expect(sim).toHaveAttribute('data-ev', 'ready', { timeout: 20_000 });
    const street = await sim.getAttribute('data-street');
    const option = street === 'river' ? 'fold' : 'check';
    await page.locator(`button[data-option="${option}"]`).click();
    const confirm = page.getByTestId('confirm');
    if (await confirm.isVisible()) await confirm.click();
  }
  await expect(settlement).toBeVisible();
  return settlement;
}

for (const [width, height] of [
  [360, 740],
  [390, 844],
] as const) {
  test(`every signed amount in the settlement toast is on one line from 160 to 340px (I008) at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const toast = await playToSettlement(page);
    const text = (await toast.textContent()) ?? '';
    const amounts = text.match(MONEY) ?? [];
    expect(amounts.length, 'the settlement names money').toBeGreaterThan(0);
    // Sweep the toast's width in 1px steps and measure each amount's client rects in each step.
    const failures = await toast.evaluate((el, amts: string[]) => {
      const out: string[] = [];
      const widthBefore = el.style.width;
      const maxBefore = el.style.maxWidth;
      for (let w = 160; w <= 340; w++) {
        el.style.width = `${w}px`;
        el.style.maxWidth = `${w}px`;
        for (const needle of amts) {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let lines = -1;
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const at = (n.textContent ?? '').indexOf(needle);
            if (at < 0) continue;
            const range = document.createRange();
            range.setStart(n, at);
            range.setEnd(n, at + needle.length);
            // Zero-width fragments (joiners, empty boxes) are not text; tops within 1px are one line.
            const tops = Array.from(range.getClientRects())
              .filter((r) => r.width > 0)
              .map((r) => Math.round(r.top))
              .sort((a, b) => a - b);
            lines = tops.reduce((n, t, i) => (i > 0 && t - tops[i - 1]! <= 1 ? n : n + 1), 0);
            break;
          }
          if (lines !== 1) {
            const dbg = (() => {
              const walker2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              for (let n = walker2.nextNode(); n; n = walker2.nextNode()) {
                const at = (n.textContent ?? '').indexOf(needle);
                if (at < 0) continue;
                const r = document.createRange();
                r.setStart(n, at);
                r.setEnd(n, at + needle.length);
                return JSON.stringify(
                  Array.from(r.getClientRects()).map((x) => [
                    Math.round(x.top),
                    Math.round(x.width),
                  ]),
                );
              }
              return 'no-node';
            })();
            out.push(
              `${w}px cps=${[...needle].map((c) => c.codePointAt(0)!.toString(16)).join(',')} on ${lines} lines rects=${dbg}`,
            );
          }
        }
      }
      el.style.width = widthBefore;
      el.style.maxWidth = maxBefore;
      return out;
    }, amounts);
    const widths = [...new Set(failures.map((f) => parseInt(f, 10)))];
    expect(
      { count: failures.length, widths: widths.slice(0, 5), sample: failures.slice(0, 3) },
      'no amount wraps at any width',
    ).toEqual({ count: 0, widths: [], sample: [] });
  });
}
