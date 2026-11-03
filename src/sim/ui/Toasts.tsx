import './sim.css';
import { useEffect } from 'preact/hooks';
import { announce } from './announcer';

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'good' | 'bad';
  /** What the live region announces instead of the visible text (the visible text is then hidden). */
  spoken?: string;
  /** A button after the text, e.g. Details (I094). */
  action?: { label: string; onClick: () => void };
}

/** Visible results. They are spoken through the app's single announcer, not a live region here. */
export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss?: (id: number) => void;
}) {
  const last = toasts[toasts.length - 1];
  useEffect(() => {
    if (last)
      announce(last.spoken ?? last.text, {
        politeness: last.tone === 'bad' ? 'assertive' : 'polite',
        dedupeKey: 'toast',
      });
  }, [last?.id]);
  return (
    <div class="sim-toasts">
      {toasts.map((t) => (
        <div key={t.id} class={`sim-toast sim-toast-${t.tone ?? 'info'}`}>
          <span aria-hidden={t.spoken ? 'true' : undefined}>{t.text}</span>
          {t.spoken ? <span class="sim-sr">{t.spoken}</span> : null}
          {t.action ? (
            <button
              type="button"
              class="sim-toast-action"
              data-testid="toast-details"
              onClick={t.action.onClick}
            >
              {t.action.label}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              class="sim-toast-x"
              aria-label="Dismiss"
              onClick={() => onDismiss(t.id)}
            >
              <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                <path
                  d="M3 3l8 8M11 3l-8 8"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
