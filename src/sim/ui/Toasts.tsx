import './sim.css';

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'good' | 'bad';
  /** What the live region announces instead of the visible text (the visible text is then hidden). */
  spoken?: string;
}

/** Results announced politely; the app decides when to drop them. */
export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss?: (id: number) => void;
}) {
  return (
    <div class="sim-toasts" aria-live="polite" role="log">
      {toasts.map((t) => (
        <div key={t.id} class={`sim-toast sim-toast-${t.tone ?? 'info'}`}>
          <span aria-hidden={t.spoken ? 'true' : undefined}>{t.text}</span>
          {t.spoken ? <span class="sim-sr">{t.spoken}</span> : null}
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
