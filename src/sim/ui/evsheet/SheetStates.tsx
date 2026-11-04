// The EV sheet's loading state (spinner, then a progress bar and skeleton rows after 150 ms),
// moved out of EvSheet.tsx (I082).
import { Say } from '../announcer';

export function SheetLoading({ skel, progress }: { skel: boolean; progress?: number }) {
  return (
    <div class="sim-skeleton" data-testid="ev-loading" aria-busy="true">
      <p class="sim-muted sim-calc">
        <Say text="Calculating." dedupeKey="ev-state" />
        <span class="sim-spinner" aria-hidden="true" />
        Calculating…
      </p>
      {skel ? (
        <>
          <div
            class="sim-progress"
            role="progressbar"
            aria-label="EV progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress ?? 0) * 100)}
          >
            <span style={`width:${Math.round((progress ?? 0) * 100)}%`} />
          </div>
          <span class="sim-skel-row" />
          <span class="sim-skel-row" />
        </>
      ) : null}
    </div>
  );
}
