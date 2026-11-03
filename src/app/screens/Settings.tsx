import { Say } from '../../sim';
import { useEffect, useState } from 'preact/hooks';
import { PAYTABLE_PRESET_IDS, TRIPS_PAYTABLES, formatPct } from '../../sim';
import type { PaytablePresetId } from '../../sim';
import { TRIPS_EDGE } from '../bets';
import { Link } from '../components/Link';
import { useStore } from '../context';
import { LIMITS, decodeImport } from '../storage';
import type { ConfirmTiers, Settings as SettingsData } from '../settings';
import { effectiveSpeed } from '../theme';
import { confirmEnabled, withConfirmEnabled, withConfirmTiers } from '../settings';
import { storageState, type StorageState } from '../persist';

type Speed = SettingsData['animationSpeed'];
type Theme = SettingsData['theme'];

const EV_MODE_OPTIONS: readonly Choice<SettingsData['evMode']>[] = [
  {
    value: 'before',
    label: 'Before I choose',
    hint: 'Each option shows its EV; the best is marked.',
  },
  {
    value: 'after',
    label: 'After I choose',
    hint: 'Choose blind, then see how your move compared.',
  },
  { value: 'never', label: 'Off', hint: 'No EV at all: just play.' },
];

/** Which bets the Confirm box asks about (D40); the box itself is on or off. */
const CONFIRM_TIER_OPTIONS: readonly Choice<ConfirmTiers>[] = [
  { value: 'all', label: 'All bets', hint: 'Every move asks first.' },
  {
    value: 'costly',
    label: 'Medium and bad bets',
    hint: 'Mistake or Big mistake: it costs more than 0.10 Ante.',
  },
  { value: 'blunder', label: 'Only bad bets', hint: 'Big mistake: it costs more than 0.50 Ante.' },
];

interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
}

/** A radio group: every option is one tap (D39). */
function Radios<T extends string>(props: {
  legend: string;
  name: string;
  value: T;
  options: readonly Choice<T>[];
  /** A line under the legend that applies to the whole group. */
  note?: string;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset class="radios" disabled={props.disabled}>
      <legend>{props.legend}</legend>
      {props.note && (
        <p class="muted radios-note" id={`${props.name}-note`}>
          {props.note}
        </p>
      )}
      {props.options.map((o) => {
        const hintId = `${props.name}-${o.value}-hint`;
        return (
          <label key={o.value} class="radio">
            <input
              type="radio"
              name={props.name}
              value={o.value}
              checked={props.value === o.value}
              aria-describedby={hintId}
              disabled={props.disabled}
              onChange={() => props.onChange(o.value)}
            />
            <span>
              {o.label}
              <small id={hintId} class="muted">
                {o.hint}
              </small>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="check">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      {props.label}
    </label>
  );
}

/** A whole-number field: clamps to [min, max] on commit and re-syncs the input when it differs. */
function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
}) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => {
          const input = e.currentTarget;
          const v = Number(input.value);
          if (input.value.trim() === '' || !Number.isFinite(v)) {
            input.value = String(props.value);
            return;
          }
          const n = Math.min(Math.max(Math.round(v), props.min), props.max);
          if (String(n) !== input.value) input.value = String(n);
          props.onCommit(n);
        }}
      />
    </label>
  );
}

export function Settings() {
  const store = useStore();
  const s = store.settings;
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const forcedInstant = effectiveSpeed(s) === 'instant' && s.animationSpeed !== 'instant';
  const set = (p: Partial<SettingsData>) => store.updateSettings(p);
  // 'pending' keeps the line's height reserved until the check resolves (no layout shift).
  const [storage, setStorage] = useState<StorageState | 'pending'>('pending');
  useEffect(() => {
    void storageState().then(setStorage);
  }, []);
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Settings</h1>

      <section class="card form" aria-label="Table">
        <h2>Table</h2>
        <label>
          Trips paytable
          <select
            value={s.paytable}
            onChange={(e) => set({ paytable: e.currentTarget.value as PaytablePresetId })}
          >
            {PAYTABLE_PRESET_IDS.map((id) => {
              const edge = TRIPS_EDGE[id];
              return (
                <option key={id} value={id}>
                  {TRIPS_PAYTABLES[id].label}
                  {edge ? ` (edge ${formatPct(edge, 2)})` : ''}
                  {id === 'trips-8-6-5' ? ' default' : ''}
                </option>
              );
            })}
          </select>
        </label>
        <NumberField
          label="Ante unit ($)"
          value={Math.round(s.anteUnitCents / 100)}
          min={LIMITS.anteUnitDollars.min}
          max={LIMITS.anteUnitDollars.max}
          step={5}
          onCommit={(n) => set({ anteUnitCents: n * 100 })}
        />
        <NumberField
          label="Default bankroll ($)"
          value={Math.round(s.defaultBankrollCents / 100)}
          min={LIMITS.bankrollDollars.min}
          max={LIMITS.bankrollDollars.max}
          step={50}
          onCommit={(n) => set({ defaultBankrollCents: n * 100 })}
        />
        <NumberField
          label="Hands per hour"
          value={s.handsPerHour}
          min={LIMITS.handsPerHour.min}
          max={LIMITS.handsPerHour.max}
          step={5}
          onCommit={(n) => set({ handsPerHour: n })}
        />
        <Radios
          legend="Show EV"
          name="ev-mode"
          value={s.evMode}
          options={EV_MODE_OPTIONS}
          onChange={(v) => set({ evMode: v })}
        />
        <div class="check-row">
          <label class="check">
            <input
              type="checkbox"
              checked={confirmEnabled(s)}
              aria-describedby="confirm-bets-hint"
              onChange={(e) => set(withConfirmEnabled(s, e.currentTarget.checked))}
            />
            <span>Confirm my bets</span>
          </label>
          <p class="muted" id="confirm-bets-hint">
            Asks before a bet goes in. Works with EV on or off.
          </p>
        </div>
        <Radios
          legend="Which bets"
          name="confirm-tiers"
          value={s.confirmTiers}
          options={CONFIRM_TIER_OPTIONS}
          disabled={!confirmEnabled(s)}
          onChange={(v) => set(withConfirmTiers(s, v))}
        />
      </section>

      <section class="card form" aria-label="Look and feel">
        <h2>Look and feel</h2>
        <label>
          Theme
          <select value={s.theme} onChange={(e) => set({ theme: e.currentTarget.value as Theme })}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Animation speed
          <select
            value={forcedInstant ? 'instant' : s.animationSpeed}
            disabled={forcedInstant}
            onChange={(e) => set({ animationSpeed: e.currentTarget.value as Speed })}
          >
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
            <option value="instant">
              {forcedInstant ? 'Instant (reduced motion)' : 'Instant'}
            </option>
          </select>
        </label>
        <Check
          label="Reduce motion (always instant; your device setting is honoured too)"
          checked={s.reduceMotion}
          onChange={(v) => set({ reduceMotion: v })}
        />
        <Check
          label="Four-colour deck"
          checked={s.fourColorDeck}
          onChange={(v) => set({ fourColorDeck: v })}
        />
      </section>

      <section class="card form" aria-label="Your progress">
        <h2>Your progress</h2>
        <p class="muted storage-line" data-testid="storage-state">
          {storage === 'persistent' && 'Storage: persistent'}
          {storage === 'best-effort' &&
            'Storage: may be cleared by the browser. Install the app to keep progress.'}
        </p>
        {!store.persistent && (
          <p class="warn">
            <Say
              text="Progress will not be saved in this copy. Use Export to keep it."
              politeness="assertive"
              dedupeKey="unsaved"
            />
            Progress will not be saved in this copy. Use Export to keep it.
          </p>
        )}
        <div class="row">
          <button
            type="button"
            class="btn"
            onClick={() => {
              setCode(store.exportCode());
              setMsg('Copy this code somewhere safe. Paste it on another device to restore.');
            }}
          >
            Export
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            disabled={code.trim() === '' || confirmImport}
            onClick={() => {
              if (decodeImport(code)) {
                setMsg('');
                setConfirmImport(true);
              } else setMsg('That code is not valid.');
            }}
          >
            Import
          </button>
        </div>
        <textarea
          rows={3}
          readOnly={confirmImport}
          aria-label="Progress code"
          placeholder="Progress code"
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
        />
        {confirmImport && (
          <div class="row">
            <span>Replace your current progress?</span>
            <button
              type="button"
              class="btn btn-danger"
              onClick={() => {
                setMsg(store.importCode(code) ? 'Progress imported.' : 'That code is not valid.');
                setConfirmImport(false);
              }}
            >
              Yes, replace
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => setConfirmImport(false)}>
              Cancel
            </button>
          </div>
        )}
        {msg && (
          <p data-testid="settings-msg">
            <Say text={msg} dedupeKey="settings" />
            {msg}
          </p>
        )}
        {confirmReset ? (
          <div class="row">
            <span>Erase all lesson and drill progress?</span>
            <button
              type="button"
              class="btn btn-danger"
              onClick={() => {
                store.reset();
                setConfirmReset(false);
                setMsg('Progress reset.');
              }}
            >
              Yes, reset
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" class="btn btn-danger" onClick={() => setConfirmReset(true)}>
            Reset progress
          </button>
        )}
      </section>
    </div>
  );
}
