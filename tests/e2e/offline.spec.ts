import {
  cpSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { expect, test } from '@playwright/test';

test('PWA works offline after the service worker is installed', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  // Wait until the SW controls the page (clients.claim) so subresources come from the cache.
  await page.waitForFunction('!!navigator.serviceWorker.controller');

  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle(/^Ultimate Texas Hold'em.*\| holdumb$/);
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

// Regression: GitHub Pages sends max-age=600. The new SW must precache with cache:'reload',
// else it stores the OLD index.html under the NEW cache name and the app goes blank offline.
test('update within the HTTP max-age window keeps a consistent offline cache', async ({
  page,
  context,
}) => {
  const tmp = mkdtempSync(join(tmpdir(), 'holdumb-upd-'));
  const a = join(tmp, 'A');
  const b = join(tmp, 'B');
  cpSync('dist', a, { recursive: true });
  cpSync('dist', b, { recursive: true });
  // Build "v2": renamed entry script, new SW version.
  const entry = readdirSync(join(b, 'assets')).find((f) => /^index-.*\.js$/.test(f))!;
  const entry2 = entry.replace(/^index-/, 'index-v2-');
  renameSync(join(b, 'assets', entry), join(b, 'assets', entry2));
  for (const f of ['index.html', 'sw.js']) {
    const p = join(b, f);
    let t = readFileSync(p, 'utf8').split(entry).join(entry2);
    if (f === 'sw.js') t = t.replace(/(PREFIX \+ )"[^"]*"/, '$1"v2v2v2v2v2v2"');
    writeFileSync(p, t);
  }

  let root = a;
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  };
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(root, p);
    if (!existsSync(f) || !statSync(f).isFile()) {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(f)] ?? 'application/octet-stream',
      'cache-control': 'max-age=600',
    });
    createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://localhost:${(srv.address() as AddressInfo).port}/`;
  try {
    await page.goto(url);
    await page.waitForFunction('!!navigator.serviceWorker.controller');
    root = b;
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistration().then((r) => r?.update() as Promise<unknown>),
    );
    const toast = page.getByRole('status').filter({ hasText: 'Update available' });
    await toast.waitFor();
    await Promise.all([
      page.waitForEvent('load'),
      toast.getByRole('button', { name: 'Reload' }).click(),
    ]);

    const info = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((k) => k.startsWith('holdumb-'));
      const c = await caches.open(names[0]!);
      const html = await (await c.match('./index.html'))!.text();
      const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]!);
      const cached = await Promise.all(srcs.map(async (s) => !!(await c.match(s))));
      return { names, srcs, cached };
    });
    expect(info.names).toHaveLength(1);
    expect(info.srcs.length).toBeGreaterThan(0);
    expect(info.srcs.join()).toContain('index-v2-');
    expect(info.cached.every(Boolean)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  } finally {
    srv.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('static lesson pages come from the network, and offline open the app screen', async ({
  page,
}) => {
  // Own server, so "offline" can be real: Chromium's setOffline does not reach SW fetches.
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  };
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join('dist', p);
    if (!existsSync(f) || !statSync(f).isFile()) {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(f)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://localhost:${(srv.address() as AddressInfo).port}/`;
  try {
    await page.goto(url);
    await page.waitForFunction('!!navigator.serviceWorker.controller');

    // Online, under SW control: the real static page, not the SPA shell.
    await page.goto(url + 'learn/welcome/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to the table');
    await expect(page.locator('#app')).toHaveCount(0);
    await expect(page).toHaveTitle(/Welcome to the table/);

    // Server gone: the SW redirects to the same lesson in the app (served from the precache).
    srv.closeAllConnections();
    await new Promise<void>((r) => srv.close(() => r()));
    await page.goto(url + 'learn/hand-rankings/');
    await expect(page).toHaveURL(/#\/learn\/hand-rankings$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(
      'Poker hands in five minutes',
    );
  } finally {
    if (srv.listening) srv.close();
  }
});
