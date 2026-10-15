import { expect, test } from '@playwright/test';

test('PWA works offline after the service worker is installed', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  // Wait until the SW controls the page (clients.claim) so subresources come from the cache.
  await page.waitForFunction('!!navigator.serviceWorker.controller');

  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle('holdumb');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await context.setOffline(false);
});

test('the precache includes the EV worker file, so it loads offline', async ({ page }) => {
  await page.goto('/');
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((k) => k.startsWith('holdumb-'));
    const urls: string[] = [];
    for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push(r.url);
    return urls;
  });
  expect(cached.some((u) => /\/assets\/[^/]*worker[^/]*\.js$/i.test(u))).toBe(true);
  expect(cached.some((u) => u.endsWith('/holdumb.html'))).toBe(false);
});

test('manifest and icons are served', async ({ request }) => {
  const m = await request.get('/manifest.webmanifest');
  expect(m.ok()).toBe(true);
  const json = (await m.json()) as { short_name: string; theme_color: string };
  expect(json.short_name).toBe('holdumb');
  expect(json.theme_color).toBe('#0b2e4a');
  expect((await request.get('/icons/icon-192.png')).ok()).toBe(true);
});
