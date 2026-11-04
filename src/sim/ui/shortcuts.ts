// Keyboard shortcuts on the table (I047). One map drives both the key handler and the buttons'
// aria-keyshortcuts, so they cannot drift apart.
import type { OptionKey } from '../scene';

/** The key for each decision option (aria-keyshortcuts value; letters match either case). */
export const OPTION_SHORTCUT: Readonly<Record<OptionKey, string>> = {
  'play-4': '4',
  'play-3': '3',
  'play-2': '2',
  'play-1': '1',
  check: 'C',
  fold: 'F',
};
/** Deal and Rebet & Deal; Enter also deals when focus is on the page, not on a control. */
export const DEAL_SHORTCUT = 'D';

export type Shortcut = { kind: 'option'; option: OptionKey } | { kind: 'deal' };

/** The shortcut a key press asks for, or null (typing, a modifier, a repeat, another key). */
export function shortcutOf(e: KeyboardEvent): Shortcut | null {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target;
  if (
    t instanceof HTMLElement &&
    (t.isContentEditable || t.closest('input, textarea, select, [contenteditable]'))
  )
    return null;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key === DEAL_SHORTCUT) return { kind: 'deal' };
  // Enter on a focused button already presses that button.
  if (key === 'Enter' && !(t instanceof HTMLElement && t.closest('button, a, summary')))
    return { kind: 'deal' };
  for (const [option, k] of Object.entries(OPTION_SHORTCUT) as [OptionKey, string][])
    if (k === key) return { kind: 'option', option };
  return null;
}

/**
 * Presses the matching enabled button inside one table, exactly as a tap would, so the one-tap,
 * confirm and double-tap rules (I089) and the scene's allowed options all apply unchanged; an
 * option the street or the scene does not offer has no button and the key does nothing.
 * Returns whether a button was pressed.
 */
export function pressShortcut(root: ParentNode, s: Shortcut): boolean {
  const sel =
    s.kind === 'deal'
      ? '.sim-actions button[data-action="deal"], .sim-actions button[data-action="rebet"]'
      : `.sim-actions button[data-option="${s.option}"]`;
  const btn = root.querySelector<HTMLButtonElement>(sel);
  if (!btn || btn.disabled) return false;
  btn.click();
  return true;
}
