// The EV sheet's focus handling, moved out of EvSheet.tsx (I082): focus returns to the opener on
// close, the title takes focus when the sheet opens, Continue takes it when the move is revealed,
// Escape cancels and Tab is trapped inside a modal sheet.
import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

const FOCUSABLE =
  'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

export function useSheetFocus(o: {
  rootRef: RefObject<HTMLDivElement>;
  modal: boolean;
  focusOnOpen: boolean | undefined;
  chosen: unknown;
  onCancel: (() => void) | undefined;
}): (e: KeyboardEvent) => void {
  const { rootRef, modal, focusOnOpen, chosen, onCancel } = o;
  // Escape (and closing) return focus to whatever opened the sheet.
  const opener = useRef<Element | null>(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  useEffect(
    () => () => {
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    },
    [],
  );
  useEffect(() => {
    if (modal || focusOnOpen)
      rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [modal, focusOnOpen]);
  // The confirm sheet turns into the reveal in place ('after'): focus moves to Continue, so it
  // never falls back to the page body when the Confirm button goes away.
  const revealed = chosen != null;
  useEffect(() => {
    if (revealed) rootRef.current?.querySelector<HTMLElement>('[data-continue]')?.focus();
  }, [revealed]);

  return (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel?.();
      return;
    }
    if (modal && e.key === 'Tab' && rootRef.current) {
      const els = [...rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !rootRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
}
