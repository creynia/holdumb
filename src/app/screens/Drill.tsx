import { useEffect, useRef, useState } from 'preact/hooks';
import { EvSheet, cardCode, formatMoney, nextSpot, optionKeyOf } from '../../sim';
import type {
  DecisionAction,
  DecisionPreview,
  DecisionStreet,
  DrillFilter,
  DrillSpot,
  PreviewRequest,
  RngState,
} from '../../sim';
import { Cards } from '../components/Cards';
import { Link } from '../components/Link';
import { useStore } from '../context';
import { getEvClient } from '../evClient';
import { navigate } from '../router';
import { DRILL_STREETS } from '../storage';

/** What the screen needs from the strategy and math modules; tests pass fakes. */
export interface DrillDeps {
  nextSpot(rng: RngState, filter: DrillFilter): [DrillSpot, RngState];
  preview(req: PreviewRequest): Promise<DecisionPreview>;
}

export const defaultDrillDeps: DrillDeps = {
  nextSpot,
  preview: (req) => getEvClient().run('preview', req),
};

interface Choice {
  label: string; // D31: never "Raise"
  action: DecisionAction;
}
export const CHOICES: Record<DecisionStreet, Choice[]> = {
  preflop: [
    { label: 'Bet 4x', action: { type: 'play', multiple: 4 } },
    { label: 'Bet 3x', action: { type: 'play', multiple: 3 } },
    { label: 'Check', action: { type: 'check' } },
  ],
  flop: [
    { label: 'Bet 2x', action: { type: 'play', multiple: 2 } },
    { label: 'Check', action: { type: 'check' } },
  ],
  river: [
    { label: 'Bet 1x', action: { type: 'play', multiple: 1 } },
    { label: 'Fold', action: { type: 'fold' } },
  ],
};

const sameAction = (a: DecisionAction, b: DecisionAction) =>
  a.type === b.type && (a.type !== 'play' || (b.type === 'play' && a.multiple === b.multiple));

const HEADLINE = {
  best: 'Correct!',
  close: 'Close call.',
  small: 'Not quite.',
  costly: 'Mistake.',
  blunder: 'Big mistake.',
} as const;

/** splitmix32 -> the engine's four-word RNG state. */
export function rngFromSeed(seed: number): RngState {
  let x = seed >>> 0;
  const next = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  return { s: [next(), next(), next(), next()] };
}

const antes = (f: { num: bigint; den: bigint }) => (Number(f.num) / Number(f.den)).toFixed(3);

interface Answer {
  chosen: number;
  preview: DecisionPreview;
}

export function Drill(props: { query: URLSearchParams; deps?: DrillDeps }) {
  const deps = props.deps ?? defaultDrillDeps;
  const store = useStore();
  const q = props.query.get('street');
  const street: DecisionStreet | 'mixed' =
    q === 'preflop' || q === 'flop' || q === 'river' ? q : 'mixed';
  const focus = (props.query.get('focus') ?? '').split(',').filter(Boolean);
  const focusKey = focus.join(',');
  const rng = useRef<RngState>(rngFromSeed(Date.now()));
  const [spot, setSpot] = useState<DrillSpot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const deal = () => {
    setAnswer(null);
    setFailed(false);
    try {
      const filter: DrillFilter = { street, ...(focus.length ? { focus } : {}) };
      const [s, r] = deps.nextSpot(rng.current, filter);
      rng.current = r;
      setSpot(s);
      setUnavailable(false);
    } catch {
      setSpot(null);
      setUnavailable(true);
    }
  };
  useEffect(deal, [street, focusKey]);

  const choose = (i: number) => {
    if (!spot || busy || answer) return;
    setBusy(true);
    setFailed(false);
    deps
      .preview({
        street: spot.street,
        hole: spot.hole,
        board: spot.board,
        blindPaytable: 'blind-standard',
        ante: store.settings.anteUnitCents,
      })
      .then((preview) => {
        const picked = CHOICES[spot.street][i]!;
        const opt = preview.options.find((o) => sameAction(o.action, picked.action));
        const correct = opt !== undefined && (opt.tier === 'best' || opt.tier === 'close'); // D33
        store.recordDrill(spot.street, correct, spot.code);
        setAnswer({ chosen: i, preview });
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  const d = store.drill;
  const total = DRILL_STREETS.reduce((n, s) => n + d.byStreet[s].answered, 0);
  const chosenOpt =
    spot && answer
      ? answer.preview.options.find((o) =>
          sameAction(o.action, CHOICES[spot.street][answer.chosen]!.action),
        )
      : undefined;
  const best = answer?.preview.options[answer.preview.bestIndex];
  const hole = spot ? spot.hole.map(cardCode).join('') : '';
  const board = spot ? spot.board.map(cardCode).join('') : '';

  return (
    <div class="page">
      <h1>Drill</h1>
      <div class="segmented" role="group" aria-label="Street">
        {(['mixed', ...DRILL_STREETS] as const).map((s) => (
          <button
            key={s}
            type="button"
            class="seg"
            aria-pressed={s === street}
            onClick={() => navigate(s === 'mixed' ? '/drill' : `/drill?street=${s}`)}
          >
            {s === 'mixed' ? 'Mixed' : s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <section class="card drill-stats" aria-label="Your drill stats" data-testid="drill-stats">
        <span>
          Streak <strong data-testid="streak">{store.drillStreak}</strong>
        </span>
        <span>
          Best <strong data-testid="best-streak">{d.bestStreak}</strong>
        </span>
        {DRILL_STREETS.map((s) => {
          const v = d.byStreet[s];
          return (
            <span key={s}>
              {s}{' '}
              <strong>
                {v.answered ? `${Math.round((100 * v.correct) / v.answered)}%` : '--'}
              </strong>
            </span>
          );
        })}
      </section>

      {unavailable && (
        <section class="card" data-testid="drill-unavailable" role="status">
          <h2>Spots are on their way</h2>
          <p class="muted">
            The drill needs the strategy engine, which is not part of this build yet. Meanwhile,
            study the <Link to="/strategy">strategy charts</Link>.
          </p>
        </section>
      )}

      {spot && (
        <section class="card drill-spot" data-testid="drill-spot" data-street={spot.street}>
          <h2 class="sr">Your hand</h2>
          <div class="drill-cards">
            <Cards cards={spot.hole} />
            {spot.board.length > 0 && <Cards cards={spot.board} />}
          </div>
          <div class="choice-row" role="group" aria-label="Your decision">
            {CHOICES[spot.street].map((c, i) => (
              <button
                key={c.label}
                type="button"
                class={`btn ${answer?.chosen === i ? '' : answer ? 'btn-ghost' : ''}`}
                disabled={busy || answer !== null}
                aria-pressed={answer?.chosen === i}
                onClick={() => choose(i)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {failed && (
            <p role="alert" class="warn">
              Could not work out the EV. Try again.
            </p>
          )}
        </section>
      )}

      {spot && answer && chosenOpt && best && (
        <section class="card drill-result" data-testid="drill-result" data-tier={chosenOpt.tier}>
          <p role="status">
            <strong>{HEADLINE[chosenOpt.tier]}</strong>{' '}
            {chosenOpt.tier === 'best'
              ? `${chosenOpt.label} is the best play.`
              : `${best.label} is better by ${antes(chosenOpt.regret)} antes (${formatMoney(
                  Math.round(
                    (Number(chosenOpt.regret.num) * store.settings.anteUnitCents) /
                      Number(chosenOpt.regret.den),
                  ),
                )} per hand).`}
          </p>
          <EvSheet
            preview={answer.preview}
            variant="inline"
            detail="full"
            selected={optionKeyOf(chosenOpt.action)}
          />
          <div class="row">
            <button type="button" class="btn" onClick={deal}>
              Next hand
            </button>
            <Link
              to={`/strategy?highlight=${answer.preview.handClass ?? ''}`}
              class="btn btn-ghost"
            >
              See the chart
            </Link>
            <Link to={`/play?hole=${hole}${board ? `&board=${board}` : ''}`} class="btn btn-ghost">
              Play it out
            </Link>
          </div>
        </section>
      )}

      {total > 0 && d.recentMisses.length > 0 && (
        <p>
          <Link to={`/drill?focus=${d.recentMisses.join(',')}`} class="btn btn-ghost">
            Review misses ({d.recentMisses.length})
          </Link>
        </p>
      )}
    </div>
  );
}
