// Move log (I081): one line per engine event of a hand (deal, each decision, board cards, the
// dealer's reveal, settlement), grouped by hand, newest hand first. The engine events are the
// source of truth; a decision's tier and cost come from the preview that was ready when it was
// made. Shared formatting lives here so hand history / replay (I055) can build on it.
import { formatMoney } from '../engine';
import type {
  Card,
  Cents,
  Deal,
  DecisionStreet,
  GameEvent,
  GameState,
  PlayMultiple,
} from '../engine';
import type { TripsPaytableId } from '../engine';
import type { DecisionPreview, DecisionTier } from '../math';
import { DECISION_TIER_LABEL, bestOf, costCents, describeResult, fmtCostC, handName } from './text';
import { tablesFor } from './text';
import { isUsablePreview, withArticle } from './text';
import type { EvMode } from './types';

export type MoveLine =
  | { t: 'deal'; n: number; hole: Card[]; ante: Cents; trips: Cents }
  | {
      t: 'move';
      street: DecisionStreet;
      act: 'check' | 'play' | 'fold';
      x?: PlayMultiple;
      amt?: Cents;
      /** Only when a usable preview was ready when the move was made. */
      tier?: DecisionTier;
      /** Rounded cents against the best option (costCents), > 0 unless the move was best. */
      cost?: number;
      best?: string;
    }
  | { t: 'board'; street: 'flop' | 'turn-river'; cards: Card[] }
  | { t: 'dealer'; cards: Card[]; text: string }
  | { t: 'result'; net: Cents; text: string };

export interface LoggedHand {
  n: number;
  lines: MoveLine[];
}

/** Hands kept (session and snapshot). Older hands drop off the end. */
export const MAX_LOGGED_HANDS = 20;

export interface AppendContext {
  /** The bets on the table after these events (the deal line's Ante and Trips). */
  bets: { ante: Cents; trips: Cents };
  /** The decision preview that was ready before these events, if any. */
  preview: DecisionPreview | null;
  /** The Trips preset the hand settles at (the table's own rules), so the result line names it. */
  tripsPaytable: TripsPaytableId;
  /** The hand's deal, for the result line's near-miss note (as the settled toast). */
  deal?: Deal;
}

const MOVE_LABEL = (l: Extract<MoveLine, { t: 'move' }>): string =>
  l.act === 'play' ? `Bet ${l.x}x` : l.act === 'check' ? 'Check' : 'Fold';

function moveLine(
  street: DecisionStreet,
  act: 'check' | 'play' | 'fold',
  pv: DecisionPreview | null,
  x?: PlayMultiple,
  amt?: Cents,
): MoveLine {
  const line: Extract<MoveLine, { t: 'move' }> = {
    t: 'move',
    street,
    act,
    ...(x !== undefined ? { x } : {}),
    ...(amt !== undefined ? { amt } : {}),
  };
  if (!isUsablePreview(pv) || pv.street !== street) return line;
  const opt = pv.options.find(
    (o) =>
      o.action.type === act &&
      (act !== 'play' || (o.action.type === 'play' && o.action.multiple === x)),
  );
  if (!opt) return line;
  const best = bestOf(pv);
  line.tier = opt.tier;
  if (opt.tier !== 'best') {
    line.cost = costCents(best, opt);
    line.best = best.label;
  }
  return line;
}

/** Folds one action's engine events into the log (pure; returns a new array). */
export function appendEvents(
  hands: readonly LoggedHand[],
  events: readonly GameEvent[],
  ctx: AppendContext,
): LoggedHand[] {
  let out = hands.slice();
  const cur = (): LoggedHand | undefined => out[0];
  const push = (l: MoveLine) => {
    const h = cur();
    if (h) out[0] = { n: h.n, lines: [...h.lines, l] };
  };
  for (const e of events) {
    switch (e.type) {
      case 'hand-started': {
        const deal: MoveLine = {
          t: 'deal',
          n: e.n,
          hole: [],
          ante: ctx.bets.ante,
          trips: ctx.bets.trips,
        };
        out = [{ n: e.n, lines: [deal] }, ...out].slice(0, MAX_LOGGED_HANDS);
        break;
      }
      case 'player-dealt': {
        const h = cur();
        const first = h?.lines[0];
        if (h && first?.t === 'deal')
          out[0] = { n: h.n, lines: [{ ...first, hole: [...e.cards] }, ...h.lines.slice(1)] };
        break;
      }
      case 'checked':
        push(moveLine(e.street, 'check', ctx.preview));
        break;
      case 'played':
        push(moveLine(e.street, 'play', ctx.preview, e.multiple, e.amount));
        break;
      case 'folded':
        push(moveLine('river', 'fold', ctx.preview));
        break;
      case 'board-dealt':
        push({ t: 'board', street: e.street, cards: [...e.cards] });
        break;
      case 'dealer-revealed':
        push({
          t: 'dealer',
          cards: [...e.cards],
          text: `${withArticle(handName(e.hand))}, ${e.qualifies ? 'qualifies' : "doesn't qualify"}`,
        });
        break;
      case 'hand-settled':
        // Same text as the settled toast: the table's Trips preset and the deal's near-miss note.
        push({
          t: 'result',
          net: e.result.net,
          text: describeResult(e.result, tablesFor(ctx.tripsPaytable), ctx.deal),
        });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * A hand already under way with no events behind it (a preset `?street=` hand starts in
 * createGame): the events its visible state implies, so the log can open with its deal and board.
 * Empty when there is no live hand or the log already has it.
 */
export function eventsForHandInProgress(
  state: GameState,
  hands: readonly LoggedHand[],
): GameEvent[] {
  const h = state.hand;
  if (!h || state.street === 'betting' || state.street === 'settled') return [];
  if (hands[0]?.n === state.handCount) return [];
  const ev: GameEvent[] = [
    { type: 'hand-started', n: state.handCount, forced: true },
    { type: 'player-dealt', cards: h.deal.player },
  ];
  if (h.boardShown >= 3)
    ev.push({ type: 'board-dealt', street: 'flop', cards: h.deal.board.slice(0, 3) });
  if (h.boardShown === 5)
    ev.push({ type: 'board-dealt', street: 'turn-river', cards: h.deal.board.slice(3, 5) });
  return ev;
}

const SUIT_SYMBOL = ['♠', '♥', '♦', '♣']; // engine suit order: s h d c
const RANKS = '23456789TJQKA';
/** "A♠", "10♦". */
export function cardText(c: Card): string {
  const r = RANKS.charAt(c >> 2);
  return `${r === 'T' ? '10' : r}${SUIT_SYMBOL[c & 3]}`;
}
const cardsText = (cs: readonly Card[]): string => cs.map(cardText).join(' ');

const STREET_NAME: Record<DecisionStreet, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  river: 'River',
};

/**
 * The tier and cost of a decision: "Best play." / "Small mistake, costs $0.51 against Bet 2x."
 * Nothing in 'never' mode or without a preview.
 */
export function decisionPhrase(l: Extract<MoveLine, { t: 'move' }>, evMode: EvMode): string {
  if (evMode === 'never' || !l.tier) return '';
  const label = DECISION_TIER_LABEL[l.tier];
  if (l.tier === 'best' || l.cost === undefined) return `${label}.`;
  return `${label}, costs ${fmtCostC(l.cost)} against ${l.best}.`;
}

/** One log line as text. */
export function formatLine(l: MoveLine, evMode: EvMode): string {
  switch (l.t) {
    case 'deal': {
      const m = formatMoney(l.ante);
      const trips = l.trips > 0 ? `, Trips ${formatMoney(l.trips)}` : '';
      const hole = l.hole.length ? ` You: ${cardsText(l.hole)}.` : '';
      return `Ante ${m}, Blind ${m}${trips}.${hole}`;
    }
    case 'move': {
      const amt = l.amt !== undefined ? ` (${formatMoney(l.amt)})` : '';
      const phrase = decisionPhrase(l, evMode);
      return `${STREET_NAME[l.street]}: ${MOVE_LABEL(l)}${amt}.${phrase ? ` ${phrase}` : ''}`;
    }
    case 'board':
      return `${l.street === 'flop' ? 'Flop' : 'Turn and river'}: ${cardsText(l.cards)}.`;
    case 'dealer':
      return `Dealer: ${cardsText(l.cards)}, ${l.text}.`;
    case 'result':
      return l.text;
  }
}

// ---------- persistence (inside the sandbox snapshot) ----------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const cards = (v: unknown, n?: number): v is Card[] =>
  Array.isArray(v) &&
  (n === undefined || v.length === n) &&
  v.length <= 5 &&
  v.every((c) => int(c) && c >= 0 && c < 52);
const str = (v: unknown): v is string => typeof v === 'string' && v.length <= 400;
const TIERS: readonly string[] = ['best', 'close', 'small', 'costly', 'blunder'];

function validLine(l: unknown): l is MoveLine {
  if (!isObj(l)) return false;
  switch (l.t) {
    case 'deal':
      return int(l.n) && cards(l.hole) && int(l.ante) && int(l.trips);
    case 'move':
      return (
        ['preflop', 'flop', 'river'].includes(l.street as string) &&
        ['check', 'play', 'fold'].includes(l.act as string) &&
        (l.x === undefined || [1, 2, 3, 4].includes(l.x as number)) &&
        (l.amt === undefined || int(l.amt)) &&
        (l.tier === undefined || TIERS.includes(l.tier as string)) &&
        (l.cost === undefined || int(l.cost)) &&
        (l.best === undefined || str(l.best))
      );
    case 'board':
      return (l.street === 'flop' || l.street === 'turn-river') && cards(l.cards);
    case 'dealer':
      return cards(l.cards, 2) && str(l.text);
    case 'result':
      return int(l.net) && str(l.text);
    default:
      return false;
  }
}

/** The saved log, or [] for anything that does not validate (never throws). */
export function decodeMoveLog(raw: unknown): LoggedHand[] {
  try {
    if (!Array.isArray(raw)) return [];
    const out: LoggedHand[] = [];
    for (const h of raw.slice(0, MAX_LOGGED_HANDS)) {
      if (!isObj(h) || !int(h.n) || !Array.isArray(h.lines) || h.lines.length > 16) return [];
      if (!h.lines.every(validLine)) return [];
      out.push({ n: h.n, lines: h.lines });
    }
    return out;
  } catch {
    return [];
  }
}
