// The EV sheet's mistake warning and its buttons (Continue, or Cancel and Confirm / Do it
// anyway), moved out of EvSheet.tsx (I082).
import type { DecisionOption } from '../../math';

/**
 * Renders the warning and buttons. Positional arguments, not props, so the split adds no prop-name
 * strings to the bundle (I082, single-file budget). `opt`: the chosen option when its warning shows.
 */
export function sheetActions(
  opt: DecisionOption | null,
  best: DecisionOption | null,
  readOnly: boolean,
  confirmed: boolean,
  checking: boolean,
  danger: boolean,
  label: string,
  confirm: () => void,
  onCancel: (() => void) | undefined,
  onContinue: (() => void) | undefined,
) {
  return (
    <>
      {opt ? (
        <p
          class="sim-warn"
          role="alert"
          data-testid={opt.tier === 'blunder' ? 'blunder-warning' : 'mistake-warning'}
        >
          This is a {opt.tier === 'blunder' ? 'big mistake' : 'mistake'}
          {best ? `: ${best.label} is the better play` : ''}.
        </p>
      ) : null}

      {readOnly ? null : (
        <div class="sim-evsheet-actions">
          {confirmed ? (
            <button
              type="button"
              class="sim-btn sim-btn-primary"
              onClick={onContinue ?? onCancel}
              data-continue
            >
              Continue
            </button>
          ) : (
            <>
              <button type="button" class="sim-btn sim-btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              {checking ? null : (
                <button
                  type="button"
                  class={`sim-btn ${danger ? 'sim-btn-danger' : 'sim-btn-primary'}`}
                  onClick={confirm}
                  data-testid="confirm"
                >
                  {danger ? 'Do it anyway' : `Confirm ${label}`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
