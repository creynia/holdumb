// Drill spot generator (simulator.md §5, curriculum.md §9, decisions.md D33). Pure and seeded.
import { cardCode, parseCards } from '../engine/cards';
import { randBelow } from '../engine/rng';
import type { Card, DecisionAction, DecisionStreet, RngState } from '../engine/types';
import { decisionTier } from '../math/tiers';
import type { DecisionPreview, PreviewRequest } from '../math/types';
import { previewJob } from '../math/preview';
import { categorize, DRILL_STREET_OF } from './categories';
import { matchesAny } from './predicates';
import { strategyAction } from './presets';
import { handClass, parseClass } from './ranks';
import { PREFLOP_4X_PERFECT, RULE_DEFS } from './rules';
import { fracSub } from './fraction';
import type { DrillCategoryId, DrillFilter, DrillGrade, DrillSpot } from './types';

const CHART_4X: ReadonlySet<string> = new Set(PREFLOP_4X_PERFECT);
const LETTER: Record<DecisionStreet, string> = { preflop: 'p', flop: 'f', river: 'r' };
const STREET_OF_LETTER: Record<string, DecisionStreet> = { p: 'preflop', f: 'flop', r: 'river' };
const MAX_ATTEMPTS = 200_000;

// ---------- codes ----------
export function spotCode(spot: Omit<DrillSpot, 'code'>): string {
  const c = (cs: readonly Card[]): string => cs.map(cardCode).join('');
  return `${LETTER[spot.street]}:${c(spot.hole)}.${c(spot.board)}`;
}

export function spotFromCode(code: string): DrillSpot {
  const m = /^([pfr]):([^.]*)\.([^.]*)$/.exec(code);
  if (!m) throw new Error(`Bad spot code "${code}"`);
  const street = STREET_OF_LETTER[m[1]!]!;
  const hole = parseCards(m[2]!);
  const board = parseCards(m[3]!);
  const want = street === 'preflop' ? 0 : street === 'flop' ? 3 : 5;
  if (hole.length !== 2 || board.length !== want) throw new Error(`Bad spot code "${code}"`);
  if (new Set([...hole, ...board]).size !== hole.length + board.length)
    throw new Error(`Duplicate card in "${code}"`);
  const h: [Card, Card] = [hole[0]!, hole[1]!];
  return { code, street, hole: h, board, category: categorize(h, board) };
}

function makeSpot(street: DecisionStreet, hole: [Card, Card], board: Card[]): DrillSpot {
  const base = { street, hole, board, category: categorize(hole, board) };
  return { ...base, code: spotCode(base) };
}

// ---------- sampling ----------
/** Draws `k` distinct cards not in `used` (partial Fisher-Yates over the remaining deck). */
function draw(rng: RngState, k: number, used: readonly Card[]): [Card[], RngState] {
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.includes(c)) deck.push(c);
  const out: Card[] = [];
  let r = rng;
  for (let i = 0; i < k; i++) {
    const [j, next] = randBelow(r, deck.length - i);
    r = next;
    const pick = deck[i + j]!;
    deck[i + j] = deck[i]!;
    deck[i] = pick;
    out.push(pick);
  }
  return [out, r];
}

const isCheckHand = (hole: readonly [Card, Card]): boolean => !CHART_4X.has(handClass(hole));
const basicFlopChecks = (hole: readonly Card[], flop: readonly Card[]): boolean =>
  !matchesAny(RULE_DEFS.basic.flop2x, hole, flop);

/** One random spot of the street, from hands you would really face (chart-check hands). */
function sampleStreet(rng: RngState, street: DecisionStreet): [DrillSpot, RngState] {
  let r = rng;
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    let cards: Card[];
    if (street === 'preflop') {
      [cards, r] = draw(r, 2, []);
      const hole: [Card, Card] = [cards[0]!, cards[1]!];
      return [makeSpot('preflop', hole, []), r];
    }
    [cards, r] = draw(r, street === 'flop' ? 5 : 7, []);
    const hole: [Card, Card] = [cards[0]!, cards[1]!];
    if (!isCheckHand(hole)) continue;
    const board = cards.slice(2);
    if (street === 'river' && !basicFlopChecks(hole, board.slice(0, 3))) continue;
    return [makeSpot(street, hole, board), r];
  }
  throw new Error('drill: could not sample a spot');
}

/** Rejection sampling on a predicate over fresh random spots. */
function sampleWhere(
  rng: RngState,
  street: DecisionStreet,
  ok: (s: DrillSpot) => boolean,
): [DrillSpot, RngState] {
  let r = rng;
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    let s: DrillSpot;
    [s, r] = sampleStreet(r, street);
    if (ok(s)) return [s, r];
  }
  throw new Error('drill: could not sample a spot for the filter');
}

// ---------- "interesting" (close) spots ----------
function runSync(req: PreviewRequest): DecisionPreview {
  const g = previewJob(req);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
  }
}

/** Regret of the second-best meaningful option (Bet 3x is a decoy, never best). */
export function secondBestRegret(p: DecisionPreview): number {
  const rs = p.options
    .filter((o) => !(o.action.type === 'play' && o.action.multiple === 3))
    .map((o) => Number(o.regret.num) / Number(o.regret.den))
    .sort((a, b) => a - b);
  return rs[1] ?? Infinity;
}

const CLOSE_THRESHOLD = 0.25;
/** Flop: exact previews are too slow to sample with, so categories stand in for "close". */
const FLOP_CLOSE: ReadonlySet<DrillCategoryId> = new Set([
  'flop-flush-draw',
  'flop-straight-draw',
  'flop-deuces',
]);

function isClose(s: DrillSpot): boolean {
  if (s.street === 'flop') return FLOP_CLOSE.has(s.category);
  const p = runSync({
    street: s.street,
    hole: s.hole,
    board: s.board,
    blindPaytable: 'blind-standard',
    ante: 100,
  });
  return secondBestRegret(p) < CLOSE_THRESHOLD;
}

// ---------- public API ----------
function randomClassSpot(rng: RngState, cls: string): [DrillSpot, RngState] {
  const { hi, lo, suited, pair } = parseClass(cls);
  let r = rng;
  const [s1, r1] = randBelow(r, 4);
  r = r1;
  let s2: number;
  if (suited) s2 = s1;
  else {
    let d: number;
    [d, r] = randBelow(r, 3);
    s2 = (s1 + 1 + d) % 4;
  }
  if (pair && s1 === s2) s2 = (s1 + 1) % 4;
  const hole: [Card, Card] = [hi * 4 + s1, lo * 4 + s2];
  return [makeSpot('preflop', hole, []), r];
}

export function nextSpot(rng: RngState, filter: DrillFilter): [DrillSpot, RngState] {
  let r = rng;
  if (filter.focus && filter.focus.length > 0) {
    let i: number;
    [i, r] = randBelow(r, filter.focus.length);
    const f = filter.focus[i]!;
    if (f.includes(':')) return [spotFromCode(f), r];
    return randomClassSpot(r, f);
  }
  let street: DecisionStreet;
  if (filter.category) street = DRILL_STREET_OF[filter.category];
  else if (filter.street === 'mixed') {
    let k: number;
    [k, r] = randBelow(r, 3);
    street = (['preflop', 'flop', 'river'] as const)[k]!;
  } else street = filter.street;

  const cat = filter.category;
  const base = (s: DrillSpot): boolean => !cat || s.category === cat;
  if (!filter.interesting) return sampleWhere(r, street, base);

  // ~60% close spots: pick the wanted kind first, then sample until it matches.
  const [u, r2] = randBelow(r, 1000);
  r = r2;
  const wantClose = u < 600;
  return sampleWhere(r, street, (s) => base(s) && isClose(s) === wantClose);
}

// ---------- grading ----------
const sameAction = (a: DecisionAction, b: DecisionAction): boolean =>
  a.type === b.type && (a.type !== 'play' || (b.type === 'play' && a.multiple === b.multiple));

/**
 * Grades `chosen` against the lens (D33: correct iff tier is best or close).
 * perfect: regret vs the exact best. practical: the basic card's action is the reference and
 * regret is measured against it (never negative); the exact preview is still returned.
 */
export function gradeSpot(
  spot: DrillSpot,
  chosen: DecisionAction,
  preview: DecisionPreview,
  lens: 'perfect' | 'practical',
): DrillGrade {
  const opt = (a: DecisionAction) => preview.options.find((o) => sameAction(o.action, a));
  const chosenOpt = opt(chosen);
  if (!chosenOpt) throw new Error('chosen action is not an option here');
  const perfectBest = preview.options[preview.bestIndex]!;
  let best = perfectBest.action;
  let regret = chosenOpt.regret;
  if (lens === 'practical') {
    best =
      spot.street === 'flop' || spot.street === 'river' || spot.street === 'preflop'
        ? strategyAction('basic', spot.hole, spot.board)
        : best;
    const ref = opt(best) ?? perfectBest;
    const diff = fracSub(chosenOpt.ev, ref.ev);
    regret = diff.num >= 0n ? { num: 0n, den: 1n } : { num: -diff.num, den: diff.den };
  }
  const tier = lens === 'perfect' ? chosenOpt.tier : decisionTier(regret);
  return {
    correct: tier === 'best' || tier === 'close',
    chosen,
    best,
    regret,
    lens,
    chartCell: spot.street === 'preflop' ? handClass(spot.hole) : spot.category,
    preview,
  };
}
