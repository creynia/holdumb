import { cardCode, parseCards } from './cards';
import { applyAction, replay } from './game';
import { settleHand } from './wagers';
import type {
  Action,
  ApplyResult,
  Card,
  Cents,
  Deal,
  DecisionAction,
  DecisionStreet,
  GameState,
  HandResult,
  HandState,
  LogEntry,
  PlayMultiple,
  TableRules,
} from './types';

/** Applies an action and appends it to the log when it succeeds. */
export function applyLogged(
  state: GameState,
  log: readonly LogEntry[],
  action: Action,
): { result: ApplyResult; log: readonly LogEntry[] } {
  const result = applyAction(state, action);
  if (!result.ok) return { result, log };
  return { result, log: [...log, { seq: log.length + 1, action, events: result.events }] };
}

/** Rebuilds the state from the initial state and a log. */
export function replayLog(initial: GameState, log: readonly LogEntry[]): GameState {
  return replay(
    initial,
    log.map((e) => e.action),
  );
}

// ---------- hand history (simulator.md 3.7 HandHistory; decisions: at most 50, each <= 200 bytes) ----------

/** One decision of a recorded hand: [street, choice, tier word, regret in antes as 'num/den']. */
export type HandDecisionRecord =
  [DecisionStreetCode, HandChoice] | [DecisionStreetCode, HandChoice, HandTierCode, string];
/** 'p' preflop, 'f' flop, 'r' river. */
export type DecisionStreetCode = 'p' | 'f' | 'r';
export type HandChoice = '4x' | '3x' | '2x' | '1x' | 'check' | 'fold';
/** b best, c close, s small mistake, m mistake, x big mistake. */
export type HandTierCode = 'b' | 'c' | 's' | 'm' | 'x';

/**
 * A finished hand, compact enough to keep the last 50 in the sandbox snapshot: the deal as card
 * codes, the wagers, the decisions with their tier and exact regret when an EV preview scored
 * them, and the net. Everything else (the hands made, the settlement sentence) is re-derived from
 * the deal with `settleHand`, so a record never stores what it can recompute.
 */
export interface HandRecord {
  /** 1-based hand number in the session. */
  n: number;
  /** Hole cards, 'AsKd'. */
  p: string;
  /** Dealer cards, 'TdTs'. */
  d: string;
  /** The five board cards, 'Kd9h5c3s2d'. */
  b: string;
  /** [ante, trips] in cents (the Blind equals the Ante). */
  w: [Cents, Cents];
  a: HandDecisionRecord[];
  /** Net result in cents, Trips included. */
  net: Cents;
}

export const HISTORY_LIMIT = 50;
export const HISTORY_RECORD_BYTES = 200;

export const STREET_CODE: Record<DecisionStreet, DecisionStreetCode> = {
  preflop: 'p',
  flop: 'f',
  river: 'r',
};
export const STREET_OF_CODE: Record<DecisionStreetCode, DecisionStreet> = {
  p: 'preflop',
  f: 'flop',
  r: 'river',
};

export function choiceOf(a: DecisionAction): HandChoice {
  return a.type === 'check'
    ? 'check'
    : a.type === 'fold'
      ? 'fold'
      : (`${a.multiple}x` as HandChoice);
}

/** The record of a settled hand. `scored[i]` annotates `hand.decisions[i]` when a preview existed. */
export function handRecord(
  hand: HandState,
  result: HandResult,
  bets: { ante: Cents; trips: Cents },
  scored: readonly ({ tier: HandTierCode; regret: string } | null)[],
): HandRecord {
  const codes = (cs: readonly Card[]): string => cs.map(cardCode).join('');
  return {
    n: hand.n,
    p: codes(hand.deal.player),
    d: codes(hand.deal.dealer),
    b: codes(hand.deal.board),
    w: [bets.ante, bets.trips],
    a: hand.decisions.map((dec, i) => {
      const s = scored[i];
      return s
        ? [STREET_CODE[dec.street], choiceOf(dec.action), s.tier, s.regret]
        : [STREET_CODE[dec.street], choiceOf(dec.action)];
    }),
    net: result.net,
  };
}

/** The play multiple (if any) and whether the hand was folded, from a record's decisions. */
export function recordPlay(r: HandRecord): {
  play: { multiple: PlayMultiple } | null;
  folded: boolean;
} {
  let play: { multiple: PlayMultiple } | null = null;
  let folded = false;
  for (const [, choice] of r.a) {
    if (choice === 'fold') folded = true;
    else if (choice !== 'check') play = { multiple: Number(choice.charAt(0)) as PlayMultiple };
  }
  return { play, folded };
}

/** The settlement of a recorded hand, recomputed exactly from its deal (never stored). */
export function recordResult(r: HandRecord, rules: TableRules): HandResult {
  const player = parseCards(r.p);
  const dealer = parseCards(r.d);
  const board = parseCards(r.b);
  if (player.length !== 2 || dealer.length !== 2 || board.length !== 5)
    throw new Error('HandRecord: bad deal');
  const deal: Deal = {
    player: [player[0]!, player[1]!],
    dealer: [dealer[0]!, dealer[1]!],
    board: [board[0]!, board[1]!, board[2]!, board[3]!, board[4]!],
    forced: true,
  };
  const { play, folded } = recordPlay(r);
  return settleHand(deal, { ante: r.w[0], blind: r.w[0], trips: r.w[1] }, play, folded, rules);
}

/** Newest first, capped at HISTORY_LIMIT. */
export function pushRecord(history: readonly HandRecord[], r: HandRecord): HandRecord[] {
  return [r, ...history].slice(0, HISTORY_LIMIT);
}
