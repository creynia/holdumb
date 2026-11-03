import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cardFace } from '../../content/cards';
import {
  describeResult,
  gradeShowdown,
  handName,
  nextShowdownSpot,
  showdownFromCode,
  showdownTruth,
  useAnnounceFrom,
} from '../../sim';
import type {
  Card,
  RngState,
  ShowdownAnswers,
  ShowdownBlind,
  ShowdownSpot,
  ShowdownWinner,
} from '../../sim';
import { Link } from '../components/Link';
import { useStore } from '../context';
import { rngFromSeed } from './Drill';

const WINNER: readonly { v: ShowdownWinner; label: string }[] = [
  { v: 'you', label: 'You' },
  { v: 'dealer', label: 'Dealer' },
  { v: 'tie', label: 'Tie' },
];
const BLIND: readonly { v: ShowdownBlind; label: string }[] = [
  { v: 'pays', label: 'Pays' },
  { v: 'pushes', label: 'Pushes' },
  { v: 'loses', label: 'Loses' },
];
const WINNER_NAME: Record<ShowdownWinner, string> = { you: 'You', dealer: 'Dealer', tie: 'Tie' };
const BLIND_NAME: Record<ShowdownBlind, string> = {
  pays: 'Pays',
  pushes: 'Pushes',
  loses: 'Loses',
};

/** A row of cards; once graded, cards outside the five that play are dimmed (I007 style). */
function Hand(props: {
  title: string;
  cards: readonly Card[];
  plays?: ReadonlySet<Card> | undefined;
}) {
  return (
    <div class="sd-hand">
      <h3 class="sd-label">{props.title}</h3>
      <span class="cards" role="group" aria-label={props.title}>
        {props.cards.map((c) => {
          const f = cardFace(c);
          const out = props.plays ? !props.plays.has(c) : false;
          return (
            <span
              key={c}
              class={`pc suit-${f.suit}${out ? ' pc-out' : ''}`}
              role="img"
              aria-label={`${f.name}${props.plays ? (out ? ", doesn't play" : ', plays') : ''}`}
            >
              {f.rank}
              {f.glyph}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function Choice<T extends string>(props: {
  name: string;
  legend: string;
  options: readonly { v: T; label: string }[];
  value: T | undefined;
  truth: T | undefined;
  onPick: (v: T) => void;
  locked: boolean;
}) {
  return (
    <fieldset class="sd-q" data-testid={`showdown-${props.name}`}>
      <legend>{props.legend}</legend>
      <div class="choice-row" role="group" aria-label={props.legend}>
        {props.options.map((o) => (
          <button
            key={o.v}
            type="button"
            class={`btn${props.value === o.v ? '' : ' btn-ghost'}${props.locked && props.truth === o.v ? ' sd-right' : ''}${props.locked && props.value === o.v && props.truth !== o.v ? ' sd-wrong' : ''}`}
            aria-pressed={props.value === o.v}
            data-value={o.v}
            disabled={props.locked}
            onClick={() => props.onPick(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function replaceUrl(code: string, seed?: string | null) {
  const qs = new URLSearchParams({ mode: 'showdown', spot: code });
  if (seed) qs.set('seed', seed);
  location.replace(`#/drill?${qs.toString().replace(/%3A/g, ':')}`);
}

export function DrillShowdown(props: { query: URLSearchParams; seed?: number }) {
  const store = useStore();
  const code = props.query.get('spot');
  const seedParam = props.query.get('seed');
  const rng = useRef<RngState>(
    rngFromSeed(props.seed ?? (seedParam !== null ? Number(seedParam) : Date.now())),
  );
  const spot = useMemo<ShowdownSpot | null>(() => {
    if (!code) return null;
    try {
      return showdownFromCode(code);
    } catch {
      return null;
    }
  }, [code]);
  const [answers, setAnswers] = useState<ShowdownAnswers>({});
  const [graded, setGraded] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useAnnounceFrom(feedbackRef, graded && spot ? spot.code : null, { dedupeKey: 'showdown' });

  const deal = () => {
    const [s, r] = nextShowdownSpot(rng.current, { teaching: true });
    rng.current = r;
    replaceUrl(s.code, seedParam);
  };
  // No (or a bad) spot code in the URL: deal one and put its code there, so the page reproduces.
  useEffect(() => {
    if (!spot) deal();
  }, [spot]);
  // A new spot clears the answers.
  useEffect(() => {
    setAnswers({});
    setGraded(false);
  }, [spot?.code]);

  const truth = spot ? showdownTruth(spot) : null;
  const pick = (patch: ShowdownAnswers) => {
    if (!spot || graded) return;
    const next = { ...answers, ...patch };
    setAnswers(next);
    if (next.winner !== undefined && next.qualifies !== undefined && next.blind !== undefined) {
      store.recordShowdown(gradeShowdown(spot, next));
      setGraded(true);
    }
  };

  const grade = spot && graded ? gradeShowdown(spot, answers) : null;
  const playerFive = truth ? new Set<Card>(truth.result.player.best5) : null;
  const dealerFive = truth ? new Set<Card>(truth.result.dealer.best5) : null;
  const boardPlays =
    truth && playerFive && dealerFive ? new Set<Card>([...playerFive, ...dealerFive]) : undefined;
  const s = store.drill.modes.showdown;
  const pct = (c: { answered: number; correct: number }) =>
    c.answered ? `${c.correct}/${c.answered}` : '--';

  return (
    <div class="page drill-page" data-testid="showdown-page">
      <h1>Read the showdown</h1>
      <p class="muted">
        Nine cards, three quick taps. <Link to="/drill">All drills</Link>
      </p>
      {spot && truth ? (
        <section class="card sd-spot" data-testid="showdown-spot" data-code={spot.code}>
          <Hand title="Your cards" cards={spot.hole} plays={graded ? playerFive! : undefined} />
          <Hand title="Board" cards={spot.board} plays={graded ? boardPlays : undefined} />
          <Hand
            title="Dealer's cards"
            cards={spot.dealer}
            plays={graded ? dealerFive! : undefined}
          />
          <Choice
            name="winner"
            legend="Who wins?"
            options={WINNER}
            value={answers.winner}
            truth={truth.winner}
            locked={graded}
            onPick={(v) => pick({ winner: v })}
          />
          <Choice
            name="qualifies"
            legend="Does the dealer qualify?"
            options={[
              { v: 'yes', label: 'Yes' },
              { v: 'no', label: 'No' },
            ]}
            value={answers.qualifies === undefined ? undefined : answers.qualifies ? 'yes' : 'no'}
            truth={truth.qualifies ? 'yes' : 'no'}
            locked={graded}
            onPick={(v) => pick({ qualifies: v === 'yes' })}
          />
          <Choice
            name="blind"
            legend="What happens to the Blind?"
            options={BLIND}
            value={answers.blind}
            truth={truth.blind}
            locked={graded}
            onPick={(v) => pick({ blind: v })}
          />
        </section>
      ) : null}

      {spot && truth && grade ? (
        <section
          class="card drill-result"
          data-testid="showdown-feedback"
          data-all={grade.all ? 'right' : 'miss'}
          ref={feedbackRef}
        >
          <p>
            <strong>{grade.all ? 'All three right.' : 'Not quite.'}</strong>{' '}
            {`Winner: ${grade.winner ? 'right' : `you said ${WINNER_NAME[answers.winner!]}, it is ${WINNER_NAME[truth.winner]}`}. `}
            {`Dealer qualifies: ${grade.qualifies ? 'right' : `you said ${answers.qualifies ? 'Yes' : 'No'}, it is ${truth.qualifies ? 'Yes' : 'No'}`}. `}
            {`Blind: ${grade.blind ? 'right' : `you said ${BLIND_NAME[answers.blind!]}, it is ${BLIND_NAME[truth.blind]}`}.`}
          </p>
          <p>{describeResult(truth.result, undefined, truth.deal)}</p>
          <p>
            {truth.qualifies
              ? `The dealer has ${handName(truth.result.dealer)}, a pair or better, so the dealer qualifies.`
              : `The dealer has only ${handName(truth.result.dealer)}. It takes a pair or better to qualify, so the Ante pushes.`}{' '}
            {truth.blind === 'pays'
              ? `You win with ${handName(truth.result.player)}, a straight or better, so the Blind pays.`
              : truth.blind === 'loses'
                ? 'You lose the hand, so the Blind loses.'
                : truth.winner === 'tie'
                  ? 'A tie pushes the Blind.'
                  : `You win with ${handName(truth.result.player)}, but the Blind only pays for a straight or better, so it pushes.`}
          </p>
          <p class="muted">The five cards that play are bright; the others are dimmed.</p>
        </section>
      ) : null}

      {graded ? (
        <p>
          <button type="button" class="btn btn-big" data-testid="showdown-next" onClick={deal}>
            Next spot
          </button>
        </p>
      ) : null}

      <section class="drill-stats" data-testid="showdown-stats" aria-label="Showdown accuracy">
        <span>
          Winner <strong>{pct(s.winner)}</strong>
        </span>
        <span>
          Qualifies <strong>{pct(s.qualifies)}</strong>
        </span>
        <span>
          Blind <strong>{pct(s.blind)}</strong>
        </span>
        <span>
          All three <strong>{s.spots ? `${s.allRight}/${s.spots}` : '--'}</strong>
        </span>
      </section>
    </div>
  );
}
