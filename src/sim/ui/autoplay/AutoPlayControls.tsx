// The auto-play settings grid (strategy, Ante, Trips, hands, sessions, seed, compare), moved out of
// AutoPlayPanel.tsx (I082). The panel owns the state; this only renders it.
import { STRATEGY_CONSTANTS } from '../../strategy/constants';
import { PICKER_GROUPS } from '../../strategy/presets';
import type { StrategyId, StrategySpec } from '../../strategy/types';
import type { SimSettings } from '../types';
import { GROUP_LABEL, alwaysMaxNote } from './helpers';

/**
 * Renders the grid. A plain function with positional arguments rather than a component with
 * props: the bundle then carries no prop-name strings for this split (I082, single-file budget).
 */
export function autoPlayControls(
  id: StrategyId,
  setId: (id: StrategyId) => void,
  spec: StrategySpec,
  settings: SimSettings,
  anteDollars: number,
  setAnte: (v: number) => void,
  tripsDollars: number,
  setTrips: (v: number) => void,
  hands: number,
  setHands: (v: number) => void,
  handChoices: readonly number[],
  sessions: number,
  setSessions: (v: number) => void,
  sessionChoices: readonly number[],
  seed: number,
  setSeed: (v: number) => void,
  cmp: boolean,
  setCmp: (v: boolean) => void,
) {
  const field = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontSize: '13px',
    minWidth: 0,
  } as const;
  const control = { width: '100%', minWidth: 0, boxSizing: 'border-box' } as const;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
      <label style={{ ...field, gridColumn: '1 / -1' }}>
        Strategy
        <select
          style={control}
          value={id}
          onChange={(e) => setId(e.currentTarget.value as StrategyId)}
        >
          {PICKER_GROUPS.map((g) => (
            <optgroup key={g.lens} label={GROUP_LABEL[g.lens]}>
              {g.ids.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_CONSTANTS[s].name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {id === 'always-max' ? (
          <small data-testid="strategy-note" style={{ display: 'block', marginTop: '4px' }}>
            {alwaysMaxNote(
              { ...spec, trips: 0 },
              { tripsPaytable: settings.paytable },
              settings.handsPerHour,
            )}
          </small>
        ) : null}
      </label>
      <label style={field}>
        Ante ($)
        <input
          style={control}
          type="number"
          min={1}
          step={1}
          value={anteDollars}
          onInput={(e) => setAnte(Number(e.currentTarget.value))}
        />
      </label>
      <label style={field}>
        Trips ($)
        <input
          style={control}
          type="number"
          min={0}
          step={1}
          value={tripsDollars}
          onInput={(e) => setTrips(Number(e.currentTarget.value))}
        />
      </label>
      <label style={field}>
        Hands{hands === settings.handsPerHour ? ' (one hour)' : ''}
        <select
          style={control}
          value={String(hands)}
          onChange={(e) => setHands(Number(e.currentTarget.value))}
        >
          {handChoices.map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString('en-US')}
            </option>
          ))}
        </select>
      </label>
      <label style={field}>
        Sessions
        <select
          style={control}
          value={String(sessions)}
          onChange={(e) => setSessions(Number(e.currentTarget.value))}
        >
          {sessionChoices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label style={field}>
        Seed
        <input
          style={control}
          type="number"
          value={seed}
          onInput={(e) => setSeed(Number(e.currentTarget.value) | 0)}
        />
      </label>
      <label style={{ ...field, flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
        <input type="checkbox" checked={cmp} onChange={(e) => setCmp(e.currentTarget.checked)} />
        Compare (same cards)
      </label>
    </div>
  );
}
