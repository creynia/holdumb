// The `simulate` job (simulator.md §5.3, D32): seeded multi-session runs on the real engine.
// Pure; a generator, so the runner can slice it and cancel it by abandoning it (gen.return()).
import type { Progress } from '../engine/job';
import { applyAction, createGame, equity, visibleView } from '../engine/game';
import { validateAction } from '../engine/validate';
import { HAND_CATEGORIES } from '../engine/types';
import type { DecisionAction, GameState, PlayMultiple } from '../engine/types';
import { evPerHandCents } from './metrics';
import { STRATEGIES } from './presets';
import type { SessionSeries, SimulateRequest, SimulateResult, StrategySpec } from './types';

const YIELD_EVERY = 50;
const CATEGORY_INDEX: ReadonlyMap<string, number> = new Map(HAND_CATEGORIES.map((c, i) => [c, i]));

/** The action to take, downgraded to what the rack can afford (only when busting is allowed). */
function affordable(state: GameState, want: DecisionAction): DecisionAction {
  if (validateAction(state, want).ok) return want;
  if (want.type === 'play') {
    for (let m = want.multiple - 1; m >= 1; m--) {
      const a: DecisionAction = { type: 'play', multiple: m as PlayMultiple };
      if (validateAction(state, a).ok) return a;
    }
    const check: DecisionAction = { type: 'check' };
    if (validateAction(state, check).ok) return check;
    return { type: 'fold' };
  }
  return want;
}

interface SessionOut {
  eq: Int32Array; // length hands + 1
  bustedAt: number; // index into eq, or -1
  played: number;
  outcomes: { win: number; lose: number; tie: number; fold: number };
  cats: Int32Array;
  bonus: number;
  trips: number;
}

function* session(
  req: SimulateRequest,
  spec: StrategySpec,
  index: number,
  tick: (n: number) => Progress | undefined,
): Generator<Progress | undefined, SessionOut, void> {
  const stopAtBust = req.stopAtBust ?? true;
  // 'perfect' decides the flop by enumeration; long runs use `expert` as its stand-in (D18).
  const strat = STRATEGIES[spec.id === 'perfect' ? 'expert' : spec.id];
  let state = createGame({
    rules: req.rules,
    bankroll: req.bankroll,
    seed: req.seed + index,
    bets: { ante: spec.ante, trips: spec.trips },
  });
  const out: SessionOut = {
    eq: new Int32Array(req.hands + 1),
    bustedAt: -1,
    played: 0,
    outcomes: { win: 0, lose: 0, tie: 0, fold: 0 },
    cats: new Int32Array(10),
    bonus: 0,
    trips: 0,
  };
  const threshold = 6 * spec.ante + spec.trips;
  const start = req.bankroll;
  out.eq[0] = start;
  let stopped = false;
  for (let h = 1; h <= req.hands; h++) {
    if (!stopped) {
      const eq0 = equity(state);
      const hitLimit =
        (req.stopWin !== undefined && eq0 - start >= req.stopWin) ||
        (req.stopLoss !== undefined && start - eq0 >= req.stopLoss);
      const bust = eq0 < threshold;
      if (bust && out.bustedAt < 0) out.bustedAt = h - 1;
      if (hitLimit || (bust && (stopAtBust || eq0 < spec.ante * 2 + spec.trips))) stopped = true;
    }
    if (stopped) {
      out.eq[h] = out.eq[h - 1]!;
    } else {
      state = dealAndPlay(state, (v) => strat.decide(v));
      const res = state.hand!.result!;
      out.played++;
      out.outcomes[res.outcome]++;
      out.cats[CATEGORY_INDEX.get(res.player.category)!]!++;
      for (const w of res.wagers) {
        if (w.reason === 'blind-bonus') out.bonus++;
        else if (w.reason === 'trips-pays') out.trips++;
      }
      out.eq[h] = equity(state);
    }
    const p = tick(1);
    if (p) yield p;
  }
  return out;
}

function dealAndPlay(
  state: GameState,
  decide: (v: ReturnType<typeof visibleView>) => DecisionAction,
): GameState {
  const dealt = applyAction(state, { type: 'deal' });
  if (!dealt.ok) throw new Error(`simulate: ${dealt.error.message}`);
  let s = dealt.state;
  while (s.street === 'preflop' || s.street === 'flop' || s.street === 'river') {
    const a = affordable(s, decide(visibleView(s)));
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`simulate: ${r.error.message}`);
    s = r.state;
  }
  return s;
}

function percentile(sorted: Int32Array, p: number): number {
  return sorted[Math.floor(p * (sorted.length - 1))]!;
}

export function* simulateJob(
  req: SimulateRequest,
): Generator<Progress | undefined, SimulateResult, void> {
  const t0 = Date.now();
  const specs = [req.strategy, ...(req.compare ?? [])];
  const total = specs.length * req.sessions * req.hands;
  let done = 0;
  let sinceYield = 0;
  const tick = (n: number): Progress | undefined => {
    done += n;
    sinceYield += n;
    if (sinceYield >= YIELD_EVERY) {
      sinceYield = 0;
      return { done, total };
    }
    return undefined;
  };
  const series: SessionSeries[] = [];
  for (const spec of specs) {
    const n = req.sessions;
    const cols = req.hands + 1;
    const matrix = new Int32Array(n * cols);
    const finals = new Int32Array(n);
    const outcomes = { win: 0, lose: 0, tie: 0, fold: 0 };
    const byCategory = new Int32Array(10);
    const bustedAt: number[] = [];
    let handsPlayed = 0;
    let bonus = 0;
    let trips = 0;
    for (let i = 0; i < n; i++) {
      const s = yield* session(req, spec, i, tick);
      matrix.set(s.eq, i * cols);
      finals[i] = s.eq[req.hands]!;
      handsPlayed += s.played;
      bonus += s.bonus;
      trips += s.trips;
      for (const k of ['win', 'lose', 'tie', 'fold'] as const) outcomes[k] += s.outcomes[k];
      for (let c = 0; c < 10; c++) byCategory[c]! += s.cats[c]!;
      if (s.bustedAt >= 0) bustedAt.push(s.bustedAt);
    }
    const perHand = evPerHandCents({
      ...spec,
      id: spec.id === 'perfect' ? 'expert' : spec.id,
    });
    const expected = new Float64Array(cols);
    for (let h = 0; h < cols; h++) expected[h] = req.bankroll + h * perHand;
    let mean = 0;
    for (const f of finals) mean += f;
    mean /= n;
    let varSum = 0;
    for (const f of finals) varSum += (f - mean) ** 2;
    const sd = n > 1 ? Math.sqrt(varSum / (n - 1)) : 0;
    const out: SessionSeries = {
      strategy: spec,
      expected,
      finals,
      meanFinal: mean,
      meanFinalCi95: n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0,
      bustRate: bustedAt.length / n,
      probAhead: finals.filter((f) => f > req.bankroll).length / n,
      handsPlayed,
      outcomes,
      byCategory,
      blindBonusHits: bonus,
      tripsHits: trips,
    };
    if (n === 1) out.equity = matrix;
    else {
      out.p10 = new Float64Array(cols);
      out.p50 = new Float64Array(cols);
      out.p90 = new Float64Array(cols);
      out.survival = new Float64Array(cols);
      const col = new Int32Array(n);
      const bustCount = new Int32Array(cols + 1);
      for (const b of bustedAt) bustCount[b]!++;
      let busted = 0;
      for (let h = 0; h < cols; h++) {
        for (let i = 0; i < n; i++) col[i] = matrix[i * cols + h]!;
        col.sort();
        out.p10[h] = percentile(col, 0.1);
        out.p50[h] = percentile(col, 0.5);
        out.p90[h] = percentile(col, 0.9);
        busted += bustCount[h]!;
        out.survival[h] = 1 - busted / n;
        if (h % 64 === 0) yield { done, total };
      }
    }
    series.push(out);
  }
  return { series, ms: Date.now() - t0 };
}
