// @vitest-environment node
// The felt and the landscape table are sized from the small viewport (svh), never the dynamic one
// (dvh). On a phone, dvh grows when scrolling collapses the browser's address bar, which made the
// felt enlarge as the Play tab scrolled. Only the EV sheet may use dvh: it is a transient overlay.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ALLOWED = new Set(['src/sim/ui/styles/evsheet.css']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(css|tsx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('static viewport sizing', () => {
  it('no layout size outside the EV sheet uses dvh', () => {
    const hits = walk('src')
      .filter((f) => !ALLOWED.has(f.replaceAll('\\', '/')))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => /\d+dvh\b/.test(line)),
      )
      .map(({ f, i, line }) => `${f}:${i} ${line.trim()}`);
    expect(hits).toEqual([]);
  });

  it('the felt and the landscape table are sized with svh', () => {
    expect(readFileSync('src/app/styles/app.css', 'utf8')).toMatch(/100svh - var\(--play-chrome\)/);
    const base = readFileSync('src/sim/ui/styles/base.css', 'utf8');
    expect(base).toMatch(/max-height: calc\(100svh - 232px\)/);
    expect(base).toMatch(/var\(--sim-table-h, 100svh\)/);
  });
});
