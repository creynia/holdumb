import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
  overrides: Record<string, string>;
  scripts: Record<string, string>;
};
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
const visual = readFileSync(join(root, '.github/workflows/visual-baselines.yml'), 'utf8');

describe('Playwright is pinned in one version everywhere (I045)', () => {
  const pkgVersion = pkg.devDependencies['@playwright/test'];
  it('the package and the core override agree', () => {
    expect(pkgVersion).toBeDefined();
    expect(pkg.overrides['playwright-core']).toBe(pkgVersion);
  });
  it.each([
    ['ci.yml', ci],
    ['visual-baselines.yml', visual],
    ["package.json script 'test:visual:update'", pkg.scripts['test:visual:update'] ?? ''],
  ])('%s runs the same Playwright container', (_name, text) => {
    const tag = text.match(/mcr\.microsoft\.com\/playwright:v([\d.]+)-noble/)?.[1];
    expect(tag, 'container image tag').toBeDefined();
    expect(tag).toBe(pkgVersion);
  });
});
