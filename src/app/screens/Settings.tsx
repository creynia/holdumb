import { useState } from 'preact/hooks';
import { PAYTABLE_PRESET_IDS, TRIPS_PAYTABLES, formatPct } from '../../sim';
import type { PaytablePresetId } from '../../sim';
import { TRIPS_EDGE } from '../bets';
import { Link } from '../components/Link';
import { useStore } from '../context';
import { LIMITS, decodeImport } from '../storage';
import type { Settings as SettingsData } from '../settings';
import { effectiveSpeed } from '../theme';

type Speed = SettingsData['animationSpeed'];
type Theme = SettingsData['theme'];

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
        <Check
          label="Practice mode: hide EV until you confirm"
          checked={s.practice}
          onChange={(v) => set({ practice: v })}
        />
        <Check
          label="Confirm costly moves (ask twice before a big mistake)"
          checked={s.confirmCostlyMoves}
          onChange={(v) => set({ confirmCostlyMoves: v })}
        />
        <Check
          label="Skip the EV preview and act directly"
          checked={s.skipPreview}
          onChange={(v) => set({ skipPreview: v })}
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
        {!store.persistent && (
          <p role="alert" class="warn">
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
        {msg && <p role="status">{msg}</p>}
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
