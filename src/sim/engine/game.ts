// Game state machine (simulator.md §1.2, §1.5). Pure and immutable: every action returns a new
// GameState plus the events the UI paces. No Date, no Math.random, no DOM.
import { dealHand } from './deck';
import { resolveRules } from './rules';
import { seedRng } from './rng';
import { settleHand } from './wagers';
import { validateAction } from './validate';
import type {
  Action,
  ApplyResult,
  Cents,
  Deal,
  DecisionAction,
  DecisionStreet,
  ForcedDeal,
  GameEvent,
  GameState,
  HandState,
  PlayMultiple,
  SessionStats,
  TableRules,
  VisibleView,
  WagerId,
} from './types';

export type StartAt = { street: DecisionStreet; deal: ForcedDeal; play?: PlayMultiple };

export interface CreateGameOptions {
  rules?: Partial<TableRules>;
  /** Money in the rack BEFORE any bets in `bets`/`startAt` are placed (they are taken from it). */
  bankroll?: Cents; // default 50_000
  seed?: number; // UI seeds once from crypto.getRandomValues
  bets?: { ante?: Cents; trips?: Cents };
  forcedDeals?: ForcedDeal[];
  /** Start mid-hand (lessons, drill "play it out", ?street= URLs). Deal must cover the visible cards. */
  startAt?: StartAt;
}

const ZERO_WAGERS: Record<WagerId, Cents> = { ante: 0, blind: 0, play: 0, trips: 0 };

function emptyStats(): SessionStats {
  return {
    hands: 0,
    folds: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    wagered: { ...ZERO_WAGERS },
    net: { ...ZERO_WAGERS },
  };
}

function boom(state: GameState, action: Action): never {
  const v = validateAction(state, action);
  throw new Error(`createGame: ${v.ok ? 'invalid' : v.message}`);
}

/** Throws on invalid options (bad bets, duplicate or malformed forced cards, short startAt deal). */
export function createGame(opts: CreateGameOptions = {}): GameState {
  const rules = resolveRules(opts.rules);
  const seed = opts.seed ?? 1;
  for (const f of opts.forcedDeals ?? []) dealHand(seedRng(0), f); // validates codes
  let state: GameState = {
    version: 1,
    rules,
    street: 'betting',
    bankroll: opts.bankroll ?? 50_000,
    bets: { ...ZERO_WAGERS },
    hand: null,
    handCount: 0,
    rng: seedRng(seed),
    seed,
    forcedDeals: [...(opts.forcedDeals ?? [])],
    stats: emptyStats(),
  };
  const step = (a: Action): void => {
    const r = applyAction(state, a);
    if (!r.ok) boom(state, a);
    else state = r.state;
  };
  const ante = opts.bets?.ante ?? (opts.startAt ? Math.max(1000, rules.anteMin) : 0);
  if (ante > 0) step({ type: 'set-bet', wager: 'ante', amount: ante });
  if ((opts.bets?.trips ?? 0) > 0)
    step({ type: 'set-bet', wager: 'trips', amount: opts.bets!.trips! });
  if (opts.startAt) {
    const r = startHand(state, opts.startAt);
    if (!r.ok) throw new Error(`createGame: ${r.error.message}`);
    state = r.state;
  }
  return state;
}

/**
 * Starts a hand directly at a decision street (lessons, drill, `?street=`). Callable from
 * `betting` or `settled` in a game already in progress: session stats and the RNG stream carry
 * on, chips are re-bet like `deal`, and no fake earlier decisions are recorded. Events:
 * hand-started, player-dealt, dealer-dealt, board-dealt for the visible street(s), and with
 * `play` the played + settlement events including hand-settled. Throws on a deal that does not
 * cover the visible cards or has bad or duplicate codes.
 */
export function startHand(state: GameState, startAt: StartAt): ApplyResult {
  const d = startAt.deal;
  const missing =
    startAt.street === 'preflop'
      ? !d.player
      : startAt.street === 'flop'
        ? !d.player || !d.flop
        : !d.player || !d.flop || !d.turn || !d.river;
  if (missing) throw new Error(`startHand: ${startAt.street} needs the visible cards in deal`);
  const v = validateAction(state, { type: 'deal' });
  if (!v.ok) return { ok: false, state, error: v };
  const [deal, rng] = dealHand(state.rng, d);
  const begun = beginHand({ ...state, rng }, deal);
  const shown = startAt.street === 'preflop' ? 0 : startAt.street === 'flop' ? 3 : 5;
  const events = [...begun.events];
  if (shown >= 3)
    events.push({ type: 'board-dealt', street: 'flop', cards: deal.board.slice(0, 3) });
  if (shown === 5)
    events.push({ type: 'board-dealt', street: 'turn-river', cards: deal.board.slice(3, 5) });
  let next: GameState = {
    ...begun.state,
    street: startAt.street,
    hand: { ...begun.state.hand!, boardShown: shown },
  };
  if (startAt.play !== undefined) {
    const pv = validateAction(next, { type: 'play', multiple: startAt.play });
    if (!pv.ok) return { ok: false, state, error: pv };
    const r = decide(next, { type: 'play', multiple: startAt.play });
    next = r.state;
    events.push(...r.events);
  }
  return { ok: true, state: next, events, warnings: v.warnings };
}

function beginHand(state: GameState, deal: Deal): { state: GameState; events: GameEvent[] } {
  const n = state.handCount + 1;
  const total = state.bets.ante * 2 + state.bets.trips;
  const hand: HandState = {
    n,
    deal,
    boardShown: 0,
    play: null,
    folded: false,
    decisions: [],
    result: null,
  };
  return {
    state: {
      ...state,
      street: 'preflop',
      // From 'settled' the chips are re-bet from the rack; from 'betting' they are already off it.
      bankroll: state.street === 'settled' ? state.bankroll - total : state.bankroll,
      bets: { ...state.bets, blind: state.bets.ante, play: 0 },
      hand,
      handCount: n,
    },
    events: [
      { type: 'hand-started', n, forced: deal.forced },
      { type: 'player-dealt', cards: deal.player },
      { type: 'dealer-dealt' },
    ],
  };
}

function finishHand(
  state: GameState,
  hand: HandState,
  play: { multiple: PlayMultiple; street: DecisionStreet } | null,
  folded: boolean,
  decisions: HandState['decisions'],
  pre: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const { deal } = hand;
  const { ante, trips } = state.bets;
  const result = settleHand(deal, { ante, blind: ante, trips }, play, folded, state.rules);
  const events: GameEvent[] = [...pre];
  if (hand.boardShown < 3)
    events.push({ type: 'board-dealt', street: 'flop', cards: deal.board.slice(0, 3) });
  if (hand.boardShown < 5)
    events.push({ type: 'board-dealt', street: 'turn-river', cards: deal.board.slice(3, 5) });
  events.push({
    type: 'dealer-revealed',
    cards: deal.dealer,
    hand: result.dealer,
    qualifies: result.dealerQualifies,
  });
  if (!folded && result.outcome !== 'fold')
    events.push({
      type: 'showdown',
      player: result.player,
      dealer: result.dealer,
      outcome: result.outcome,
    });
  for (const settlement of result.wagers) events.push({ type: 'wager-settled', settlement });
  events.push({ type: 'hand-settled', result });

  const stats: SessionStats = {
    ...state.stats,
    hands: state.stats.hands + 1,
    folds: state.stats.folds + (folded ? 1 : 0),
    wins: state.stats.wins + (result.outcome === 'win' ? 1 : 0),
    losses: state.stats.losses + (result.outcome === 'lose' ? 1 : 0),
    ties: state.stats.ties + (result.outcome === 'tie' ? 1 : 0),
    wagered: { ...state.stats.wagered },
    net: { ...state.stats.net },
  };
  let returned = 0;
  for (const w of result.wagers) {
    stats.wagered[w.wager] += w.amount;
    stats.net[w.wager] += w.profit;
    returned += w.amount + w.profit;
  }
  return {
    state: {
      ...state,
      street: 'settled',
      bankroll: state.bankroll + returned,
      bets: { ...state.bets, play: 0 },
      hand: {
        ...hand,
        boardShown: 5,
        play,
        folded,
        decisions,
        result,
      },
      stats,
    },
    events,
  };
}

function decide(
  state: GameState,
  action: DecisionAction,
): { state: GameState; events: GameEvent[] } {
  const hand = state.hand!;
  const street = state.street as DecisionStreet;
  const decisions = [...hand.decisions, { street, action }];
  const { deal } = hand;
  if (action.type === 'check') {
    if (street === 'preflop') {
      return {
        state: { ...state, street: 'flop', hand: { ...hand, boardShown: 3, decisions } },
        events: [
          { type: 'checked', street: 'preflop' },
          { type: 'board-dealt', street: 'flop', cards: deal.board.slice(0, 3) },
        ],
      };
    }
    return {
      state: { ...state, street: 'river', hand: { ...hand, boardShown: 5, decisions } },
      events: [
        { type: 'checked', street: 'flop' },
        { type: 'board-dealt', street: 'turn-river', cards: deal.board.slice(3, 5) },
      ],
    };
  }
  if (action.type === 'fold') {
    return finishHand(state, hand, null, true, decisions, [{ type: 'folded' }]);
  }
  const amount = action.multiple * state.bets.ante;
  const funded: GameState = {
    ...state,
    bankroll: state.bankroll - amount,
    bets: { ...state.bets, play: amount },
  };
  return finishHand(funded, hand, { multiple: action.multiple, street }, false, decisions, [
    { type: 'played', street, multiple: action.multiple, amount },
  ]);
}

export function applyAction(state: GameState, action: Action): ApplyResult {
  const v = validateAction(state, action);
  if (!v.ok) return { ok: false, state, error: v };
  const warnings = v.warnings;
  switch (action.type) {
    case 'set-bet': {
      const w = action.wager;
      const from = state.bets[w];
      const to = action.amount;
      const ante = w === 'ante' ? to : state.bets.ante;
      const trips = w === 'trips' ? to : state.bets.trips;
      const newBets = { ...state.bets, ante, blind: ante, trips };
      const events: GameEvent[] = [{ type: 'bet-set', wager: w, from, to }];
      if (w === 'ante')
        events.push({ type: 'bet-set', wager: 'blind', from: state.bets.blind, to });
      // In 'betting' the chips are on the felt: move the difference. In 'settled' bets are intent.
      const delta =
        state.street === 'betting'
          ? ante * 2 + trips - (state.bets.ante * 2 + state.bets.trips)
          : 0;
      return {
        ok: true,
        state: { ...state, bets: newBets, bankroll: state.bankroll - delta },
        events,
        warnings,
      };
    }
    case 'deal': {
      const forced = state.forcedDeals[0];
      const [deal, rng] = dealHand(state.rng, forced);
      const base: GameState = {
        ...state,
        rng,
        forcedDeals: forced ? state.forcedDeals.slice(1) : state.forcedDeals,
      };
      const r = beginHand(base, deal);
      return { ok: true, state: r.state, events: r.events, warnings };
    }
    case 'clear': {
      return {
        ok: true,
        state: { ...state, street: 'betting', bets: { ...ZERO_WAGERS }, hand: null },
        events: [{ type: 'cleared' }],
        warnings,
      };
    }
    default: {
      const r = decide(state, action);
      return { ok: true, state: r.state, events: r.events, warnings };
    }
  }
}

/** Applies actions in order; throws on the first invalid one. */
export function replay(initial: GameState, actions: readonly Action[]): GameState {
  let s = initial;
  actions.forEach((a, i) => {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`replay: action ${i} (${a.type}) invalid: ${r.error.message}`);
    s = r.state;
  });
  return s;
}

/** What the player can see; the EV module and strategies only ever receive this. */
export function visibleView(state: GameState): VisibleView {
  const h = state.hand;
  const hasHole = h !== null && state.street !== 'betting';
  return {
    street: state.street,
    rules: state.rules,
    hole: hasHole ? h.deal.player : null,
    board: hasHole ? h.deal.board.slice(0, h.boardShown) : [],
    bets: state.bets,
    bankroll: state.bankroll,
    played: h?.play != null,
  };
}

/** Bankroll plus chips on the felt (conserved by every action except settlement). */
export function equity(state: GameState): Cents {
  const b = state.bets;
  if (state.street === 'settled') return state.bankroll; // bets are intent, not on the felt
  return state.bankroll + b.ante + b.blind + b.trips + b.play;
}

/**
 * The parameterless actions that are legal now: deal, clear, check, play (each legal multiple)
 * and fold. `set-bet` is parametric and is not listed; validate it with `validateAction`.
 */
export function legalActions(state: GameState): Action[] {
  const candidates: Action[] = [
    { type: 'deal' },
    { type: 'clear' },
    { type: 'check' },
    ...([4, 3, 2, 1] as const).map((multiple): Action => ({ type: 'play', multiple })),
    { type: 'fold' },
  ];
  return candidates.filter((a) => validateAction(state, a).ok);
}
