// I078 Watch: the status strip shown while the table plays itself. Loaded with the loop when Watch
// starts (Simulator imports it on demand), so it is not part of the first-paint JS.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { WatchHandle } from './hooks/useWatch';
import { OPTION_LABELS } from './text';

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
