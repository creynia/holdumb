import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const file = path.resolve('dist-single/holdumb.html');

interface Smoke {
  mode: 'worker' | 'inthread';
}
// Needs the test hook in src/app/test-hook.ts.
const smoke = () =>
  (window as unknown as { __holdumb?: { smoke(): Promise<Smoke> } }).__holdumb?.smoke();

test('single-file build opens from file:// with no failed requests or errors', async ({ page }) => {
  test.skip(!existsSync(file), 'run npm run build:single first');
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => failed.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  await expect(page).toHaveTitle('holdumb');
  await expect(page.locator('h1, main').first()).toBeVisible();

  // The inline IIFE worker must start under file:// (it falls back to in-thread otherwise).
  const out = await page.evaluate(smoke);
  expect(out, 'window.__holdumb test hook missing').toBeDefined();
  expect(out!.mode).toBe('worker');
  expect(out!.settled).toBe('resolved');

  // No service worker is registered by the offline copy.
  const sw = await page.evaluate(
    () => 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
  );
  expect(sw).toBe(false);
  expect(failed).toEqual([]);
});

test('hosted build uses a real worker', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(smoke);
  expect(out, 'window.__holdumb test hook missing').toBeDefined();
  expect(out!.mode).toBe('worker');
  expect(out!.settled).toBe('resolved');
});
