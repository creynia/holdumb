// Auto-play (simulator.md §5.4): pick a strategy, ante, Trips, hands and sessions; run the
// `simulate` job through the EvClient; show exact vs simulated figures and the charts.
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMoney } from '../engine/money';
import type { SimulatorEvent } from './types';
import type { SimSettings } from './types';
import type { EvClient, Progress } from '../worker/protocol';
import { STRATEGY_CONSTANTS } from '../strategy/constants';
import { costVsPerfectPerHour, strategyMetrics } from '../strategy/metrics';
import { fracToNumber } from '../strategy/fraction';
import type { SimulateResult, StrategyId, StrategySpec } from '../strategy/types';
import type { SixCardSetting } from '../engine/sixcard';
import type { Fraction } from '../math/types';
import { sixCardEdgeOf } from '../scene/driver';
import { Say, announce, muteAnnouncements } from './announcer';
import { HAND_CHOICES } from './autoplay/helpers';
import { autoPlayControls } from './autoplay/AutoPlayControls';
import { AutoPlayResult } from './autoplay/AutoPlayResult';
export { alwaysMaxNote, shownNet } from './autoplay/helpers';

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
  /** I062: the table's Six Card Bonus setting; auto-play settles it at each deal like the table. */
  sixCard?: SixCardSetting | null;
  onEvent?: (e: SimulatorEvent) => void;
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
  sixCard,
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
  /** I062: the Six Card edge of the last run, loaded on demand (it is not in the first paint). */
  const [sixEdge, setSixEdge] = useState<Fraction | null>(null);
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
  const rules = { tripsPaytable: settings.paytable };
  const costCents = Math.round(fracToNumber(costVsPerfectPerHour(spec, settings.handsPerHour)));
  const others: StrategySpec[] = cmp
    ? (compare ?? [{ id: id === 'basic' ? 'expert' : 'basic', ante, trips }]).map((s) => ({
        ...s,
        ante,
        trips,
      }))
    : [];
  // Compare table: exact figures only, lowest house edge first (cross-multiplied, no floats).
  const tableRows = [spec, ...others]
    .map((s) => ({
      s,
      m: strategyMetrics(s, rules, settings.handsPerHour),
      cost: Math.round(fracToNumber(costVsPerfectPerHour(s, settings.handsPerHour))),
    }))
    .sort((a, b) => {
      const l = a.m.edgePerAnte.num * b.m.edgePerAnte.den;
      const r = b.m.edgePerAnte.num * a.m.edgePerAnte.den;
      return l < r ? -1 : l > r ? 1 : 0;
    });

  async function run(): Promise<void> {
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 1 });
    // One announcement at the start and one at the end; nothing else speaks while it runs.
    announce(`Simulating ${hands} hands.`, { force: true });
    const unmute = muteAnnouncements();
    try {
      const res = await evClient.run(
        'simulate',
        {
          strategy: spec,
          hands,
          sessions,
          seed,
          bankroll,
          rules,
          compare: others,
          ...(sixCard ? { sixCard: { bet: sixCard.bet, paytable: sixCard.paytable } } : {}),
        },
        { key: 'auto-play', signal: ac.signal, onProgress: setProgress },
      );
      // The Six Card rules are registered whenever a bet is set (they load with the Six Card UI).
      setSixEdge(sixCard ? sixCardEdgeOf(sixCard.paytable) : null);
      setResult(res);
      setProgress(null);
      unmute();
      announce(`Simulation finished: ${hands} hands. Results are below.`, { force: true });
      onEvent?.({ type: 'auto-play-completed', hands, strategy: id });
    } catch (e) {
      unmute();
      setProgress(null);
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
  }

  const running = progress !== null;
  return (
    <section
      data-testid="auto-play"
      aria-label="Auto-play"
      style={{ display: 'grid', gap: '12px' }}
    >
      {autoPlayControls(
        id,
        setId,
        spec,
        settings,
        anteDollars,
        setAnte,
        tripsDollars,
        setTrips,
        hands,
        setHands,
        handChoices,
        sessions,
        setSessions,
        sessionChoices,
        seed,
        setSeed,
        cmp,
        setCmp,
      )}
      <p style={{ margin: 0, fontSize: '13px' }}>
        Exact: {formatMoney(Math.round(hourCents), { sign: true })} per hour at {formatMoney(ante)}{' '}
        Ante ({settings.handsPerHour} hands/hour, house edge{' '}
        {(fracToNumber(metrics.edgePerAnte) * 100).toFixed(2)}% of the Ante).
      </p>
      <p style={{ margin: 0, fontSize: '13px' }} data-testid="auto-play-cost">
        {id === 'perfect'
          ? 'The lowest edge possible.'
          : `Costs ${formatMoney(costCents)} an hour more than perfect play.`}{' '}
        <a
          href="#/glossary?term=element-of-risk"
          style={{ display: 'inline-block', minHeight: '44px', lineHeight: '44px' }}
        >
          Element of risk
        </a>{' '}
        {(fracToNumber(metrics.elementOfRisk) * 100).toFixed(2)}%.
      </p>
      {cmp ? (
        <table data-testid="auto-play-compare" style={{ fontSize: '12px', width: '100%' }}>
          <caption style={{ textAlign: 'left' }}>Exact figures, lowest edge first</caption>
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col">Edge</th>
              <th scope="col">Per hour</th>
              <th scope="col">Vs perfect</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ s, m, cost }) => (
              <tr key={s.id}>
                <th scope="row" style={{ textAlign: 'left' }}>
                  {STRATEGY_CONSTANTS[s.id].name}
                </th>
                <td>{(fracToNumber(m.edgePerAnte) * 100).toFixed(2)}%</td>
                <td>{formatMoney(Math.round(fracToNumber(m.evPerHourCents)), { sign: true })}</td>
                <td>{cost === 0 ? '--' : `+${formatMoney(cost)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
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
      {error ? (
        <p>
          <Say text={error} politeness="assertive" force={true} />
          {error}
        </p>
      ) : null}
      {result?.series[0] ? (
        <AutoPlayResult
          result={result}
          bankroll={bankroll}
          hands={hands}
          sessions={sessions}
          trips={trips}
          sixEdge={sixEdge}
        />
      ) : null}
    </section>
  );
}
