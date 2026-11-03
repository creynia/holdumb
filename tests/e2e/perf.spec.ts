// D34: the flop preview must resolve within 1.5 s at 4x CPU throttle (target ~1 s on a phone).
// CDP's CPU throttle does not apply inside Web Workers, so the budget is also checked on the
// in-thread fallback client, which runs on the throttled main thread.
import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseCards } from '../../src/sim/engine';

const req = (street: 'preflop' | 'flop' | 'river', cards: string) => {
  const c = parseCards(cards);
  return {
    street,
    hole: [c[0]!, c[1]!],
    board: c.slice(2),
    blindPaytable: 'blind-standard',
    ante: 1000,
  };
};
const FLOP = req('flop', 'AhTc7dKs2c');
const RIVER = req('river', 'AhTc7dKs2c9h4s');
const PREFLOP = req('preflop', 'AhTc');

test.skip(({ browserName }) => browserName !== 'chromium');

test('preview timings at 4x CPU throttle', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__holdumb);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const run = (which: 'client' | 'inthread', r: typeof FLOP, label: string) =>
    page.evaluate(
      async ([w, rq, key]) => {
        const hook = window.__holdumb as unknown as Record<
          string,
          { run(k: string, r: unknown, o?: unknown): Promise<unknown>; mode: string }
        >;
        const c = hook[w]!;
        let longest = 0;
        const po = new PerformanceObserver((l) => {
          for (const e of l.getEntries()) longest = Math.max(longest, e.duration);
        });
        try {
          po.observe({ entryTypes: ['longtask'] });
        } catch {
          /* longtask unsupported */
        }
        const t0 = performance.now();
        await c.run('preview', rq, { key });
        const ms = performance.now() - t0;
        await new Promise((r2) => setTimeout(r2, 60));
        po.disconnect();
        return { ms, longest, mode: c.mode };
      },
      [which, r, label] as const,
    );

  const fresh = (r: typeof FLOP, salt: number) => ({ ...r, ante: 1000 + salt * 100 }); // dodge the memo cache
  const worker = await run('client', fresh(FLOP, 1), 'w-flop');
  const inthread = await run('inthread', fresh(FLOP, 2), 'i-flop');
  const riverIn = await run('inthread', fresh(RIVER, 3), 'i-river');
  const preflopIn = await run('inthread', fresh(PREFLOP, 4), 'i-pre');
  console.log(
    `perf @4x: flop worker ${worker.ms.toFixed(0)} ms (${worker.mode}, long task ${worker.longest.toFixed(0)} ms), ` +
      `flop in-thread ${inthread.ms.toFixed(0)} ms (long task ${inthread.longest.toFixed(0)} ms), ` +
      `river ${riverIn.ms.toFixed(0)} ms, preflop ${preflopIn.ms.toFixed(0)} ms`,
  );
  expect(worker.ms).toBeLessThan(1500);
  expect(inthread.ms).toBeLessThan(1500);
  expect(riverIn.ms).toBeLessThan(100);
  expect(preflopIn.ms).toBeLessThan(100);
  expect(inthread.longest).toBeLessThan(50 + 25); // slices are 8 ms; allow scheduler noise
});

test('the flop EV appears in the UI within 1.5 s of dealing it (4x throttle)', async ({ page }) => {
  await page.goto('/#/play?speed=instant');
  await page.waitForSelector('[data-testid="simulator"]');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.evaluate(() => {
    location.hash = '#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant';
  });
  await page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 10_000 });
  const ms = Date.now() - t0;
  console.log(`perf @4x: flop EV visible ${ms} ms after navigation`);
  expect(ms).toBeLessThan(1500);
});

// I038: lesson scenes mount the real table at once and only defer the EV worker until the scene is
// near the viewport, so the content below never jumps while the reader scrolls.
const lessonIds = readdirSync('content/lessons')
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/^\d+-/, '').replace(/\.md$/, ''));
const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
];

for (const vp of VIEWPORTS.slice(1, 3)) {
  test(`lesson scenes scroll without layout shift (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/#/learn/a-full-hand');
    await page.waitForSelector('.scene');
    const scenes = await page.locator('.scene').count();
    expect(scenes).toBeGreaterThan(1);
    // The EV worker stays lazy: scenes far below the fold are not live yet.
    expect(await page.locator('.scene-body[data-live="true"]').count()).toBeLessThan(scenes);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total + 300; y += 300) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);
    expect(await page.locator('.scene-body[data-live="true"]').count()).toBe(scenes);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    console.log(`layout shift @${vp.width}x${vp.height}: cumulative ${cls.toFixed(4)}`);
    expect(cls).toBeLessThan(0.05);
  });
}

for (const vp of VIEWPORTS) {
  test(`every lesson scene keeps its height when it goes live (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(vp);
    let samples = 0;
    for (const id of lessonIds) {
      await page.goto(`/#/learn/${id}`);
      await page.waitForSelector('main');
      const n = await page.locator('.scene-body').count();
      if (n === 0) continue;
      const heights = () =>
        page.$$eval('.scene-body', (els) => els.map((e) => e.getBoundingClientRect().height));
      const before = await heights();
      for (let i = 0; i < n; i++) {
        await page.locator('.scene-body').nth(i).scrollIntoViewIfNeeded();
      }
      await page.waitForFunction(
        (c) => document.querySelectorAll('.scene-body[data-live="true"]').length === c,
        n,
      );
      await page.waitForTimeout(400);
      const after = await heights();
      for (let i = 0; i < n; i++) {
        samples++;
        expect(
          Math.abs(after[i]! - before[i]!),
          `${id} scene ${i} at ${vp.width}x${vp.height}`,
        ).toBeLessThanOrEqual(2);
      }
    }
    expect(samples).toBeGreaterThan(20);
  });
}

test('Home shows its heading within 100 ms of first contentful paint at 4x CPU (I039)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __h1At?: number };
    new MutationObserver((_m, obs) => {
      if (document.querySelector('main h1')) {
        w.__h1At = performance.now();
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/');
  await expect(page.locator('main h1').first()).toBeVisible();
  const { fcp, h1 } = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1,
    h1: (window as unknown as { __h1At?: number }).__h1At ?? -1,
  }));
  expect(h1).toBeGreaterThan(0);
  // main h1 is rendered by the app, so its time is the first real content; FCP can only be earlier.
  expect(h1 - Math.min(fcp, h1)).toBeLessThan(100);
});
