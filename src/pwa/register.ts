// Service worker registration + update flow. No-op in dev, in the single-file build,
// and on file:// / content:// (protocol check).

type UpdateListener = (apply: () => void) => void;

let waiting: ServiceWorker | null = null;
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

export function registerSW(): void {
  if (__SINGLE_FILE__ || import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return;

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
