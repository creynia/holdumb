// WP0-only: proves the single-file build's inline IIFE worker starts under file://.
// (Integration/infra replace this with single-file.spec.ts once the real UI exists.)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const file = resolve('dist-single/holdumb.html');

interface Smoke {
  mode: 'worker' | 'inthread';
  settled: string;
}
// src/env.d.ts is not part of the node project, so type the test hook here.
const smoke = () =>
  (window as unknown as { __holdumb?: { smoke(): Promise<Smoke> } }).__holdumb?.smoke();

test('single file via file:// uses a real worker', async ({ page }) => {
  test.skip(!existsSync(file), 'run npm run build:single first');
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('pageerror', (e) => failed.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  await expect(page.locator('h1')).toBeVisible();
  const out = await page.evaluate(smoke);
  expect(out?.mode).toBe('worker');
  expect(failed).toEqual([]);
});

test('hosted build uses a real worker', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(smoke);
  expect(out?.mode).toBe('worker');
});
