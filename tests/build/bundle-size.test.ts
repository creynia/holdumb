// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/** Budgets (bytes). Tighten after code-splitting; loosen only with a reason in the PR. */
const BUDGET = {
  entryRaw: 400_000,
  entryGzip: 130_000,
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
    const entry = files.find((f) => /^index-.*\.js$/.test(f));
    const css = files.find((f) => /^index-.*\.css$/.test(f));
    const worker = files.find((f) => /^ev\.worker-.*\.js$/.test(f));
    expect(entry, 'entry JS (dist/assets/index-*.js) is missing').toBeDefined();
    expect(css, 'CSS (dist/assets/index-*.css) is missing').toBeDefined();
    expect(worker, 'worker (dist/assets/ev.worker-*.js) is missing').toBeDefined();

    const e = sizes(entry!);
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
