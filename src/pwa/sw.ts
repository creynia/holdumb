// Service worker source. Compiled (type-stripped) and injected with the precache
// list by build/vite-plugin-sw.ts, which emits it as `sw.js`. Not bundled into the app.
// The two build-time constants declared below are replaced textually.

declare const __PRECACHE__: string[];
declare const __VERSION__: string;

interface ExtendableEventLike extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(r: Promise<Response> | Response): void;
}
interface MessageEventLike extends Event {
  data: unknown;
}
interface WorkerScope {
  location: Location;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', cb: (e: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', cb: (e: FetchEventLike) => void): void;
  addEventListener(type: 'message', cb: (e: MessageEventLike) => void): void;
}

const sw = self as unknown as WorkerScope;
const PREFIX = 'holdumb-';
const CACHE = PREFIX + __VERSION__;
const urls = __PRECACHE__.map((p) => new URL(p, sw.location.href).href);
const indexUrl = new URL('./index.html', sw.location.href).href;

sw.addEventListener('install', (event) => {
  // Note: no automatic skipWaiting; the app shows "Update available" and posts SKIP_WAITING.
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(urls.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('message', (event) => {
  if (
    event.data === 'SKIP_WAITING' ||
    (event.data as { type?: string } | null)?.type === 'SKIP_WAITING'
  ) {
    void sw.skipWaiting();
  }
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== new URL(sw.location.href).origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        // Offline navigation fallback: serve the app shell.
        if (req.mode === 'navigate') {
          const shell = await cache.match(indexUrl);
          if (shell) return shell;
        }
        throw err;
      }
    }),
  );
});
