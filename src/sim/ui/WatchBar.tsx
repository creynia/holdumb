// I078 Watch: the controls (under the table, with the sandbox tools) and the live status strip that
// takes the chip rack's place while the table plays itself. Neither covers the felt or moves the
// ActionBar: the strip sits below it, where the rack was.
import './styles/watch.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import { WATCH_HAND_OPTIONS, WATCH_MAX_HANDS } from './watch';
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
  const [hands, setHands] = useState<number>(WATCH_MAX_HANDS);
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
 * Running: which hand, what perfect play does next, and Stop. Portrait: in the chip rack's place
 * below the ActionBar. Landscape: a bar right above the table (the rail has no room for a 44 px
 * button under three decision buttons at 667x375, and nothing may cover the felt). Watch is started
 * from below the table, so on mount the page (never the rail) scrolls the play back into view: in
 * portrait the strip sits at the bottom, clear of the app's tab bar via its scroll margin.
 */
export function WatchStatus({
  watch,
  orientation,
}: {
  watch: WatchHandle;
  orientation: 'portrait' | 'landscape';
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    el.current?.scrollIntoView?.({ block: orientation === 'landscape' ? 'start' : 'end' });
  }, []);
  return (
    <div class={`sim-watch-status sim-watch-${orientation}`} data-testid="watch-status" ref={el}>
      <p class="sim-watch-line" aria-live="polite">
        <span class="sim-watch-hand">
          Perfect play · hand {Math.min(watch.hand, watch.of)} of {watch.of}
        </span>
        <span class="sim-watch-option" data-testid="watch-option">
          {watch.option ? OPTION_LABELS[watch.option] : ' '}
        </span>
      </p>
      <button
        type="button"
        class="sim-btn sim-btn-secondary"
        onClick={watch.stop}
        data-testid="watch-stop"
      >
        Stop
      </button>
    </div>
  );
}
