// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * Budgets (bytes). The "entry" is everything the first paint loads eagerly: the module script in
 * dist/index.html plus its static modulepreloads (route chunks and the lesson bundle are lazy,
 * I039). Loosen only with a reason in the PR.
 *
 * 2026-11-03: raised from 200 kB / 80 kB gzip to 215 kB / 85 kB. Six Card auto-play (I062), hand
 * history (I055) and Watch (I078) each add 3-6 kB of code the table needs on every settle or
 * reload; lazy-loading their views saves under 1 kB because the shared engine/math modules are
 * re-chunked into an extra preload. The structural fix is keeping the Play code out of the Home
 * route's preloads (follow-up item).
 * 2026-11-03: raw raised to 220 kB (gzip stays 85 kB). I078 Watch +6.4 kB (2026-11-03); I095 tracks
 * the structural fix (keep src/sim out of Home's preloads).
 * 2026-11-03 (I095): back to 200 kB / 80 kB. Play is a lazy screen, the app imports simulator leaf
 * modules (never the barrels), the store's value lists are plain data and the test hook loads after
 * first paint: Home's first paint is about 46 kB raw (entry + preact), with no simulator chunk.
 */
const BUDGET = {
  entryRaw: 200_000,
  entryGzip: 80_000,
  cssRaw: 40_000,
  workerRaw: 60_000,
};

const dir = resolve('dist/assets');

function sizes(file: string): { raw: number; gzip: number } {
  const buf = readFileSync(join(dir, file));
  return { raw: buf.length, gzip: gzipSync(buf).length };
}

describe('PWA bundle budgets', () => {
  it('entry JS, CSS and worker stay within budget (sizes are printed for the trend)', () => {
    if (!existsSync(dir)) {
      // Locally a missing build skips with a hint; in CI it must fail, never pass silently.
      if (process.env.CI) throw new Error(`${dir} is missing: CI must run build:all before check`);
      console.warn('skipped: run npm run build:all first');
      return;
    }
    const files = readdirSync(dir);
    const html = readFileSync(resolve('dist/index.html'), 'utf8');
    const entries = [
      /<script[^>]*type="module"[^>]*src="\.\/assets\/([^"]+\.js)"/.exec(html)?.[1],
      ...[...html.matchAll(/<link rel="modulepreload"[^>]*href="\.\/assets\/([^"]+)"/g)].map(
        (m) => m[1],
      ),
    ].filter((f): f is string => !!f);
    const entry = entries[0];
    const css = files.find((f) => /^index-.*\.css$/.test(f));
    const worker = files.find((f) => /^ev\.worker-.*\.js$/.test(f));
    expect(entry, 'entry JS (dist/assets/index-*.js) is missing').toBeDefined();
    expect(css, 'CSS (dist/assets/index-*.css) is missing').toBeDefined();
    expect(worker, 'worker (dist/assets/ev.worker-*.js) is missing').toBeDefined();

    const parts = entries.map(sizes);
    const e = {
      raw: parts.reduce((n, p) => n + p.raw, 0),
      gzip: parts.reduce((n, p) => n + p.gzip, 0),
    };
    const c = sizes(css!);
    const w = sizes(worker!);
    console.log(
      `bundle sizes: entry ${e.raw} B raw / ${e.gzip} B gzip, css ${c.raw} B, worker ${w.raw} B`,
    );
    expect(e.raw, 'entry JS raw').toBeLessThanOrEqual(BUDGET.entryRaw);
    expect(e.gzip, 'entry JS gzip').toBeLessThanOrEqual(BUDGET.entryGzip);
    expect(c.raw, 'CSS raw').toBeLessThanOrEqual(BUDGET.cssRaw);
    expect(w.raw, 'worker raw').toBeLessThanOrEqual(BUDGET.workerRaw);
  });
});
