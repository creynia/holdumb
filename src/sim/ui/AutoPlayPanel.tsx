// Auto-play (simulator.md §5.4): pick a strategy, ante, Trips, hands and sessions; run the
// `simulate` job through the EvClient; show exact vs simulated figures and the charts.
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMoney } from '../engine/money';
import type { SimulatorEvent } from './types';
import type { SimSettings } from './types';
import type { EvClient, Progress } from '../worker/protocol';
import { PICKER_GROUPS } from '../strategy/presets';
import { STRATEGY_CONSTANTS } from '../strategy/constants';
import { strategyMetrics } from '../strategy/metrics';
import { fracToNumber } from '../strategy/fraction';
import { formatPct } from '../engine/money';
import type { TableRules } from '../engine/types';
import type { SimulateResult, StrategyId, StrategySpec } from '../strategy/types';
import { BankrollChart } from './BankrollChart';
import { OutcomeHistogram } from './OutcomeHistogram';

const HAND_CHOICES = [30, 300, 3000] as const;
const GROUP_LABEL = {
  perfect: 'Perfect play (Expert)',
  practical: 'Practical',
  fun: 'Fun',
} as const;

/**
 * The three net figures as shown, in whole cents. Luck is the difference of the two shown
 * figures, so Expected + Luck = Actual to the cent (rounding each figure on its own broke that).
 */
export function shownNet(
  exactNet: number,
  simNet: number,
): { expected: number; actual: number; luck: number } {
  const expected = Math.round(exactNet);
  const actual = Math.round(simNet);
  return { expected, actual, luck: actual - expected };
}

export interface AutoPlayPanelProps {
  evClient: EvClient;
  settings: SimSettings;
  defaultStrategy?: StrategySpec;
  /** Strategies to run alongside (compare mode). */
  compare?: StrategySpec[];
  /** A scene may offer fewer choices (scene.autoPlay.handOptions / sessions). */
  handOptions?: number[];
  sessionOptions?: number[];
  /** A scene's starting stake and seed (the lesson copy quotes results for these). */
  bankroll?: number;
  seed?: number;
  onEvent?: (e: SimulatorEvent) => void;
}

/**
 * The note under the strategy select. Always bet 4x has the same exact loss per hand as Never
 * fold but twice the money in action, so half the element of risk. Figures come from
 * strategyMetrics, so they stay right if the tables change.
 */
export function alwaysMaxNote(
  spec: StrategySpec,
  rules: Partial<TableRules> | undefined,
  handsPerHour: number,
): string {
  const never = strategyMetrics({ ...spec, id: 'never-fold' }, rules, handsPerHour);
  const always = strategyMetrics({ ...spec, id: 'always-max' }, rules, handsPerHour);
  return `Same expected loss per hand as Never fold (${formatPct(never.edgePerAnte, 2)} of the Ante), but twice the money in action, so a lower element of risk (${formatPct(always.elementOfRisk, 2)} vs ${formatPct(never.elementOfRisk, 2)}).`;
}

export function AutoPlayPanel({
  evClient,
  settings,
  defaultStrategy,
  compare,
  handOptions,
  sessionOptions,
  bankroll: sceneBankroll,
  seed: sceneSeed,
  onEvent,
}: AutoPlayPanelProps) {
  const handChoices: readonly number[] = handOptions?.length
    ? handOptions
    : [...HAND_CHOICES, 10000];
  const sessionChoices: readonly number[] = sessionOptions?.length ? sessionOptions : [1, 100];
  const [id, setId] = useState<StrategyId>(
    !defaultStrategy || defaultStrategy.id === 'perfect' ? 'expert' : defaultStrategy.id,
  );
  const [anteDollars, setAnte] = useState((defaultStrategy?.ante ?? settings.anteUnitCents) / 100);
  const [tripsDollars, setTrips] = useState((defaultStrategy?.trips ?? 0) / 100);
  const [hands, setHands] = useState<number>(
    handOptions?.length ? handOptions[0]! : settings.handsPerHour,
  );
  const [sessions, setSessions] = useState(sessionOptions?.length ? sessionOptions[0]! : 1);
  const [seed, setSeed] = useState(sceneSeed ?? 1);
  const [cmp, setCmp] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const ante = Math.max(100, Math.round(anteDollars) * 100);
  const trips = Math.max(0, Math.round(tripsDollars) * 100);
  const spec: StrategySpec = { id, ante, trips };
  const bankroll = sceneBankroll ?? ante * 100 + trips * 50;
  const metrics = strategyMetrics(
    spec,
    { tripsPaytable: settings.paytable },
    settings.handsPerHour,
  );
  const hourCents = fracToNumber(metrics.evPerHourCents);

  async function run(): Promise<void> {
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 1 });
    const others: StrategySpec[] = cmp
      ? (compare ?? [{ id: id === 'basic' ? 'expert' : 'basic', ante, trips }]).map((s) => ({
          ...s,
          ante,
          trips,
        }))
      : [];
    try {
      const res = await evClient.run(
        'simulate',
        {
          strategy: spec,
          hands,
          sessions,
          seed,
          bankroll,
          rules: { tripsPaytable: settings.paytable },
          compare: others,
        },
        { key: 'auto-play', signal: ac.signal, onProgress: setProgress },
      );
      setResult(res);
      setProgress(null);
      onEvent?.({ type: 'auto-play-completed', hands, strategy: id });
    } catch (e) {
      setProgress(null);
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  }

  const main = result?.series[0];
  // Busted or stopped sessions play fewer hands: expected result = per-hand EV x hands played.
  const perHand = main ? main.expected[1]! - main.expected[0]! : 0;
  const exactNet = main ? perHand * (main.handsPlayed / sessions) : 0;
  const simNet = main ? main.meanFinal - bankroll : 0;
  const shown = shownNet(exactNet, simNet);
  const running = progress !== null;
  const field = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontSize: '13px',
    minWidth: 0,
  } as const;
  const control = { width: '100%', minWidth: 0, boxSizing: 'border-box' } as const;
  return (
    <section
      data-testid="auto-play"
      aria-label="Auto-play"
      style={{ display: 'grid', gap: '12px' }}
    >
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}
      >
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
      <p style={{ margin: 0, fontSize: '13px' }}>
        Exact: {formatMoney(Math.round(hourCents), { sign: true })} per hour at {formatMoney(ante)}{' '}
        Ante ({settings.handsPerHour} hands/hour, house edge{' '}
        {(fracToNumber(metrics.edgePerAnte) * 100).toFixed(2)}% of the Ante).
      </p>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button type="button" class="btn" onClick={() => void run()} disabled={running}>
          Run
        </button>
        {running ? (
          <>
            <progress value={progress.done} max={progress.total} aria-label="Simulation progress" />
            <button type="button" class="btn btn-ghost" onClick={() => ctl.current?.abort()}>
              Cancel
            </button>
          </>
        ) : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {main && result ? (
        <div data-testid="auto-play-result" style={{ display: 'grid', gap: '8px' }}>
          <BankrollChart series={result.series} bankroll={bankroll} hands={hands} />
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
            <li>Expected result (exact): {formatMoney(shown.expected, { sign: true })}</li>
            <li>
              Actual (≈ simulated{sessions > 1 ? ' average' : ''}):{' '}
              {formatMoney(shown.actual, { sign: true })}
              {sessions > 1 ? ` ± ${formatMoney(Math.round(main.meanFinalCi95))}` : ''}
            </li>
            <li>Luck: {formatMoney(shown.luck, { sign: true })}</li>
            {sessions >= 10 ? (
              <>
                <li>Chance of finishing ahead (≈): {(main.probAhead * 100).toFixed(0)}%</li>
                <li>Busted (≈): {(main.bustRate * 100).toFixed(0)}% of sessions</li>
              </>
            ) : (
              <li>
                1 session: {simNet >= 0 ? 'finished ahead' : 'finished behind'} (one run says little
                about the odds; try 100 sessions)
              </li>
            )}
            {trips > 0 ? <li>Trips hits: {main.tripsHits}</li> : null}
            <li>Blind bonus hits: {main.blindBonusHits}</li>
          </ul>
          <OutcomeHistogram series={main} />
        </div>
      ) : null}
    </section>
  );
}
