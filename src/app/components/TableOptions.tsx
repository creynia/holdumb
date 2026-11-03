// The Play table's quick options (I090, ux-ev design 3.2 B): Show EV as three segments and a
// Confirm box. They are the persisted settings themselves (not a session override), so More ->
// Settings always shows what the table is doing.
import { useId } from 'preact/hooks';
import { useStore } from '../context';
import { withConfirmEnabled } from '../settings';
import type { Settings } from '../settings';

const EV_SEGMENTS: readonly { value: Settings['evMode']; label: string }[] = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'never', label: 'Off' },
];

const SCOPE_TEXT: Record<Settings['confirmTiers'], string> = {
  all: 'All bets',
  costly: 'Medium and bad bets',
  blunder: 'Only bad bets',
};

export function TableOptions() {
  const store = useStore();
  const s = store.settings;
  const hintId = useId();
  // While Confirm is on its scope is the effective policy; off, the one it turns back on (D40).
  const scope = s.confirmOn === 'never' ? s.confirmTiers : s.confirmOn;
  return (
    <div class="sim-options" data-testid="table-options">
      <fieldset class="sim-seg">
        <legend>
          <span aria-hidden="true">EV</span>
          <span class="sr">Show EV</span>
        </legend>
        {EV_SEGMENTS.map((o) => (
          <label key={o.value} class="sim-seg-opt">
            <input
              type="radio"
              name="ev-mode"
              value={o.value}
              checked={s.evMode === o.value}
              onChange={() => store.updateSettings({ evMode: o.value })}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <label class="sim-options-confirm">
        <input
          type="checkbox"
          aria-label="Confirm bets"
          aria-describedby={hintId}
          checked={s.confirmOn !== 'never'}
          onChange={(e) =>
            store.updateSettings(
              e.currentTarget.checked
                ? withConfirmEnabled(s, true)
                : // Keep the scope that was on, so ticking again restores it (D40).
                  { ...withConfirmEnabled(s, false), confirmTiers: scope },
            )
          }
          data-testid="confirm-toggle"
        />
        <span>Confirm</span>
        <span id={hintId} class="sr">
          Asks before a bet goes in: {SCOPE_TEXT[scope]}.
        </span>
      </label>
    </div>
  );
}
