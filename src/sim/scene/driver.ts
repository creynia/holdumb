// SimDriver: the framework-free heart of the Simulator container. It owns the engine state, the
// scene runtime and the EV previews, so the same code runs in the browser (wrapped by
// ui/Simulator.tsx) and in the every-scene-completes test (tests/sim/lessons.test.ts).
import {
  applyAction,
  createGame,
  equity,
  handRecord,
  pushRecord,
  startHand,
  visibleView,
} from '../engine';
import type {
  Action,
  Card,
  Cents,
  DecisionStreet,
  GameEvent,
  GameState,
  HandRecord,
  HandResult,
  HandTierCode,
  TableRules,
  TripsPaytableId,
} from '../engine';
import { tripsEdge } from '../math/edges';
import {
  ZERO as ZERO_CENTS,
  add,
  div,
  frac,
  neg,
  round,
  scale,
  sub,
  toRatio,
} from '../math/fraction';
import type {
  DecisionOption,
  DecisionPreview,
  DecisionTier,
  Fraction,
  PreviewRequest,
} from '../math/types';
import { categorize } from '../strategy/categories';
import { spotCode } from '../strategy/drill';
import type { StrategyId } from '../strategy/types';
import { effectiveGate, gatedOptions, optionKeyOfAction, gateAllows } from './gate';
import type { Gate } from './gate';
import {
  activeGate,
  currentStep,
  gateAction,
  hasAcknowledged,
  initScene,
  needsBestVerdict,
  observe,
} from './runner';
import type { SceneContext } from './runner';
import { sceneEvMode, stepConfirmOn, stepEvMode } from './modes';
import type { SixCardOutcome, SixCardSetting } from '../engine/sixcard';
import type {
  CircleId,
  ConfirmOn,
  EvMode,
  OptionKey,
  SceneConfig,
  SceneInput,
  SceneRuntime,
  SceneStep,
} from './types';

export type PreviewFn = (
  req: PreviewRequest,
  opts: {
    key: string;
    signal?: AbortSignal;
    onProgress?: (p: { done: number; total: number }) => void;
  },
) => Promise<DecisionPreview>;

/** Same shapes as ui/types.ts SimulatorEvent (the scene layer cannot import ui). */
export type DriverEvent =
  | { type: 'ready' }
  | { type: 'previewed'; preview: DecisionPreview; option: string }
  | {
      type: 'action-confirmed';
      action: Action;
      events: GameEvent[];
      state: GameState;
      preview?: DecisionPreview;
    }
  | { type: 'action-rejected'; action: Action; reason: string }
  | { type: 'hand-settled'; result: HandResult; state: GameState }
  | { type: 'step-started'; stepId: string }
  | { type: 'step-completed'; stepId: string }
  | { type: 'scene-completed'; sceneId: string }
  | { type: 'auto-play-completed'; hands: number; strategy: string };

/**
 * The luck vs mistake ledger (curriculum 8.5). Expected values are exact cents (Fractions) and are
 * rounded once, in the view, so the figures on screen add up to the result to the cent.
 */
export interface SessionTotals {
  hands: number;
  /** Hands where every decision had an EV preview (only these feed the luck split). */
  scored: number;
  /** Sum of the best EV at each scored hand's first decision (exact cents). */
  expectedCents: Fraction;
  /** Sum of regrets at the decisions taken (exact cents). */
  mistakeCents: Fraction;
  /** Actual Ante+Blind+Play result of the scored hands. */
  scoredMainCents: number;
  /** Antes of the scored hands: the denominator of "your edge per Ante". */
  scoredAnteCents: number;
  tripsCents: number;
  /** Trips action over every hand. */
  tripsWageredCents: number;
  /** Expected Trips result, −edge × wager per hand (exact cents). */
  tripsExpectedCents: Fraction;
  /** I062 Six Card Bonus: result, action and exact expectation (−edge × wager). */
  sixCardCents: number;
  sixCardWageredCents: number;
  sixCardExpectedCents: Fraction;
  decisions: number;
  mistakes: number;
  /** Money added to the rack mid-session (I083). Net = equity - (start + topUps). */
  topUpCents: number;
  /** I078: hands the table played itself (Watch). Kept out of every line above but `hands`. */
  watchedHands: number;
  /** Their whole result (main bets and Trips). */
  watchedCents: number;
  /** Their action (all wagers), kept out of "Total wagered". */
  watchedWageredCents: number;
}
export const EMPTY_TOTALS: SessionTotals = {
  hands: 0,
  scored: 0,
  expectedCents: ZERO_CENTS,
  mistakeCents: ZERO_CENTS,
  scoredMainCents: 0,
  scoredAnteCents: 0,
  tripsCents: 0,
  tripsWageredCents: 0,
  tripsExpectedCents: ZERO_CENTS,
  sixCardCents: 0,
  sixCardWageredCents: 0,
  sixCardExpectedCents: ZERO_CENTS,
  decisions: 0,
  mistakes: 0,
  topUpCents: 0,
  watchedHands: 0,
  watchedCents: 0,
  watchedWageredCents: 0,
};

export interface SessionView extends SessionTotals {
  net: Cents;
  /** Ante+Blind+Play+Trips (the engine's stats) + Six Card action over the session. */
  wageredCents: Cents;
  /** round(expected + expected Trips + expected Six Card): "Perfect play expects", rounded once. */
  perfectCents: Cents;
  /** round(mistakeCents): what the decisions cost against perfect play. */
  mistakesRoundedCents: Cents;
  /** net − perfect + mistakes: the displayed split adds up to the result to the cent. */
  luckCents: Cents;
  tripsExpectedRoundedCents: Cents;
  sixCardExpectedRoundedCents: Cents;
  /** −(expected − mistakes) / antes of the scored hands; null before the first scored hand. */
  edgePerAnte: Fraction | null;
  /** Drill spot codes of the decisions graded small or worse, newest first (I056). */
  mistakeSpots: string[];
}

/** Most recent distinct mistakes kept for "Review N mistakes". */
export const MAX_MISTAKE_SPOTS = 20;

export interface PreviewState {
  key: string | null;
  status: 'idle' | 'pending' | 'ready' | 'error';
  value: DecisionPreview | null;
  progress: number;
}

export interface Rejection {
  text: string;
  seq: number;
}

export interface DriverView {
  version: number;
  state: GameState;
  /** Events of the last action (the Felt animates these). */
  lastEvents: readonly GameEvent[];
  eventSeq: number;
  scene: SceneConfig;
  rt: SceneRuntime;
  step: SceneStep | undefined;
  stepCount: number;
  /** The step's condition is met, or it needs the Next button. */
  showNext: boolean;
  /** The next step starts a new hand; the finished one stays on the table until "Next hand". */
  pendingStart: boolean;
  gate: Gate;
  /** Options the gate leaves on the current street (undefined = all). */
  allowedOptions: OptionKey[] | undefined;
  dealLocked: boolean;
  betsLocked: boolean;
  /** Clear (betting) / Change bets (settled) is gated by the scene. */
  clearLocked: boolean;
  preview: PreviewState;
  /** EV visibility for the current step (D39): the scene's in a lesson, the table's in the sandbox. */
  evMode: EvMode;
  /** Confirm policy for the current step (D39); in the sandbox the container applies the user's. */
  confirmOn: ConfirmOn;
  rejection: Rejection | null;
  session: SessionView;
  startEquity: Cents;
  result: HandResult | null;
  /** The last HISTORY_LIMIT settled hands, newest first (engine/log.ts HandRecord). */
  history: readonly HandRecord[];
  /** I062: the Six Card Bonus setting (sandbox) and the last hand's outcome. */
  sixCard: { setting: SixCardSetting | null; last: SixCardOutcome | null };
}

export interface DriverOptions {
  scene?: SceneConfig;
  mode: 'sandbox' | 'scene';
  preview: PreviewFn;
  seed: number;
  /** Trips paytable for the sandbox (scenes use their own `rules.trips`, default 8-6-5). */
  paytable?: TripsPaytableId;
  /** Sandbox only: the table's EV mode. In a lesson the scene decides and this is ignored (D39). */
  evMode?: EvMode;
  onEvent?: (e: DriverEvent) => void;
  restore?: {
    state: GameState;
    startEquity: Cents;
    totals: SessionTotals;
    history?: readonly HandRecord[];
    mistakeSpots?: string[];
  };
}

const TIER_CODE: Record<DecisionTier, HandTierCode> = {
  best: 'b',
  close: 'c',
  small: 's',
  costly: 'm',
  blunder: 'x',
};

const ZERO = { ante: 0, blind: 0, play: 0, trips: 0 } as const;
const isDecision = (s: string): s is DecisionStreet =>
  s === 'preflop' || s === 'flop' || s === 'river';

function sameOption(o: DecisionOption, a: Action): boolean {
  return o.action.type === a.type && optionKeyOfAction(o.action) === optionKeyOfAction(a);
}

/** Chips back on the rack; the felt is empty. */
function refund(state: GameState): GameState {
  return { ...state, street: 'betting', hand: null, bankroll: equity(state), bets: { ...ZERO } };
}

/** D38: a rebuild passes `equity(prev)` as the bankroll; stats, RNG stream and hand count carry on. */
function rebuild(
  prev: GameState,
  bankroll: Cents,
  bets: { ante?: Cents; trips?: Cents },
): GameState {
  const g = createGame({
    rules: prev.rules,
    bankroll,
    seed: prev.seed,
    bets,
    forcedDeals: [...prev.forcedDeals],
  });
  return { ...g, rng: prev.rng, handCount: prev.handCount, stats: prev.stats };
}

/**
 * I062: the Six Card Bonus rules, registered by `./sixcard` when it loads (the lazy Six Card panel,
 * tests). Kept out of this module so the side bet's tables and evaluator stay out of the
 * first-paint bundle. Until they are registered the table simply has no Six Card bet.
 */
export interface SixCardRules {
  valid(bet: Cents): boolean;
  apply(
    state: GameState,
    setting: SixCardSetting | null,
  ): { state: GameState; outcome: SixCardOutcome | null };
  add(t: SessionTotals, o: SixCardOutcome | null): SessionTotals;
  /** The exact edge (−EV per unit wagered) of a Six Card paytable. */
  edge(paytable: SixCardSetting['paytable']): Fraction;
}
let sixCardRules: SixCardRules | null = null;
export function registerSixCardRules(r: SixCardRules): void {
  sixCardRules = r;
}
/** The registered Six Card edge, or null before the Six Card UI has loaded. */
export function sixCardEdgeOf(paytable: SixCardSetting['paytable']): Fraction | null {
  return sixCardRules ? sixCardRules.edge(paytable) : null;
}

export class SimDriver {
  readonly scene: SceneConfig;
  readonly mode: 'sandbox' | 'scene';
  private opts: DriverOptions;
  private game: GameState;
  private rt: SceneRuntime;
  private startEq: Cents;
  private totals: SessionTotals;
  private mistakeSpots: string[] = [];
  private hand: {
    base: Fraction | null;
    regret: Fraction;
    scored: boolean;
    ante: number;
    mistakes: number;
    watched: boolean;
    /** One entry per decision taken: its tier and exact regret when a preview scored it. */
    notes: ({ tier: HandTierCode; regret: string } | null)[];
    /** Drill spots of this hand's mistakes, in order; kept only if the hand ends scored. */
    spots: string[];
  } | null = null;
  private history: HandRecord[] = [];
  private lastEvents: GameEvent[] = [];
  private eventSeq = 0;
  private pv: PreviewState = { key: null, status: 'idle', value: null, progress: 0 };
  private pvPromise: Promise<DecisionPreview | null> = Promise.resolve(null);
  private pvAbort: AbortController | null = null;
  private pendingStart: SceneStep['startAt'] | null = null;
  private rejection: Rejection | null = null;
  private evMode: EvMode;
  private version = 0;
  private listeners = new Set<() => void>();
  private cached: DriverView | null = null;
  private busy = false;
  private watching = false;
  private sixCard: SixCardSetting | null = null;
  private sixCardLast: SixCardOutcome | null = null;
  private disposed = false;

  constructor(opts: DriverOptions) {
    this.opts = opts;
    this.mode = opts.mode;
    this.scene = opts.scene ?? { id: 'sandbox', version: 1 };
    this.evMode =
      opts.mode === 'sandbox' ? (opts.evMode ?? sceneEvMode(this.scene)) : sceneEvMode(this.scene);
    const sc = this.scene;
    if (opts.restore) {
      this.game = opts.restore.state;
      this.startEq = opts.restore.startEquity;
      this.totals = { ...EMPTY_TOTALS, ...opts.restore.totals };
      this.history = [...(opts.restore.history ?? [])];
      this.mistakeSpots = (opts.restore.mistakeSpots ?? []).slice(0, MAX_MISTAKE_SPOTS);
      // A restored hand has no earlier previews: it stays out of the luck split.
      if (this.game.hand && !this.game.hand.result) {
        // The hand's earlier decisions have no notes (no preview survives a reload): one null
        // each, so the history record lines notes up with hand.decisions.
        this.beginHandTrack(this.game.hand.decisions.length);
        this.hand!.scored = false;
      }
    } else {
      const { trips, ...rest } = sc.rules ?? {};
      const rules: Partial<TableRules> = {
        ...rest,
        tripsPaytable:
          trips ?? (opts.mode === 'scene' ? 'trips-8-6-5' : (opts.paytable ?? 'trips-8-6-5')),
      };
      this.game = createGame({
        rules,
        bankroll: sc.bankroll ?? 50_000,
        seed: sc.seed ?? opts.seed,
        bets: sc.bets,
        forcedDeals: sc.deals ? [...sc.deals] : undefined,
        startAt: sc.startAt,
      });
      this.startEq = equity(this.game);
      this.totals = { ...EMPTY_TOTALS };
      if (this.game.hand) this.beginHandTrack();
    }
    this.rt = initScene(sc, this.game.stats.hands);
    if (!this.rt.done) {
      this.enterStep();
      this.settle(this.rt);
    }
    this.afterChange();
  }

  // ---------- subscription / view ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private notify(): void {
    this.version++;
    this.cached = null;
    for (const l of [...this.listeners]) l();
  }
  private emit(e: DriverEvent): void {
    this.opts.onEvent?.(e);
  }

  get view(): DriverView {
    if (this.cached) return this.cached;
    const step = currentStep(this.scene, this.rt);
    const gate = activeGate(this.scene, this.rt);
    const modeNow = this.mode === 'sandbox' ? this.evMode : stepEvMode(this.scene, step);
    const st = this.game.street;
    const decision = isDecision(st);
    const opts = decision ? gatedOptions(gate, st) : undefined;
    const allowedOptions = decision && gate.options ? opts : undefined;
    const t = this.totals;
    const net = equity(this.game) - this.startEq - t.topUpCents;
    const perfectCents = round(
      add(add(t.expectedCents, t.tripsExpectedCents), t.sixCardExpectedCents),
    );
    const mistakesRoundedCents = round(t.mistakeCents);
    const w = this.game.stats.wagered;
    this.cached = {
      version: this.version,
      state: this.game,
      lastEvents: this.lastEvents,
      eventSeq: this.eventSeq,
      scene: this.scene,
      rt: this.rt,
      step,
      stepCount: this.scene.steps?.length ?? 0,
      showNext:
        !!step &&
        !this.pendingStart &&
        (hasAcknowledged(step.completeWhen) || (step.advance === 'button' && !!this.rt.satisfied)),
      pendingStart: !!this.pendingStart,
      gate,
      allowedOptions,
      dealLocked: !gateAllows(gate, { type: 'deal' }) || !!this.pendingStart,
      betsLocked: !gateAllows(gate, { type: 'set-bet', wager: 'ante', amount: 0 }),
      clearLocked:
        st === 'settled'
          ? !gateAllows(gate, { type: 'clear' })
          : !gateAllows(gate, { type: 'set-bet', wager: 'ante', amount: 0 }),
      preview: this.pv,
      evMode: modeNow,
      confirmOn: stepConfirmOn(this.scene, step),
      rejection: this.rejection,
      session: {
        ...t,
        net,
        // Your action only: the watched hands' bets are the table's (I078). Six Card is a wager
        // result settled at the deal, in its own ledger, watched or not (I062).
        wageredCents:
          w.ante + w.blind + w.play + w.trips - t.watchedWageredCents + t.sixCardWageredCents,
        perfectCents,
        mistakesRoundedCents,
        // Watched hands are not your play: their result is its own line, outside the luck split.
        luckCents: net - t.watchedCents - perfectCents + mistakesRoundedCents,
        tripsExpectedRoundedCents: round(t.tripsExpectedCents),
        sixCardExpectedRoundedCents: round(t.sixCardExpectedCents),
        edgePerAnte:
          t.scoredAnteCents > 0
            ? div(neg(sub(t.expectedCents, t.mistakeCents)), frac(t.scoredAnteCents))
            : null,
        mistakeSpots: this.mistakeSpots,
      },
      startEquity: this.startEq,
      result: this.game.hand?.result ?? null,
      history: this.history,
      sixCard: { setting: this.sixCard, last: this.sixCardLast },
    };
    return this.cached;
  }

  snapshotData(): {
    state: GameState;
    startEquity: Cents;
    totals: SessionTotals;
    mistakeSpots: string[];
    evMode: EvMode;
    history: readonly HandRecord[];
  } {
    return {
      state: this.game,
      startEquity: this.startEq,
      totals: this.totals,
      mistakeSpots: this.mistakeSpots,
      evMode: this.evMode,
      history: this.history,
    };
  }

  /** The table's EV mode (sandbox; a lesson keeps its scene's mode). */
  setEvMode(mode: EvMode): void {
    if (this.mode !== 'sandbox' || mode === this.evMode) return;
    this.evMode = mode;
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    this.pvAbort?.abort();
    this.listeners.clear();
  }

  // ---------- context for the runner ----------

  private ctx(streetBefore?: GameState['street']): SceneContext {
    return {
      street: this.game.street,
      equity: equity(this.game),
      bets: this.game.bets,
      hands: this.game.stats.hands,
      streetBefore,
    };
  }

  // ---------- previews (D18) ----------

  private request(state: GameState): PreviewRequest | null {
    const h = state.hand;
    if (!h || !isDecision(state.street)) return null;
    const v = visibleView(state);
    return {
      street: state.street,
      hole: h.deal.player,
      board: v.board,
      blindPaytable: state.rules.blindPaytable,
      ante: state.bets.ante,
    };
  }

  private beginPreview(): void {
    const st = this.game;
    const req = this.request(st);
    if (!req) {
      if (this.pv.status !== 'idle') {
        this.pvAbort?.abort();
        this.pv = { key: null, status: 'idle', value: null, progress: 0 };
        this.pvPromise = Promise.resolve(null);
      }
      return;
    }
    const key = `${st.hand!.n}:${st.street}`;
    if (this.pv.key === key) return;
    this.pvAbort?.abort();
    const ac = new AbortController();
    this.pvAbort = ac;
    this.pv = { key, status: 'pending', value: null, progress: 0 };
    const run = this.opts.preview(req, {
      key: 'preview',
      signal: ac.signal,
      onProgress: (p) => {
        if (this.pv.key !== key || this.pv.status !== 'pending') return;
        this.pv = { ...this.pv, progress: p.total ? p.done / p.total : 0 };
        this.notify();
      },
    });
    this.pvPromise = run.then(
      (value) => {
        if (this.pv.key === key && !this.disposed) {
          this.pv = { key, status: 'ready', value, progress: 1 };
          this.notify();
        }
        return value;
      },
      () => {
        if (this.pv.key === key && !ac.signal.aborted && !this.disposed) {
          this.pv = { key, status: 'error', value: null, progress: 0 };
          this.notify();
        }
        return null;
      },
    );
  }

  /** Resolves with the current decision's preview (null when it failed). */
  async currentPreview(): Promise<DecisionPreview | null> {
    return this.pv.status === 'ready' ? this.pv.value : this.pvPromise;
  }

  // ---------- hand tracking (luck vs mistakes) ----------

  private beginHandTrack(decisionsSoFar = 0): void {
    this.hand = {
      base: null,
      regret: ZERO_CENTS,
      scored: true,
      ante: this.game.bets.ante,
      mistakes: 0,
      watched: this.watching,
      notes: Array<null>(decisionsSoFar).fill(null),
      spots: [],
    };
  }
  private trackDecision(pv: DecisionPreview | null, action: Action): void {
    if (!this.hand || this.hand.watched) return;
    this.totals = { ...this.totals, decisions: this.totals.decisions + 1 };
    const opt = pv?.options.find((o) => sameOption(o, action));
    if (!pv || !opt) {
      this.hand.scored = false;
      this.hand.notes.push(null);
      return;
    }
    this.hand.notes.push({ tier: TIER_CODE[opt.tier], regret: toRatio(opt.regret) });
    if (this.hand.base === null) this.hand.base = pv.options[pv.bestIndex]!.evCents;
    this.hand.regret = add(this.hand.regret, scale(opt.regret, this.hand.ante));
    // Counted per hand and added only if the hand ends scored (see finishHandTrack).
    if (opt.tier !== 'best' && opt.tier !== 'close') {
      this.hand.mistakes += 1;
      this.noteMistakeSpot();
    }
  }
  /** Notes the decision on the table now as a Drill spot (the full board, so it replays). */
  private noteMistakeSpot(): void {
    const deal = this.game.hand?.deal;
    if (!deal || !this.hand) return;
    const street = this.game.street;
    if (street !== 'preflop' && street !== 'flop' && street !== 'river') return;
    const hole: [Card, Card] = [deal.player[0], deal.player[1]];
    const board = deal.board.slice(0, street === 'preflop' ? 0 : street === 'flop' ? 3 : 5);
    const code = spotCode({ street, hole, board, category: categorize(hole, board) });
    if (!this.hand.spots.includes(code)) this.hand.spots.push(code);
  }
  private finishHandTrack(result: HandResult): void {
    const h = this.hand;
    this.hand = null;
    // The history row (auto-play never comes through here: it runs in the EV client's simulate job).
    const settledHand = this.game.hand;
    if (settledHand) {
      const { ante, trips } = this.game.bets;
      this.history = pushRecord(
        this.history,
        // A watched hand is recorded (it was played on your table) but carries no tier or
        // regret notes: Watch's moves are not yours to grade (I078).
        handRecord(settledHand, result, { ante, trips }, h && !h.watched ? h.notes : []),
      );
    }
    if (h?.watched) {
      // AC2: a watched hand is the table's play, not yours: no Trips, luck or mistake lines.
      this.totals = {
        ...this.totals,
        hands: this.totals.hands + 1,
        watchedHands: this.totals.watchedHands + 1,
        watchedCents: this.totals.watchedCents + result.net,
        watchedWageredCents:
          this.totals.watchedWageredCents + result.wagers.reduce((a, x) => a + x.amount, 0),
      };
      return;
    }
    let main = 0;
    let trips = 0;
    let tripsBet = 0;
    for (const w of result.wagers) {
      if (w.wager === 'trips') {
        trips += w.profit;
        tripsBet += w.amount;
      } else main += w.profit;
    }
    const t = {
      ...this.totals,
      hands: this.totals.hands + 1,
      tripsCents: this.totals.tripsCents + trips,
      tripsWageredCents: this.totals.tripsWageredCents + tripsBet,
      // Trips pays on your own hand whatever you decide, so its expectation is −edge × wager.
      tripsExpectedCents:
        tripsBet > 0
          ? add(
              this.totals.tripsExpectedCents,
              scale(neg(tripsEdge(this.game.rules.tripsPaytable).edge), tripsBet),
            )
          : this.totals.tripsExpectedCents,
    };
    if (h && h.scored && h.base !== null) {
      t.scored += 1;
      t.expectedCents = add(t.expectedCents, h.base);
      t.mistakeCents = add(t.mistakeCents, h.regret);
      t.mistakes = t.mistakes + h.mistakes;
      // Same rule as the mistake count: only a fully scored hand feeds the review list.
      for (const code of h.spots)
        this.mistakeSpots = [code, ...this.mistakeSpots.filter((c) => c !== code)].slice(
          0,
          MAX_MISTAKE_SPOTS,
        );
      t.scoredMainCents += main;
      t.scoredAnteCents += h.ante;
    }
    this.totals = t;
  }

  // ---------- step entry ----------

  private enterStep(): void {
    const step = currentStep(this.scene, this.rt);
    if (!step) return;
    this.emit({ type: 'step-started', stepId: step.id });
    if (step.setup) {
      const eq = equity(this.game);
      const bets = {
        ante: step.setup.bets?.ante ?? this.game.bets.ante,
        trips: step.setup.bets?.trips ?? this.game.bets.trips,
      };
      const bankroll = step.setup.bankroll ?? eq;
      if (this.game.street === 'betting' || this.game.street === 'settled') {
        this.game = rebuild(this.game, bankroll, bets);
        this.hand = null;
      }
    }
    if (step.deals) this.game = { ...this.game, forcedDeals: [...step.deals] };
    if (step.startAt) {
      if (this.game.street === 'settled') this.pendingStart = step.startAt;
      else this.applyStartAt(step.startAt);
    }
  }

  private applyStartAt(sa: NonNullable<SceneStep['startAt']>): void {
    let st = this.game;
    if (isDecision(st.street)) st = refund(st);
    if (st.street === 'betting' && st.bets.ante <= 0) {
      const ante = this.scene.bets?.ante ?? 1000;
      const r = applyAction(st, { type: 'set-bet', wager: 'ante', amount: ante });
      if (r.ok) st = r.state;
    }
    let res = startHand(st, sa);
    if (!res.ok) {
      // Out of chips for the lesson hand: top the rack up to the scene's bankroll.
      const top = Math.max(equity(st), this.scene.bankroll ?? 50_000);
      st = rebuild(refund(st), top, { ante: st.bets.ante || 1000, trips: st.bets.trips });
      res = startHand(st, sa);
    }
    if (!res.ok) throw new Error(`scene ${this.scene.id}: cannot start hand: ${res.error.message}`);
    this.game = res.state;
    this.lastEvents = res.events;
    this.eventSeq++;
    this.beginHandTrack();
    const settled = res.events.find((e) => e.type === 'hand-settled');
    if (settled && settled.type === 'hand-settled') this.finishHandTrack(settled.result);
  }

  /** Press "Next hand": the held step now starts its own hand. */
  nextHand(): void {
    const sa = this.pendingStart;
    if (!sa) return;
    this.pendingStart = null;
    this.rejection = null;
    this.applyStartAt(sa);
    this.settle(observe(this.scene, this.rt, null, this.ctx()));
    this.afterChange();
  }

  /** Fold a runner result in, entering every step it advanced through. */
  private settle(first: SceneRuntime): void {
    let rt = first;
    for (let guard = 0; guard < 100; guard++) {
      const prev = this.rt;
      const moved = rt.stepIndex !== prev.stepIndex || rt.done !== prev.done;
      this.rt = rt;
      if (!moved) return;
      const old = this.scene.steps?.[prev.stepIndex];
      if (old) this.emit({ type: 'step-completed', stepId: old.id });
      if (rt.done) {
        this.emit({ type: 'scene-completed', sceneId: this.scene.id });
        return;
      }
      this.enterStep();
      rt = observe(this.scene, this.rt, null, this.ctx());
    }
  }

  private afterChange(): void {
    this.beginPreview();
    this.notify();
  }

  // ---------- inputs ----------

  private feed(input: SceneInput, streetBefore?: GameState['street']): void {
    this.settle(observe(this.scene, this.rt, input, this.ctx(streetBefore)));
  }

  /** The learner (or a script) confirms an action. Resolves once the table has moved. */
  async act(action: Action): Promise<{ ok: true } | { ok: false; message: string }> {
    if (this.busy) return { ok: false, message: 'Working on the last move.' };
    if (this.pendingStart) return { ok: false, message: 'Press Next hand first.' };
    this.busy = true;
    try {
      const decision = action.type === 'check' || action.type === 'play' || action.type === 'fold';
      let pv: DecisionPreview | null = null;
      if (decision) {
        const wait = needsBestVerdict(this.scene, this.rt);
        pv = wait ? await this.currentPreview() : this.pv.status === 'ready' ? this.pv.value : null;
      }
      const opt = pv?.options.find((o) => sameOption(o, action));
      const wasBest = decision && pv ? opt?.tier === 'best' : undefined;
      const g = gateAction(this.scene, this.rt, action, wasBest);
      if (!g.ok) return this.reject(action, g.message);
      const r = applyAction(this.game, action);
      if (!r.ok) return this.reject(action, r.error.message);
      const before = this.game.street;
      this.rejection = null;
      if (action.type === 'deal') this.beginHandTrack();
      if (decision) this.trackDecision(pv, action);
      this.game = r.state;
      if (action.type === 'deal' && sixCardRules && this.sixCard) {
        // I062: the Six Card Bonus settles with the deal (it does not depend on play).
        const six = sixCardRules.apply(this.game, this.sixCard);
        this.game = six.state;
        this.sixCardLast = six.outcome;
        this.totals = sixCardRules.add(this.totals, six.outcome);
      } else if (action.type === 'deal') this.sixCardLast = null;
      this.lastEvents = r.events;
      this.eventSeq++;
      this.emit({
        type: 'action-confirmed',
        action,
        events: r.events,
        state: r.state,
        ...(pv ? { preview: pv } : {}),
      });
      const settled = r.events.find((e) => e.type === 'hand-settled');
      if (settled && settled.type === 'hand-settled') {
        this.finishHandTrack(settled.result);
        this.emit({ type: 'hand-settled', result: settled.result, state: r.state });
      }
      this.feed({ kind: 'action', action, events: r.events, wasBest }, before);
      this.afterChange();
      return { ok: true };
    } finally {
      this.busy = false;
    }
  }

  private reject(action: Action, message: string): { ok: false; message: string } {
    this.rejection = { text: message, seq: (this.rejection?.seq ?? 0) + 1 };
    this.emit({ type: 'action-rejected', action, reason: message });
    this.notify();
    return { ok: false, message };
  }

  /** The learner opened an option's EV sheet (`previewed` condition). */
  previewed(option: OptionKey, whyOpened = false): void {
    this.feed({ kind: 'previewed', option, whyOpened });
    const pv = this.pv.value;
    if (pv) this.emit({ type: 'previewed', preview: pv, option });
    this.afterChange();
  }
  acknowledge(): void {
    this.feed({ kind: 'acknowledged' });
    this.afterChange();
  }
  /** D26: circle and session-panel taps count even when `set-bet` is gated. */
  tap(target: CircleId | 'session'): void {
    this.feed({ kind: 'tapped', target });
    this.afterChange();
  }
  autoPlayCompleted(hands: number, strategy: StrategyId): void {
    this.feed({ kind: 'auto-play-completed', hands, strategy });
    this.emit({ type: 'auto-play-completed', hands, strategy });
    this.afterChange();
  }

  /**
   * I078 Watch: while on, every hand dealt (and the hand on the table) is marked watched and kept out
   * of the learner's own record. Turning it off does not unmark a hand already touched by Watch.
   */
  setWatching(on: boolean): void {
    this.watching = on;
    if (on && this.hand) this.hand.watched = true;
    this.notify();
  }

  /**
   * I062: the Six Card Bonus side bet for the next deals (sandbox), or null to stop betting it.
   * Returns false (and changes nothing) for an amount outside whole dollars $1–$25.
   */
  setSixCard(setting: SixCardSetting | null): boolean {
    if (setting && (!sixCardRules || !sixCardRules.valid(setting.bet))) return false;
    this.sixCard = setting ? { ...setting } : null;
    this.notify();
    return true;
  }

  /** Sandbox: add money to the rack without resetting the session; Net accounts for it (I083). */
  topUp(amount: Cents): boolean {
    if (this.mode !== 'sandbox' || !Number.isInteger(amount) || amount <= 0) return false;
    this.game = { ...this.game, bankroll: this.game.bankroll + amount };
    this.totals = { ...this.totals, topUpCents: this.totals.topUpCents + amount };
    this.rejection = null;
    this.afterChange();
    return true;
  }

  /** Sandbox: start over with a fresh rack. */
  newSession(bankroll: Cents): void {
    const ante = this.game.bets.ante || this.scene.bets?.ante || 1000;
    this.pvAbort?.abort();
    this.game = createGame({
      rules: this.game.rules,
      bankroll,
      seed: this.game.seed + this.game.handCount + 1,
      bets: { ante: Math.min(ante, Math.floor(bankroll / 2 / 100) * 100), trips: 0 },
    });
    this.startEq = bankroll;
    this.totals = { ...EMPTY_TOTALS };
    this.history = [];
    this.mistakeSpots = [];
    this.hand = null;
    this.sixCardLast = null;
    this.lastEvents = [];
    this.eventSeq++;
    this.pv = { key: null, status: 'idle', value: null, progress: 0 };
    this.rejection = null;
    this.afterChange();
  }

  /** Exposed for the UI's allowed-action checks. */
  gateFor(): Gate {
    return effectiveGate(this.scene, currentStep(this.scene, this.rt));
  }
}
