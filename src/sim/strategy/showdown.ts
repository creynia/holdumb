// "Read the showdown" drill (I061): a full nine-card deal, three questions, graded by the engine's
// own settleHand. Pure and seeded; the spot code in the URL reproduces the deal.
import { cardCode, parseCards } from '../engine/cards';
import { evaluateN } from '../engine/evaluator';
import { DEFAULT_RULES } from '../engine/rules';
import { randBelow } from '../engine/rng';
import type { Card, Deal, HandResult, RngState } from '../engine/types';
import { settleHand } from '../engine/wagers';

export type ShowdownWinner = 'you' | 'dealer' | 'tie';
export type ShowdownBlind = 'pays' | 'pushes' | 'loses';
export type ShowdownQuestion = 'winner' | 'qualifies' | 'blind';
export const SHOWDOWN_QUESTIONS: readonly ShowdownQuestion[] = ['winner', 'qualifies', 'blind'];

/** The kinds of deal the generator leans on (about half the spots; the rest are plain random). */
export type ShowdownKind = 'kicker' | 'board-plays' | 'not-qualified' | 'blind-straight';
export const SHOWDOWN_KINDS: readonly ShowdownKind[] = [
  'kicker',
  'board-plays',
  'not-qualified',
  'blind-straight',
];

export interface ShowdownSpot {
  /** `s:<your two>.<board>.<dealer's two>`, e.g. `s:AhKd.QsJc9h2d3c.7s7d` */
  code: string;
  hole: readonly [Card, Card];
  board: readonly [Card, Card, Card, Card, Card];
  dealer: readonly [Card, Card];
}

export interface ShowdownTruth {
  winner: ShowdownWinner;
  /** Does the dealer qualify (a pair or better)? */
  qualifies: boolean;
  /** What the Blind does: only a win with a straight or better pays; a win below that, or a tie, pushes. */
  blind: ShowdownBlind;
  /** The engine's settlement of a 1x Play hand, which the feedback text is built from. */
  result: HandResult;
  deal: Deal;
}

export type ShowdownAnswers = Partial<{
  winner: ShowdownWinner;
  qualifies: boolean;
  blind: ShowdownBlind;
}>;

export interface ShowdownGrade {
  winner: boolean;
  qualifies: boolean;
  blind: boolean;
  /** All three right. */
  all: boolean;
}

const MAX_ATTEMPTS = 50_000;

export function showdownCode(s: Omit<ShowdownSpot, 'code'>): string {
  const c = (cs: readonly Card[]): string => cs.map(cardCode).join('');
  return `s:${c(s.hole)}.${c(s.board)}.${c(s.dealer)}`;
}

export function showdownFromCode(code: string): ShowdownSpot {
  const m = /^s:([^.]*)\.([^.]*)\.([^.]*)$/.exec(code);
  if (!m) throw new Error(`Bad showdown code "${code}"`);
  const hole = parseCards(m[1]!);
  const board = parseCards(m[2]!);
  const dealer = parseCards(m[3]!);
  if (hole.length !== 2 || board.length !== 5 || dealer.length !== 2)
    throw new Error(`Bad showdown code "${code}"`);
  if (new Set([...hole, ...board, ...dealer]).size !== 9)
    throw new Error(`Duplicate card in "${code}"`);
  const base = {
    hole: [hole[0]!, hole[1]!] as const,
    board: board as unknown as ShowdownSpot['board'],
    dealer: [dealer[0]!, dealer[1]!] as const,
  };
  return { ...base, code: showdownCode(base) };
}

/** What each question's answer is, from the engine's settlement of the nine cards. */
export function showdownTruth(spot: ShowdownSpot): ShowdownTruth {
  const deal: Deal = { player: spot.hole, dealer: spot.dealer, board: spot.board, forced: false };
  // 1x Play, so the showdown settles exactly as at the table; the stakes do not change who wins.
  const result = settleHand(
    deal,
    { ante: 1000, blind: 1000, trips: 0 },
    { multiple: 1 },
    false,
    DEFAULT_RULES,
  );
  const blind = result.wagers.find((w) => w.wager === 'blind')!;
  return {
    winner: result.outcome === 'win' ? 'you' : result.outcome === 'lose' ? 'dealer' : 'tie',
    qualifies: result.dealerQualifies,
    blind: blind.profit > 0 ? 'pays' : blind.profit < 0 ? 'loses' : 'pushes',
    result,
    deal,
  };
}

export function gradeShowdown(spot: ShowdownSpot, a: ShowdownAnswers): ShowdownGrade {
  const t = showdownTruth(spot);
  const winner = a.winner === t.winner;
  const qualifies = a.qualifies === t.qualifies;
  const blind = a.blind === t.blind;
  return { winner, qualifies, blind, all: winner && qualifies && blind };
}

// ---------- sampling ----------
function dealNine(rng: RngState): [ShowdownSpot, RngState] {
  // Partial Fisher-Yates: nine distinct cards.
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let r = rng;
  for (let i = 0; i < 9; i++) {
    const [j, next] = randBelow(r, 52 - i);
    r = next;
    const pick = deck[i + j]!;
    deck[i + j] = deck[i]!;
    deck[i] = pick;
  }
  const c = deck.slice(0, 9);
  const base = {
    hole: [c[0]!, c[1]!] as const,
    board: c.slice(2, 7) as unknown as ShowdownSpot['board'],
    dealer: [c[7]!, c[8]!] as const,
  };
  return [{ ...base, code: showdownCode(base) }, r];
}

const SAME_CATEGORY_KICKERS = new Set(['high-card', 'pair', 'two-pair', 'trips']);

/** Whether a deal is a teaching case of the given kind. */
export function showdownKindOf(spot: ShowdownSpot, kind: ShowdownKind): boolean {
  const player = evaluateN([...spot.hole, ...spot.board]);
  const dealer = evaluateN([...spot.dealer, ...spot.board]);
  switch (kind) {
    case 'kicker':
      // Same category, decided by a kicker (or a lower pair), not a tie.
      return (
        player.category === dealer.category &&
        SAME_CATEGORY_KICKERS.has(player.category) &&
        player.value !== dealer.value
      );
    case 'board-plays':
      // Both hands are the same five cards of the board: a tie nobody can improve.
      return (
        player.value === dealer.value &&
        player.best5.every((c) => spot.board.includes(c)) &&
        dealer.best5.every((c) => spot.board.includes(c))
      );
    case 'not-qualified':
      return dealer.category === 'high-card';
    case 'blind-straight': {
      // The Blind pays only for a win with a straight or better.
      const straightUp = [
        'straight',
        'flush',
        'full-house',
        'quads',
        'straight-flush',
        'royal-flush',
      ];
      return player.value > dealer.value && straightUp.includes(player.category);
    }
  }
}

/** One seeded deal. With `teaching` about half of them are one of the teaching kinds. */
export function nextShowdownSpot(
  rng: RngState,
  opts: { teaching?: boolean; kind?: ShowdownKind } = {},
): [ShowdownSpot, RngState] {
  let r = rng;
  let kind = opts.kind;
  if (!kind && opts.teaching) {
    let u: number;
    [u, r] = randBelow(r, 8);
    // 0..3 pick a kind (half the spots), 4..7 stay plain random.
    if (u < 4) kind = SHOWDOWN_KINDS[u];
  }
  let spot: ShowdownSpot;
  [spot, r] = dealNine(r);
  if (!kind) return [spot, r];
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    if (showdownKindOf(spot, kind)) return [spot, r];
    [spot, r] = dealNine(r);
  }
  return [spot, r];
}
