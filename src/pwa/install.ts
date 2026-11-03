// "Install app" support. Captures the browser's beforeinstallprompt so a button can offer it;
// nothing happens in the single-file build, which is already a local file.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined' && !__SINGLE_FILE__) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** True when the app already runs as an installed app (no install offer then). */
export function isStandalone(): boolean {
  const mq = typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)') : null;
  return !!mq?.matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function installAvailable(): boolean {
  return !__SINGLE_FILE__ && deferred !== null && !isStandalone();
}

/** Called when the install offer appears or disappears. */
export function onInstallAvailable(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install dialog. The offer is used up once asked. */
export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  emit();
  await e.prompt();
}
