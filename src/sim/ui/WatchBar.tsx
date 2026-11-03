// I078 Watch: the controls (under the table, with the sandbox tools) and the status strip that takes
// the chip rack's place while the table plays itself. Neither covers the felt or moves the ActionBar.
import './styles/watch.css';
import { useState } from 'preact/hooks';
import { WATCH_DEFAULT_HANDS, WATCH_HAND_OPTIONS } from './watchCore';
import type { WatchHandle } from './hooks/useWatch';

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
