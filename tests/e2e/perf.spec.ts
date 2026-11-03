// D34: the flop preview must resolve within 1.5 s at 4x CPU throttle (target ~1 s on a phone).
// CDP's CPU throttle does not apply inside Web Workers, so the budget is also checked on the
// in-thread fallback client, which runs on the throttled main thread.
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

// I038: lesson scenes lazy-mount their table; the placeholder must reserve the final height so the
// content below does not jump while the reader scrolls.
for (const vp of [
  { name: 'portrait 390x844', width: 390, height: 844 },
  { name: 'landscape 844x390', width: 844, height: 390 },
]) {
  test(`lesson scenes mount without layout shift (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __shifts: number };
      w.__cls = 0;
      w.__shifts = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!e.hadRecentInput) {
            w.__cls += e.value;
            w.__shifts++;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/#/learn/a-full-hand');
    await page.waitForSelector('.scene');
    const scenes = await page.locator('.scene').count();
    expect(scenes).toBeGreaterThan(1);
    // Lazy mounting is unchanged: with the page at the top, the later scenes are not mounted yet.
    expect(await page.locator('[data-testid="simulator"]').count()).toBeLessThan(scenes);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total + 300; y += 300) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);
    expect(await page.locator('[data-testid="simulator"]').count()).toBe(scenes);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    console.log(`layout shift @${vp.name}: cumulative ${cls.toFixed(4)} over ${scenes} scenes`);
    expect(cls).toBeLessThan(0.05);
  });
}

test('lesson scene placeholder reserves the mounted table height', async ({ page }) => {
  for (const vp of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(vp);
    await page.goto('/#/learn/a-full-hand');
    await page.waitForSelector('.scene');
    const before = await page.locator('.scene-body').last().boundingBox();
    expect(await page.locator('.scene-placeholder').count()).toBeGreaterThan(0);
    await page.locator('.scene').last().scrollIntoViewIfNeeded();
    await page.waitForSelector('.scene:last-of-type [data-testid="simulator"]');
    await page.waitForTimeout(500);
    const after = await page.locator('.scene-body').last().boundingBox();
    console.log(
      `scene body ${vp.width}x${vp.height}: placeholder ${before!.height} -> ${after!.height}`,
    );
    expect(
      Math.abs(after!.height - before!.height),
      `${vp.width}x${vp.height}`,
    ).toBeLessThanOrEqual(2);
  }
});
