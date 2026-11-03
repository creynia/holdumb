// The Play table's quick options (I090, ux-ev design 3.2 B): Show EV as three segments and a
// Confirm box. They are the persisted settings themselves (not a session override), so More ->
// Settings always shows what the table is doing.
import { useId } from 'preact/hooks';
import { useStore } from '../context';
import type { Settings } from '../settings';

const EV_SEGMENTS: readonly { value: Settings['evMode']; label: string }[] = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'never', label: 'Off' },
];

const SCOPE_TEXT: Record<Exclude<Settings['confirmOn'], 'never'>, string> = {
  all: 'All bets',
  costly: 'Medium and bad bets',
  blunder: 'Only bad bets',
};

/** The bets the Confirm box asks about when it is on. */
function confirmScope(s: Settings): Exclude<Settings['confirmOn'], 'never'> {
  return s.confirmOn === 'never' ? 'all' : s.confirmOn;
}

export function TableOptions() {
  const store = useStore();
  const s = store.settings;
  const hintId = useId();
  const scope = confirmScope(s);
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
            store.updateSettings({ confirmOn: e.currentTarget.checked ? scope : 'never' })
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
