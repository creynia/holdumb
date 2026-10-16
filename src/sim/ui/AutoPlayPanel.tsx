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
import type { SimulateResult, StrategyId, StrategySpec } from '../strategy/types';
import { BankrollChart } from './BankrollChart';
import { OutcomeHistogram } from './OutcomeHistogram';

const HAND_CHOICES = [30, 300, 3000] as const;
const GROUP_LABEL = { perfect: 'Perfect play', practical: 'Practical', fun: 'Fun' } as const;

export interface AutoPlayPanelProps {
  evClient: EvClient;
  settings: SimSettings;
  defaultStrategy?: StrategySpec;
  /** Strategies to run alongside (compare mode). */
  compare?: StrategySpec[];
  /** A scene may offer fewer choices (scene.autoPlay.handOptions / sessions). */
  handOptions?: number[];
  sessionOptions?: number[];
  onEvent?: (e: SimulatorEvent) => void;
}

export function AutoPlayPanel({
  evClient,
  settings,
  defaultStrategy,
  compare,
  handOptions,
  sessionOptions,
  onEvent,
}: AutoPlayPanelProps) {
  const handChoices: readonly number[] = handOptions?.length
    ? handOptions
    : [...HAND_CHOICES, 10000];
  const sessionChoices: readonly number[] = sessionOptions?.length ? sessionOptions : [1, 100];
  const [id, setId] = useState<StrategyId>(defaultStrategy?.id ?? 'expert');
  const [anteDollars, setAnte] = useState((defaultStrategy?.ante ?? settings.anteUnitCents) / 100);
  const [tripsDollars, setTrips] = useState((defaultStrategy?.trips ?? 0) / 100);
  const [hands, setHands] = useState<number>(
    handOptions?.length ? handOptions[0]! : settings.handsPerHour,
  );
  const [sessions, setSessions] = useState(sessionOptions?.length ? sessionOptions[0]! : 1);
  const [seed, setSeed] = useState(1);
  const [cmp, setCmp] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const ante = Math.max(100, Math.round(anteDollars) * 100);
  const trips = Math.max(0, Math.round(tripsDollars) * 100);
  const spec: StrategySpec = { id, ante, trips };
  const bankroll = ante * 100 + trips * 50;
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
  const exactNet = main ? main.expected[main.expected.length - 1]! - bankroll : 0;
  const simNet = main ? main.meanFinal - bankroll : 0;
  const running = progress !== null;
  const field = { display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '13px' } as const;
  return (
    <section
      data-testid="auto-play"
      aria-label="Auto-play"
      style={{ display: 'grid', gap: '12px' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        <label style={{ ...field, gridColumn: '1 / -1' }}>
          Strategy
          <select value={id} onChange={(e) => setId(e.currentTarget.value as StrategyId)}>
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
        </label>
        <label style={field}>
          Ante ($)
          <input
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
            type="number"
            min={0}
            step={1}
            value={tripsDollars}
            onInput={(e) => setTrips(Number(e.currentTarget.value))}
          />
        </label>
        <label style={field}>
          Hands{hands === settings.handsPerHour ? ' (one hour)' : ''}
          <select value={String(hands)} onChange={(e) => setHands(Number(e.currentTarget.value))}>
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
        <button type="button" onClick={() => void run()} disabled={running}>
          Run
        </button>
        {running ? (
          <>
            <progress value={progress.done} max={progress.total} aria-label="Simulation progress" />
            <button type="button" onClick={() => ctl.current?.abort()}>
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
            <li>Expected result (exact): {formatMoney(Math.round(exactNet), { sign: true })}</li>
            <li>
              Actual (≈ simulated{sessions > 1 ? ' average' : ''}):{' '}
              {formatMoney(Math.round(simNet), { sign: true })}
              {sessions > 1 ? ` ± ${formatMoney(Math.round(main.meanFinalCi95))}` : ''}
            </li>
            <li>Luck: {formatMoney(Math.round(simNet - exactNet), { sign: true })}</li>
            <li>Chance of finishing ahead (≈): {(main.probAhead * 100).toFixed(0)}%</li>
            <li>Busted (≈): {(main.bustRate * 100).toFixed(0)}% of sessions</li>
            {trips > 0 ? <li>Trips hits: {main.tripsHits}</li> : null}
            <li>Blind bonus hits: {main.blindBonusHits}</li>
          </ul>
          <OutcomeHistogram series={main} />
        </div>
      ) : null}
    </section>
  );
}
