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
