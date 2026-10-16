// SimDriver: the framework-free heart of the Simulator container. It owns the engine state, the
// scene runtime and the EV previews, so the same code runs in the browser (wrapped by
// ui/Simulator.tsx) and in the every-scene-completes test (tests/sim/lessons.test.ts).
import { applyAction, createGame, equity, startHand, visibleView } from '../engine';
import type {
  Action,
  Cents,
  DecisionStreet,
  GameEvent,
  GameState,
  HandResult,
  TableRules,
  TripsPaytableId,
} from '../engine';
import type { DecisionOption, DecisionPreview, PreviewRequest } from '../math/types';
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
import type {
  CircleId,
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

/** The luck vs mistake ledger (cents; floats because EV is rational). */
export interface SessionTotals {
  hands: number;
  /** Hands where every decision had an EV preview (only these feed the luck split). */
  scored: number;
  /** Sum of the best EV at each scored hand's first decision. */
  expectedCents: number;
  /** Sum of regrets at the decisions taken. */
  mistakeCents: number;
  /** Actual Ante+Blind+Play result of the scored hands. */
  scoredMainCents: number;
  tripsCents: number;
  decisions: number;
  mistakes: number;
}
export const EMPTY_TOTALS: SessionTotals = {
  hands: 0,
  scored: 0,
  expectedCents: 0,
  mistakeCents: 0,
  scoredMainCents: 0,
  tripsCents: 0,
  decisions: 0,
  mistakes: 0,
};

export interface SessionView extends SessionTotals {
  net: Cents;
  /** scoredMain - (expected - mistakes): what the cards did beyond your decisions. */
  luckCents: number;
}

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
  preview: PreviewState;
  practice: boolean;
  rejection: Rejection | null;
  session: SessionView;
  startEquity: Cents;
  result: HandResult | null;
}

export interface DriverOptions {
  scene?: SceneConfig;
  mode: 'sandbox' | 'scene';
  preview: PreviewFn;
  seed: number;
  /** Trips paytable for the sandbox (scenes use their own `rules.trips`, default 8-6-5). */
  paytable?: TripsPaytableId;
  practice?: boolean;
  /** Compute the next street's EV while the learner thinks (D18). */
  speculate?: boolean;
  onEvent?: (e: DriverEvent) => void;
  restore?: { state: GameState; startEquity: Cents; totals: SessionTotals };
}

const ZERO = { ante: 0, blind: 0, play: 0, trips: 0 } as const;
const isDecision = (s: string): s is DecisionStreet =>
  s === 'preflop' || s === 'flop' || s === 'river';
const num = (f: { num: bigint; den: bigint }): number => Number(f.num) / Number(f.den);

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

export class SimDriver {
  readonly scene: SceneConfig;
  readonly mode: 'sandbox' | 'scene';
  private opts: DriverOptions;
  private game: GameState;
  private rt: SceneRuntime;
  private startEq: Cents;
  private totals: SessionTotals;
  private hand: { base: number | null; regret: number; scored: boolean; ante: number } | null =
    null;
  private lastEvents: GameEvent[] = [];
  private eventSeq = 0;
  private pv: PreviewState = { key: null, status: 'idle', value: null, progress: 0 };
  private pvPromise: Promise<DecisionPreview | null> = Promise.resolve(null);
  private pvAbort: AbortController | null = null;
  private specAbort: AbortController | null = null;
  private specs = new Map<string, Promise<DecisionPreview>>();
  private specHand = -1;
  private pendingStart: SceneStep['startAt'] | null = null;
  private rejection: Rejection | null = null;
  private practice: boolean;
  private version = 0;
  private listeners = new Set<() => void>();
  private cached: DriverView | null = null;
  private busy = false;
  private disposed = false;

  constructor(opts: DriverOptions) {
    this.opts = opts;
    this.mode = opts.mode;
    this.scene = opts.scene ?? { id: 'sandbox', version: 1 };
    this.practice = !!(opts.practice || this.scene.practice);
    const sc = this.scene;
    if (opts.restore) {
      this.game = opts.restore.state;
      this.startEq = opts.restore.startEquity;
      this.totals = { ...EMPTY_TOTALS, ...opts.restore.totals };
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
    const st = this.game.street;
    const decision = isDecision(st);
    const opts = decision ? gatedOptions(gate, st) : undefined;
    const allowedOptions = decision && gate.options ? opts : undefined;
    const t = this.totals;
    const net = equity(this.game) - this.startEq;
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
      preview: this.pv,
      practice: this.practice,
      rejection: this.rejection,
      session: {
        ...t,
        net,
        luckCents: t.scoredMainCents - (t.expectedCents - t.mistakeCents),
      },
      startEquity: this.startEq,
      result: this.game.hand?.result ?? null,
    };
    return this.cached;
  }

  snapshotData(): {
    state: GameState;
    startEquity: Cents;
    totals: SessionTotals;
    practice: boolean;
  } {
    return {
      state: this.game,
      startEquity: this.startEq,
      totals: this.totals,
      practice: this.practice,
    };
  }

  setPractice(on: boolean): void {
    this.practice = on;
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    this.pvAbort?.abort();
    this.specAbort?.abort();
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
  private reqKey(r: PreviewRequest): string {
    return JSON.stringify([r.street, r.hole, r.board, r.ante]);
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
      if (st.street === 'settled' || st.street === 'betting') this.dropSpeculation();
      return;
    }
    const key = `${st.hand!.n}:${st.street}`;
    if (this.pv.key === key) return;
    this.pvAbort?.abort();
    const ac = new AbortController();
    this.pvAbort = ac;
    this.pv = { key, status: 'pending', value: null, progress: 0 };
    const spec = this.specs.get(this.reqKey(req));
    const run =
      spec ??
      this.opts.preview(req, {
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
    if (this.opts.speculate) this.speculate();
  }

  /** While the learner thinks, compute the next street's EV for the cards that will be dealt. */
  private speculate(): void {
    const st = this.game;
    const h = st.hand;
    if (!h || (st.street !== 'preflop' && st.street !== 'flop')) return;
    if (this.specHand !== h.n) {
      this.dropSpeculation();
      this.specHand = h.n;
    }
    const next: DecisionStreet = st.street === 'preflop' ? 'flop' : 'river';
    const board = h.deal.board.slice(0, next === 'flop' ? 3 : 5);
    const req: PreviewRequest = {
      street: next,
      hole: h.deal.player,
      board,
      blindPaytable: st.rules.blindPaytable,
      ante: st.bets.ante,
    };
    const k = this.reqKey(req);
    if (this.specs.has(k)) return;
    if (!this.specAbort) this.specAbort = new AbortController();
    const p = this.opts.preview(req, { key: `spec:${next}`, signal: this.specAbort.signal });
    p.catch(() => undefined);
    this.specs.set(k, p);
  }
  private dropSpeculation(): void {
    this.specAbort?.abort();
    this.specAbort = null;
    this.specs.clear();
    this.specHand = -1;
  }

  /** Resolves with the current decision's preview (null when it failed). */
  async currentPreview(): Promise<DecisionPreview | null> {
    return this.pv.status === 'ready' ? this.pv.value : this.pvPromise;
  }

  // ---------- hand tracking (luck vs mistakes) ----------

  private beginHandTrack(): void {
    this.hand = { base: null, regret: 0, scored: true, ante: this.game.bets.ante };
  }
  private trackDecision(pv: DecisionPreview | null, action: Action): void {
    if (!this.hand) return;
    this.totals = { ...this.totals, decisions: this.totals.decisions + 1 };
    const opt = pv?.options.find((o) => sameOption(o, action));
    if (!pv || !opt) {
      this.hand.scored = false;
      return;
    }
    if (this.hand.base === null) this.hand.base = num(pv.options[pv.bestIndex]!.evCents);
    this.hand.regret += num(opt.regret) * this.hand.ante;
    if (opt.tier !== 'best' && opt.tier !== 'close')
      this.totals = { ...this.totals, mistakes: this.totals.mistakes + 1 };
  }
  private finishHandTrack(result: HandResult): void {
    const h = this.hand;
    this.hand = null;
    let main = 0;
    let trips = 0;
    for (const w of result.wagers) {
      if (w.wager === 'trips') trips += w.profit;
      else main += w.profit;
    }
    const t = {
      ...this.totals,
      hands: this.totals.hands + 1,
      tripsCents: this.totals.tripsCents + trips,
    };
    if (h && h.scored && h.base !== null) {
      t.scored += 1;
      t.expectedCents += h.base;
      t.mistakeCents += h.regret;
      t.scoredMainCents += main;
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

  /** Sandbox: start over with a fresh rack. */
  newSession(bankroll: Cents): void {
    const ante = this.game.bets.ante || this.scene.bets?.ante || 1000;
    this.pvAbort?.abort();
    this.dropSpeculation();
    this.game = createGame({
      rules: this.game.rules,
      bankroll,
      seed: this.game.seed + this.game.handCount + 1,
      bets: { ante: Math.min(ante, Math.floor(bankroll / 2 / 100) * 100), trips: 0 },
    });
    this.startEq = bankroll;
    this.totals = { ...EMPTY_TOTALS };
    this.hand = null;
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
