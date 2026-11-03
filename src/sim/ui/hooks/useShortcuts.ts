// Keyboard shortcuts on the table (I047): 4/3/2/1 bet, C check, F fold, D (or Enter on the page)
// deals. Keys reach the table while focus is inside it; on Play (the one table on the page) they
// also work with focus on the page body. Nothing fires while an EV sheet is open (it has its own
// keys: Esc closes it) or while typing.
import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';
import { pressShortcut, shortcutOf } from '../shortcuts';

export function useShortcuts(
  root: RefObject<HTMLElement>,
  opts: { global: boolean; blocked: boolean },
): (e: KeyboardEvent) => void {
  const handle = (e: KeyboardEvent) => {
    if (opts.blocked || !root.current) return;
    const s = shortcutOf(e);
    if (s && pressShortcut(root.current, s)) e.preventDefault();
  };
  useEffect(() => {
    if (!opts.global) return;
    const onDoc = (e: KeyboardEvent) => {
      // Only keys aimed at no control: inside the table its own handler already ran.
      if (e.target !== document.body && e.target !== document.documentElement) return;
      handle(e);
    };
    document.addEventListener('keydown', onDoc);
    return () => document.removeEventListener('keydown', onDoc);
  });
  return handle;
}
