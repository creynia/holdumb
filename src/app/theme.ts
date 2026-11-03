import type { Settings } from './settings';

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Reduced motion (setting or OS) forces instant. */
export function effectiveSpeed(s: Settings): Settings['animationSpeed'] {
  return s.reduceMotion || prefersReducedMotion() ? 'instant' : s.animationSpeed;
}

const CHROME_LIGHT = '#f6f4ee';
const CHROME_DARK = '#0e1620';

/** Browser/PWA chrome colour follows the forced theme; 'system' restores the OS media pair. */
export function syncThemeColor(theme: Settings['theme'], doc: Document = document) {
  const light = doc.getElementById('theme-color-light');
  const dark = doc.getElementById('theme-color-dark');
  if (!light || !dark) return;
  if (theme === 'system') {
    light.setAttribute('content', CHROME_LIGHT);
    light.setAttribute('media', '(prefers-color-scheme: light)');
    dark.setAttribute('content', CHROME_DARK);
    dark.setAttribute('media', '(prefers-color-scheme: dark)');
    return;
  }
  const colour = theme === 'dark' ? CHROME_DARK : CHROME_LIGHT;
  for (const m of [light, dark]) {
    m.setAttribute('content', colour);
    m.removeAttribute('media');
  }
}

export function applyTheme(s: Settings, root: HTMLElement = document.documentElement) {
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  syncThemeColor(s.theme, root.ownerDocument ?? document);
  root.setAttribute('data-motion', effectiveSpeed(s) === 'instant' ? 'reduce' : 'full');
  root.setAttribute('data-fourcolor', String(s.fourColorDeck));
}

/** Calls `cb` when the OS reduced-motion preference changes. Returns an unsubscribe function. */
export function onReducedMotionChange(cb: () => void): () => void {
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  } catch {
    return () => {};
  }
}

/** Settings as the Simulator reads them (OS reduced motion forces instant). */
export function simSettings(s: Settings): Settings {
  return { ...s, animationSpeed: effectiveSpeed(s) };
}
