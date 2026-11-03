import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(join(root, 'index.html'), 'utf8');
const tokens = readFileSync(join(root, 'src/app/styles/tokens.css'), 'utf8');

describe('index.html theme-color metas (I046)', () => {
  it('ships a light and a dark theme-color meta with their media queries', () => {
    expect(html).toMatch(
      /<meta[^>]*id="theme-color-light"[^>]*name="theme-color"[^>]*media="\(prefers-color-scheme: light\)"/,
    );
    expect(html).toMatch(
      /<meta[^>]*id="theme-color-dark"[^>]*name="theme-color"[^>]*media="\(prefers-color-scheme: dark\)"/,
    );
  });
  it('the chrome colours are the --bg tokens of each theme', () => {
    const light = html.match(/id="theme-color-light"[^>]*content="(#[0-9a-f]{6})"/i)?.[1];
    const dark = html.match(/id="theme-color-dark"[^>]*content="(#[0-9a-f]{6})"/i)?.[1];
    expect(light).toBeDefined();
    expect(dark).toBeDefined();
    expect(tokens).toContain(`--bg: ${light};`);
    expect(tokens).toContain(`--bg: ${dark};`);
  });
});
