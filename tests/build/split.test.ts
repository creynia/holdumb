// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs against a real `npm run build` (CI runs build:all before tests). I039.
describe.skipIf(!existsSync('dist/index.html'))('PWA code splitting', () => {
  const html = existsSync('dist/index.html') ? readFileSync('dist/index.html', 'utf8') : '';
  const entry = /<script[^>]*type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
  const preloads = [
    ...html.matchAll(/<link rel="modulepreload"[^>]*href="\.\/(assets\/[^"]+)"/g),
  ].map((m) => m[1]!);
  const size = (f: string) => statSync(`dist/${f}`).size;

  it('finds the entry chunk in index.html', () => {
    expect(entry).toBeTruthy();
  });
  it('keeps the JS the first paint needs (entry + static preloads) at or under 200 kB', () => {
    const total = [entry!, ...preloads].reduce((n, f) => n + size(f), 0);
    expect(total).toBeLessThanOrEqual(200_000); // see bundle-size.test.ts for the reasons
  });
  it('preloads no simulator chunk: Home never loads the table code (I095)', () => {
    // vite.config.ts names every chunk that carries src/sim code sim-*.
    const simChunks = readdirSync('dist/assets').filter((f) => /^sim-.*\.js$/.test(f));
    expect(simChunks.length, 'the build names its simulator chunks').toBeGreaterThan(0);
    expect(preloads.filter((f) => /^assets\/sim-/.test(f))).toEqual([]);
    expect(entry).not.toMatch(/^assets\/sim-/);
    // The Play screen is its own lazy chunk, not part of the entry.
    expect(readFileSync(`dist/${entry!}`, 'utf8')).not.toContain('holdumb:sandbox');
  });
  it('keeps the compiled lesson bundle out of the entry and its preloads', () => {
    for (const f of [entry!, ...preloads]) {
      const src = readFileSync(`dist/${f}`, 'utf8');
      // A scene title from lesson 1: it lives in the lesson bundle only.
      expect(src).not.toContain('Find the circles');
      expect(size(f)).toBeLessThan(150_000);
    }
  });
});
