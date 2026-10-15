// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs against a real `npm run build` (CI runs build:all before tests).
describe.skipIf(!existsSync('dist/sw.js'))('dist/sw.js', () => {
  const sw = existsSync('dist/sw.js') ? readFileSync('dist/sw.js', 'utf8') : '';
  const list = (): string[] => {
    const m = /const urls = (\[.*?\])\.map|__PRECACHE__|(\[\s*"\.\/".*?\])/s.exec(sw);
    const json = m?.[1] ?? m?.[2];
    return json ? (JSON.parse(json) as string[]) : [];
  };

  it('has the build constants substituted', () => {
    expect(sw).not.toContain('__PRECACHE__');
    expect(sw).not.toContain('__VERSION__');
    expect(sw).toMatch(/holdumb-/);
  });
  it('precaches the shell, the manifest, the icons and the EV worker file', () => {
    const urls = list();
    expect(urls).toContain('./');
    expect(urls).toContain('./index.html');
    expect(urls).toContain('./manifest.webmanifest');
    expect(urls).toContain('./icons/icon-192.png');
    const worker = readdirSync('dist/assets').filter((f) => /worker/i.test(f));
    expect(worker.length).toBeGreaterThan(0);
    for (const w of worker) expect(urls).toContain(`./assets/${w}`);
  });
  it('never skips waiting on its own and does not cache the offline copy', () => {
    expect(sw).toContain('SKIP_WAITING');
    expect(list()).not.toContain('./holdumb.html');
  });
});
