import { Say, useAnnounceFrom } from '../../sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  EvSheet,
  OPTION_LABELS,
  actionOfKey,
  cardCode,
  costCents,
  decisionTier,
  fmtCostC,
  fmtFixed,
  gradeSpot,
  nextSpot,
  pickDueReview,
  optionKeyOf,
  optionsFor,
  riverFacts,
} from '../../sim';
import type {
  DecisionAction,
  DecisionOption,
  DecisionPreview,
  DecisionStreet,
  DecisionTier,
  DrillFilter,
  DrillGrade,
  DrillSpot,
  PreviewRequest,
  RngState,
} from '../../sim';
import { Cards } from '../components/Cards';
import { Link } from '../components/Link';
import { useContent, useStore } from '../context';
import { getEvClient } from '../evClient';
import { navigate } from '../router';
import { DRILL_STREETS, lensStats } from '../storage';
import { reviewAllowed } from '../review';
import {
  DRILL_CATEGORY_LABELS,
  categoriesOf,
  isCategoryId,
  weakestCategory,
} from '../drillCategories';
import { DRILL_STREET_OF } from '../../sim';

/** What the screen needs from the strategy and math modules; tests pass fakes. */
export interface DrillDeps {
  nextSpot(rng: RngState, filter: DrillFilter): [DrillSpot, RngState];
  gradeSpot(
    spot: DrillSpot,
    chosen: DecisionAction,
    preview: DecisionPreview,
    lens: 'perfect' | 'practical',
  ): DrillGrade;
  preview(req: PreviewRequest): Promise<DecisionPreview>;
  /** Fixed RNG seed for tests; the screen seeds from the clock when absent. */
  seed?: number;
}

export const defaultDrillDeps: DrillDeps = {
  nextSpot,
  gradeSpot,
  preview: (req) => getEvClient().run('preview', req),
};

interface Choice {
  label: string; // D31: never "Raise"
  action: DecisionAction;
}
/** The table's slot order (I012): the passive action first, then the bets by size. */
const choicesFor = (street: DecisionStreet): Choice[] =>
  optionsFor(street).map((k) => ({ label: OPTION_LABELS[k], action: actionOfKey(k) }));
export const CHOICES: Record<DecisionStreet, Choice[]> = {
  preflop: choicesFor('preflop'),
  flop: choicesFor('flop'),
  river: choicesFor('river'),
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

/** curriculum.md 9.2: the sentence under the headline, per tier. */
export function gradingBody(
  tier: keyof typeof HEADLINE,
  reminder: string,
  bestLabel: string,
  chosenLabel: string,
  regret: string,
  cost: string,
): string {
  const tail = reminder ? ` ${reminder}` : '';
  switch (tier) {
    case 'best':
      return reminder || `${chosenLabel} is the best play.`;
    case 'close':
      return `${bestLabel} is better by just ${regret} antes (${cost}). Either is fine.`;
    case 'small':
      return `${bestLabel} is better by ${regret} antes (${cost} per hand).${tail}`;
    default:
      return `${bestLabel} earns ${regret} antes (${cost}) more on average.${tail}`;
  }
}

/**
 * splitmix32 -> the engine's four-word RNG state. Seeding after SplitMix (Steele, Lea and Flood,
 * 2014), mixing with the MurmurHash3 fmix32 constants 0x85ebca6b / 0xc2b2ae35 (Austin Appleby,
 * public domain).
 */
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

/** Antes to three decimals, exact and rounded half away from zero (same as the EV sheet). */
const antes = (f: { num: bigint; den: bigint }) => fmtFixed(f, 3);

interface Answer {
  chosen: number;
  preview: DecisionPreview;
  grade: DrillGrade;
  tier: DecisionTier;
}

const labelOf = (street: DecisionStreet, a: DecisionAction) =>
  CHOICES[street].find((c) => sameAction(c.action, a))?.label ?? '';

export function Drill(props: { query: URLSearchParams; deps?: DrillDeps }) {
  const deps = props.deps ?? defaultDrillDeps;
  const store = useStore();
  const content = useContent();
  const q = props.query.get('street');
  const qStreet: DecisionStreet | 'mixed' =
    q === 'preflop' || q === 'flop' || q === 'river' ? q : 'mixed';
  // ?category= wins over ?street= unless they disagree (then the category is ignored).
  const qCat = props.query.get('category');
  const category =
    isCategoryId(qCat) && (qStreet === 'mixed' || DRILL_STREET_OF[qCat] === qStreet)
      ? qCat
      : undefined;
  const street: DecisionStreet | 'mixed' = category ? DRILL_STREET_OF[category] : qStreet;
  const focus = (props.query.get('focus') ?? '').split(',').filter(Boolean);
  const focusKey = focus.join(',');
  const rng = useRef<RngState>(rngFromSeed(deps.seed ?? Date.now()));
  const dealt = useRef(0);
  const reviews = useRef(0);
  const [spot, setSpot] = useState<DrillSpot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const gradeRef = useRef<HTMLParagraphElement>(null);
  // The grade is spoken exactly as shown: the headline, the better play and by how much.
  useAnnounceFrom(gradeRef, answer, { dedupeKey: 'drill' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const deal = () => {
    setAnswer(null);
    setFailed(false);
    try {
      const filter: DrillFilter = {
        street,
        ...(category ? { category } : {}),
        ...(focus.length ? { focus } : {}),
        ...(store.drill.closeCalls ? { interesting: true } : {}),
      };
      // Spaced review (I067): a due miss now and then, never more than 30% of the spots dealt.
      let [s, r]: [DrillSpot | null, RngState] = [null, rng.current];
      if (!focus.length) {
        [s, r] = pickDueReview(
          r,
          store.dueReview(),
          { street, ...(category ? { category } : {}) },
          reviewAllowed(dealt.current, reviews.current),
        );
      }
      if (s) reviews.current++;
      else [s, r] = deps.nextSpot(r, filter);
      dealt.current++;
      rng.current = r;
      setSpot(s);
      setUnavailable(false);
    } catch {
      setSpot(null);
      setUnavailable(true);
    }
  };
  useEffect(deal, [street, category, focusKey, store.drill.closeCalls]);

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
        const grade = deps.gradeSpot(spot, picked.action, preview, store.drill.lens); // D33
        const opt = preview.options.find((o) => sameAction(o.action, picked.action))!;
        const tier = grade.lens === 'perfect' ? opt.tier : decisionTier(grade.regret);
        store.recordDrill(spot.street, grade.correct, spot.code, spot.category);
        setAnswer({ chosen: i, preview, grade, tier });
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  const d = store.drill;
  const weakest = weakestCategory(d);
  const ls = lensStats(d);
  const due = store.dueReview();
  const counts = ls.byStreet;
  const chosenOpt =
    spot && answer
      ? answer.preview.options.find((o) =>
          sameAction(o.action, CHOICES[spot.street][answer.chosen]!.action),
        )
      : undefined;
  const perfectBest = answer?.preview.options[answer.preview.bestIndex];
  const gradeBest = spot && answer ? labelOf(spot.street, answer.grade.best) : '';
  const perfectDiffers =
    answer !== null &&
    perfectBest !== undefined &&
    !sameAction(perfectBest.action, answer.grade.best);
  const chosenIsCard = answer !== null && sameAction(answer.grade.chosen, answer.grade.best);
  const optOf = (a: DecisionAction) => answer?.preview.options.find((o) => sameAction(o.action, a));
  const refOpt = answer ? (optOf(answer.grade.best) ?? perfectBest) : undefined;
  // "N antes ($c" for the gap between a reference option and another (same rounding as the EV sheet)
  const money = (
    f: { num: bigint; den: bigint },
    ref: DecisionOption | undefined,
    o: DecisionOption,
  ) => `${antes(f)} antes (${fmtCostC(costCents(ref!, o))}`;
  const hole = spot ? spot.hole.map(cardCode).join('') : '';
  const board = spot ? spot.board.map(cardCode).join('') : '';
  // curriculum.md 9.2: the category's reminder (river categories name the dealer-outs count).
  const reminder = spot
    ? (content.drill[spot.category] ?? '').replace(
        '{outs}',
        spot.street === 'river' ? String(riverFacts(spot.hole, spot.board).outs) : '',
      )
    : '';

  return (
    <div class="page drill-page">
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
          Best <strong data-testid="best-streak">{ls.bestStreak}</strong>
        </span>
        {DRILL_STREETS.map((s) => {
          const v = counts[s];
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
        <section class="card" data-testid="drill-unavailable">
          <Say
            text="Spots are on their way. The drill is not available in this build yet."
            dedupeKey="drill"
          />
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
          <p class="drill-spot-category muted" data-testid="drill-category-label">
            {DRILL_CATEGORY_LABELS[spot.category]}
          </p>
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
            <p class="warn">
              <Say
                text="Could not work out the EV. Try again."
                politeness="assertive"
                dedupeKey="drill-err"
              />
              Could not work out the EV. Try again.
            </p>
          )}
        </section>
      )}

      {spot && answer && chosenOpt && perfectBest && (
        <section class="card drill-result" data-testid="drill-result" data-tier={answer.tier}>
          <p data-testid="drill-headline" ref={gradeRef}>
            <strong>{HEADLINE[answer.tier]}</strong>{' '}
            {answer.tier === 'best'
              ? answer.grade.lens === 'perfect'
                ? reminder || `${chosenOpt.label} is the best play.`
                : `${
                    chosenIsCard
                      ? `${chosenOpt.label} is the card's play.`
                      : `${chosenOpt.label} is the best play (the card says ${gradeBest} here).`
                  }${reminder ? ` ${reminder}` : ''}`
              : gradingBody(
                  answer.tier,
                  reminder,
                  gradeBest,
                  chosenOpt.label,
                  antes(answer.grade.regret),
                  fmtCostC(costCents(refOpt!, chosenOpt)),
                )}
            {answer.grade.lens === 'practical' && perfectDiffers && chosenOpt !== perfectBest && (
              <>
                {' '}
                {`Perfect play says ${perfectBest.label} here, by ${money(refOpt!.regret, perfectBest, refOpt!)} per hand). The card's rule is still the one to remember.`}
              </>
            )}
          </p>
          <EvSheet
            preview={answer.preview}
            variant="inline"
            detail="full"
            selected={optionKeyOf(chosenOpt.action)}
            request={{
              street: spot.street,
              hole: spot.hole,
              board: spot.board,
              blindPaytable: 'blind-standard',
              ante: store.settings.anteUnitCents,
            }}
          />
          <div class="row">
            <button type="button" class="btn" onClick={deal}>
              Next hand
            </button>
            <Link
              to={
                answer.preview.street === 'preflop'
                  ? `/strategy?highlight=${answer.preview.handClass ?? ''}`
                  : `/strategy?view=${answer.preview.street}`
              }
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

      {ls.review.length > 0 && (
        <p data-testid="review-due">
          {due.length > 0 ? (
            <Link to={`/drill?focus=${due.join(',')}`} class="btn btn-ghost">
              Review due: {due.length}
            </Link>
          ) : (
            <span class="muted">Review due: 0 ({ls.review.length} waiting)</span>
          )}
        </p>
      )}

      <div class="drill-picker">
        <label class="check" data-testid="drill-close-calls">
          <input
            type="checkbox"
            checked={store.drill.closeCalls}
            onChange={(e) => store.setDrillCloseCalls(e.currentTarget.checked)}
          />
          <span>
            <strong>Close calls</strong>
            <span class="muted">
              {' '}
              About 6 in 10 spots are close (flop: the close-call categories, flush draws, straight
              draws and pocket deuces). Mixed follows real-play street frequencies.
            </span>
          </span>
        </label>
        <div class="segmented" role="group" aria-label="Grade by" data-testid="drill-lens">
          <span class="seg-label">Grade by</span>
          {(['perfect', 'practical'] as const).map((l) => (
            <button
              key={l}
              type="button"
              class="seg"
              aria-pressed={d.lens === l}
              onClick={() => store.setDrillLens(l)}
            >
              {l === 'perfect' ? 'Perfect play' : 'Basic card'}
            </button>
          ))}
        </div>
        {street !== 'mixed' && (
          <label class="drill-category">
            <span>Category</span>
            <select
              data-testid="drill-categories"
              value={category ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value;
                const qs = new URLSearchParams({ street });
                if (v) qs.set('category', v);
                if (focusKey) qs.set('focus', focusKey);
                navigate(`/drill?${qs.toString().replace(/%2C/g, ',')}`);
              }}
            >
              <option value="">All</option>
              {categoriesOf(street).map((c) => (
                <option key={c} value={c}>
                  {DRILL_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        )}
        {weakest && (
          <p class="muted" data-testid="drill-weakest">
            Your weakest: {DRILL_CATEGORY_LABELS[weakest.id]} {weakest.pct}% ({weakest.answered})
          </p>
        )}
      </div>
    </div>
  );
}
