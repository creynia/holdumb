// I078 Watch: the controls (under the table, with the sandbox tools) and the status strip that takes
// the chip rack's place while the table plays itself. Neither covers the felt or moves the ActionBar.
import './styles/watch.css';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { WATCH_DEFAULT_HANDS, WATCH_HAND_OPTIONS } from './watch';
import type { WatchHandle } from './hooks/useWatch';
import { OPTION_LABELS } from './text';

const plural = (n: number) => `${n} hand${n === 1 ? '' : 's'}`;

/** One line on how the last run ended. */
export function watchSummary(w: Pick<WatchHandle, 'end' | 'played' | 'message'>): string | null {
  switch (w.end) {
    case 'done':
      return `Watched ${plural(w.played)} of perfect play.`;
    case 'stopped':
      return `Stopped after ${plural(w.played)}.`;
    case 'no-ev':
      return `Stopped after ${plural(w.played)}: the exact EV for that decision is not available.`;
    case 'blocked':
      return `Stopped after ${plural(w.played)}${w.message ? `: ${w.message}` : '.'}`;
    default:
      return null;
  }
}

export interface WatchControlsProps {
  watch: WatchHandle;
  disabled?: boolean;
}

/** Idle: pick how many hands (up to 30) and start. */
export function WatchControls({ watch, disabled }: WatchControlsProps) {
  const [hands, setHands] = useState<number>(WATCH_DEFAULT_HANDS);
  const summary = watchSummary(watch);
  return (
    <div class="sim-watch-controls" data-testid="watch-controls">
      <label>
        Hands
        <select
          value={String(hands)}
          disabled={watch.running}
          onChange={(e) => setHands(Number(e.currentTarget.value))}
          data-testid="watch-hands"
        >
          {WATCH_HAND_OPTIONS.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        class="sim-btn sim-btn-secondary"
        disabled={disabled || watch.running}
        onClick={() => watch.start(hands)}
        data-testid="watch-start"
      >
        Watch perfect play
      </button>
      {summary && !watch.running ? (
        <p class="sim-watch-summary" role="status" data-testid="watch-summary">
          {summary}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Running: which hand, what perfect play does next, Pause / Resume and Stop. It sits where the chip
 * rack goes (portrait: below the ActionBar; landscape: the rail's scrolling body), so it covers
 * nothing and moves nothing. Not a live region: each watched hand is announced once, through the
 * table's toast (see watchNarration), which renders below the controls while Watch runs.
 */
export function WatchStatus({
  watch,
  orientation,
  toast,
}: {
  watch: WatchHandle;
  orientation: 'portrait' | 'landscape';
  /** The table's toast while Watch runs: below the controls, so it never pushes Stop down. */
  toast?: ComponentChildren;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Watch is started from below the table: scroll the window (never the layout, never the rail's
    // own scroller) so the strip sits at the bottom of the screen, clear of the tab bar (its scroll
    // margin), without taking the top of the table off screen.
    const node = el.current;
    if (!node || typeof window.scrollBy !== 'function') return;
    const r = node.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(node).scrollMarginBottom) || 0;
    const top = node.closest('.sim-table')?.getBoundingClientRect().top ?? r.top;
    window.scrollBy(0, Math.min(r.bottom + margin - window.innerHeight, top));
  }, []);
  return (
    <div class={`sim-watch-status sim-watch-${orientation}`} data-testid="watch-status" ref={el}>
      <div class="sim-watch-row">
        <p class="sim-watch-line">
          <span class="sim-watch-hand">
            Perfect play · hand {Math.min(watch.hand, watch.of)} of {watch.of}
            {watch.paused ? ' · paused' : ''}
          </span>
          <span class="sim-watch-option" data-testid="watch-option">
            {watch.option ? OPTION_LABELS[watch.option] : ' '}
          </span>
        </p>
        <div class="sim-watch-buttons">
          <button
            type="button"
            class="sim-btn sim-btn-secondary"
            onClick={watch.paused ? watch.resume : watch.pause}
            data-testid="watch-pause"
          >
            {watch.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            class="sim-btn sim-btn-secondary"
            onClick={watch.stop}
            data-testid="watch-stop"
          >
            Stop
          </button>
        </div>
      </div>
      {toast}
    </div>
  );
}
