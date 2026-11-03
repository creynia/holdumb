// Service worker registration + update flow. No-op in dev, in the single-file build,
// and on file:// / content:// (protocol check).

type UpdateListener = (apply: () => void) => void;

let waiting: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<UpdateListener>();

function applyUpdate(): void {
  waiting?.postMessage('SKIP_WAITING');
}

function notify(worker: ServiceWorker): void {
  waiting = worker;
  listeners.forEach((l) => l(applyUpdate));
}

/** Subscribe to "a new version is ready"; call `apply()` to activate it (page then reloads). */
export function onUpdateAvailable(listener: UpdateListener): () => void {
  listeners.add(listener);
  if (waiting) listener(applyUpdate);
  return () => listeners.delete(listener);
}

export type UpdateCheck = 'unsupported' | 'update-available' | 'up-to-date' | 'failed';

/**
 * Settings → "Check for updates". Asks the browser to re-fetch sw.js and resolves with the
 * outcome ('unsupported' in dev, the single-file build, file:// and browsers without SW).
 * When an update is found the onUpdateAvailable listeners fire (toast), as for the automatic check.
 */
export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!registration) return 'unsupported';
  try {
    await registration.update();
    const found = registration.waiting ?? registration.installing;
    if (!found || !navigator.serviceWorker.controller) return 'up-to-date';
    if (found.state === 'installed') notify(found);
    else
      await new Promise<void>((done) => {
        found.addEventListener('statechange', () => {
          if (found.state === 'installed') notify(found);
          if (found.state === 'installed' || found.state === 'redundant') done();
        });
      });
    return waiting ? 'update-available' : 'up-to-date';
  } catch {
    return 'failed';
  }
}

const FOREGROUND_CHECK_MS = 60 * 60 * 1000;

/**
 * Returns a function that asks the registration to re-fetch sw.js when the app comes back to the
 * foreground, at most once per hour. A kept-open installed PWA otherwise sees a deploy only on a
 * cold start. Returns true when it called update().
 */
export function makeForegroundChecker(
  current: () => { update: () => Promise<unknown> } | null,
): (now: number) => boolean {
  let last = -Infinity;
  return (now) => {
    const reg = current();
    if (!reg || now - last < FOREGROUND_CHECK_MS) return false;
    last = now;
    void reg.update().catch(() => {
      /* a failed check still uses up this hour; the next check is at the next foreground an hour on */
    });
    return true;
  };
}
const checkOnForeground = makeForegroundChecker(() => registration);

export function registerSW(): void {
  if (__SINGLE_FILE__ || import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkOnForeground(Date.now());
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !waiting) return; // first claim on a fresh install: don't reload
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              notify(installing);
            }
          });
        });
      })
      .catch(() => {
        /* offline support is best-effort */
      });
  });
}

/** Test hook: pretend a new service worker is waiting (the real apply is a no-op). */
export function simulateUpdateAvailable(): void {
  listeners.forEach((l) => l(() => undefined));
}
