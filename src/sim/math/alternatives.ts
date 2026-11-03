// Better-alternative card (simulator.md §2.5, curriculum.md §8.4). The alternative is always the
// best option; this module picks the copy key and the variables the copy needs. The UI/content
// layer owns the wording, keyed by `copyKey`.
import { handValueOf } from '../engine/evaluator';
import { RANK_CHARS } from '../engine/types';
import type { Card, DecisionAction } from '../engine/types';
import { flopMade, flushDrawFlop, hiddenPairFlop } from './flopRules';
import { isChartHand, preflopClass } from './preflop';
import type { DecisionPreview, Fraction, PreviewRequest } from './types';

export type AlternativeCopyKey =
  | 'pre-check-chart-hand' //   Check a chart hand → Bet 4x
  | 'pre-4x-non-chart' //       Bet 4x a non-chart hand → Check
  | 'pre-3x' //                 Bet 3x (never best) → best option
  | 'pre-check-other' //        Check a non-chart hand that is still better as 4x (rare)
  | 'flop-check-hidden' //      Check with a hidden pair (or two pair+ built on it) → Bet 2x
  | 'flop-check-made' //        Check a made straight / flush (no hidden pair) → Bet 2x
  | 'flop-check-other' //       Check where 2x is still better (draws, rare)
  | 'flop-2x-no-hand' //        Bet 2x without a qualifying hand → Check
  | 'river-fold-hidden' //      Fold with a hidden pair → Bet 1x
  | 'river-fold-low-outs' //    Fold with < 21 outs → Bet 1x
  | 'river-fold-board-plays' // Fold when the board plays → Bet 1x
  | 'river-fold-other' //       Fold where 1x is still better
  | 'river-1x-high-outs' //     Bet 1x with ≥ 21 outs and no hidden pair → Fold
  | 'river-1x-other'; //        Bet 1x where Fold is still better (hidden pair or < 21 outs)

/** Facts the copy mentions. All optional: only those relevant to the situation are set. */
export type MadeHand =
  'two-pair' | 'trips' | 'straight' | 'flush' | 'full-house' | 'quads' | 'straight-flush';

export interface AlternativeVars {
  hand?: string; //                   preflop class, 'AKs'
  outs?: number; //                   dealer outs at the river
  pairRank?: string; //               rank char of the hidden pair, 'K'
  /** Why a no-hand flop is not worth a 2x (only when the rule says check). */
  flopReason?: 'board-pair' | 'straight-draw' | 'flush-draw' | 'nothing';
  /** The made hand on a flop check of a straight, flush or better without a hidden pair. */
  made?: MadeHand;
}

export interface BetterAlternative {
  copyKey: AlternativeCopyKey;
  /** `options[bestIndex]` of the preview. */
  bestIndex: number;
  chosenIndex: number;
  /** best.ev − chosen.ev in ante units (> 0). */
  regret: Fraction;
  vars: AlternativeVars;
  /** Set when the basic card (D3 §3) disagrees with perfect play here. */
  basicException?: { ruleAction: DecisionAction };
}

// ---------- situation facts (decisions.md §3 definitions) ----------

const catOf = (v: number): number => v >>> 20;

export interface RiverFacts {
  /** category(best 5 of 7) ≥ pair and > category(the board's 5). */
  hidden: boolean;
  /** Unseen cards that would give the dealer a hand better than yours (of 45). */
  outs: number;
  /** The outs themselves, highest rank first, cards of one rank adjacent. `length === outs`. */
  outCards: Card[];
  /** Your best five is the board itself. */
  boardPlays: boolean;
  /** Basic river: bet 1x if hidden or outs < 21, else fold. */
  basicAction: 'play' | 'fold';
}

/** Cards you can see on the river (2 + 5), so 45 are unseen. */
export const RIVER_UNSEEN = 45;

export function riverFacts(hole: readonly [Card, Card], board: readonly Card[]): RiverFacts {
  const mine = handValueOf([...hole, ...board]);
  const boardValue = handValueOf(board);
  const hidden = catOf(mine) >= 1 && catOf(mine) > catOf(boardValue);
  const outCards: Card[] = [];
  const seen = new Set<number>([...hole, ...board]);
  const six = [...board, 0];
  for (let c = 51; c >= 0; c--) {
    if (seen.has(c)) continue;
    six[board.length] = c;
    if (handValueOf(six) > mine) outCards.push(c);
  }
  return {
    hidden,
    outs: outCards.length,
    outCards,
    boardPlays: mine === boardValue,
    basicAction: hidden || outCards.length < 21 ? 'play' : 'fold',
  };
}

/** One rank's share of the outs: `all` when every unseen card of that rank is an out. */
export interface OutGroup {
  rank: number;
  cards: Card[];
  all: boolean;
}

/**
 * The outs grouped by rank, highest first, for copy like "any king (3)" (`all`) or
 * "the 9 of clubs" (not `all`: only some unseen cards of that rank beat you, e.g. a flush).
 */
export function groupOuts(
  outCards: readonly Card[],
  hole: readonly [Card, Card],
  board: readonly Card[],
): OutGroup[] {
  const seenOfRank = new Array<number>(13).fill(0);
  for (const c of [...hole, ...board]) seenOfRank[c >> 2]!++;
  const groups: OutGroup[] = [];
  for (const c of [...outCards].sort((a, b) => b - a)) {
    const rank = c >> 2;
    const last = groups[groups.length - 1];
    if (last && last.rank === rank) last.cards.push(c);
    else groups.push({ rank, cards: [c], all: false });
  }
  for (const g of groups) g.all = g.cards.length === 4 - seenOfRank[g.rank]!;
  return groups;
}

export interface FlopFacts {
  /** (a) two pair or better using the board and a hole card, above the flop's own category. */
  twoPairPlus: boolean;
  /** (b) a pocket pair other than 22, or a hole card matching a flop rank. */
  hiddenPair: boolean;
  /** (c) four to a suit with a hole card of that suit at T or higher. */
  flushDraw: boolean;
  /** The rule says Bet 2x. */
  basicRaise: boolean;
  pairRank?: string;
  /** Set when `twoPairPlus`: the made hand. */
  made?: MadeHand;
  /** Set only when the rule says check (no hand). */
  reason?: NonNullable<AlternativeVars['flopReason']>;
}

const MADE: Record<number, MadeHand> = {
  2: 'two-pair',
  3: 'trips',
  4: 'straight',
  5: 'flush',
  6: 'full-house',
  7: 'quads',
  8: 'straight-flush',
  9: 'straight-flush',
};

export function flopFacts(hole: readonly [Card, Card], flop: readonly Card[]): FlopFacts {
  const five = [...hole, ...flop];
  const v5 = handValueOf(five);
  const twoPairPlus = flopMade(hole, flop);
  const r0 = hole[0] >> 2;
  const r1 = hole[1] >> 2;
  const flopRanks = flop.map((c) => c >> 2);
  const pocket = r0 === r1;
  const hiddenPair = hiddenPairFlop(hole, flop, [0]);
  const flushDraw = flushDrawFlop(hole, flop, 4, 8);
  const pairRank = pocket ? r0 : flopRanks.includes(r0) ? r0 : flopRanks.includes(r1) ? r1 : -1;
  const fourFlush = [0, 1, 2, 3].some((s) => five.filter((c) => (c & 3) === s).length >= 4);
  const paired = new Set(flopRanks).size < 3;
  const out: FlopFacts = {
    twoPairPlus,
    hiddenPair,
    flushDraw,
    basicRaise: twoPairPlus || hiddenPair || flushDraw,
  };
  if (twoPairPlus) out.made = MADE[catOf(v5)];
  if (!out.basicRaise) {
    out.reason = fourFlush
      ? 'flush-draw'
      : paired
        ? 'board-pair'
        : hasStraightDraw(five)
          ? 'straight-draw'
          : 'nothing';
  }
  if (pairRank >= 0) out.pairRank = RANK_CHARS.charAt(pairRank);
  return out;
}

/** Which basic flop rule fires (decisions.md section 3) and why, for the EV sheet's rule line. */
export interface BasicFlopRule {
  /** (a) two pair or better using your cards, (b) a hidden pair (not 22), (c) four to a flush with a ten+. */
  rule: 'a' | 'b' | 'c' | null;
  /** The card says Bet 2x (a rule fired) or Check. */
  raise: boolean;
  /** Rule (b): the pair is in your pocket (not paired with the flop). */
  pocketPair?: boolean;
  /** Rank character of the pair for rule (b). */
  pairRank?: string;
  /** Rule (a): the made hand. */
  made?: MadeHand;
  /** No rule: why. `pocket-deuces` is 22 with no deuce on the flop (the card never raises it). */
  reason?: NonNullable<AlternativeVars['flopReason']> | 'pocket-deuces';
}

/** First matching rule in the card's order a, b, c; null means the card says Check. */
export function basicFlopRule(hole: readonly [Card, Card], flop: readonly Card[]): BasicFlopRule {
  const f = flopFacts(hole, flop);
  if (f.twoPairPlus) return { rule: 'a', raise: true, ...(f.made ? { made: f.made } : {}) };
  if (f.hiddenPair) {
    const pocket = hole[0] >> 2 === hole[1] >> 2;
    return {
      rule: 'b',
      raise: true,
      pocketPair: pocket,
      ...(f.pairRank ? { pairRank: f.pairRank } : {}),
    };
  }
  if (f.flushDraw) return { rule: 'c', raise: true };
  const deuces = hole[0] >> 2 === 0 && hole[1] >> 2 === 0;
  return { rule: null, raise: false, reason: deuces ? 'pocket-deuces' : f.reason! };
}

function hasStraightDraw(cards: readonly Card[]): boolean {
  const mask = cards.reduce((m, c) => m | (1 << (c >> 2)), 0);
  const withLow = (mask << 1) | ((mask >> 12) & 1);
  for (let lo = 0; lo <= 9; lo++) {
    const win = (withLow >> lo) & 0b11111;
    let bits = 0;
    for (let i = 0; i < 5; i++) bits += (win >> i) & 1;
    if (bits >= 4) return true;
  }
  return false;
}

// ---------- the alternative ----------

export function betterAlternative(
  req: PreviewRequest,
  preview: DecisionPreview,
  chosenIndex: number,
): BetterAlternative | null {
  const chosen = preview.options[chosenIndex];
  const best = preview.options[preview.bestIndex];
  if (!chosen || !best) throw new RangeError('chosenIndex out of range');
  if (preview.bestIndex === chosenIndex || chosen.tier === 'best') return null;
  const regret = chosen.regret;
  const base = { bestIndex: preview.bestIndex, chosenIndex, regret };
  const act = chosen.action;

  if (preview.street === 'preflop') {
    const hand = preflopClass(req.hole);
    const chart = isChartHand(hand);
    const vars: AlternativeVars = { hand };
    if (act.type === 'play' && act.multiple === 3) return { ...base, copyKey: 'pre-3x', vars };
    if (act.type === 'check') {
      return { ...base, copyKey: chart ? 'pre-check-chart-hand' : 'pre-check-other', vars };
    }
    return { ...base, copyKey: 'pre-4x-non-chart', vars };
  }

  if (preview.street === 'flop') {
    const f = flopFacts(req.hole, req.board);
    const vars: AlternativeVars = {};
    if (f.reason) vars.flopReason = f.reason;
    if (f.pairRank) vars.pairRank = f.pairRank;
    if (f.made && !f.hiddenPair) vars.made = f.made;
    const alt: BetterAlternative =
      act.type === 'check'
        ? {
            ...base,
            copyKey: f.hiddenPair
              ? 'flop-check-hidden'
              : f.twoPairPlus
                ? 'flop-check-made'
                : 'flop-check-other',
            vars,
          }
        : { ...base, copyKey: 'flop-2x-no-hand', vars };
    if (f.basicRaise !== (best.action.type === 'play')) {
      alt.basicException = {
        ruleAction: f.basicRaise ? { type: 'play', multiple: 2 } : { type: 'check' },
      };
    }
    return alt;
  }

  const f = riverFacts(req.hole, req.board);
  const vars: AlternativeVars = { outs: f.outs };
  let alt: BetterAlternative;
  if (act.type === 'fold') {
    const copyKey: AlternativeCopyKey = f.hidden
      ? 'river-fold-hidden'
      : f.boardPlays
        ? 'river-fold-board-plays'
        : f.outs < 21
          ? 'river-fold-low-outs'
          : 'river-fold-other';
    alt = { ...base, copyKey, vars };
  } else {
    alt = {
      ...base,
      copyKey: !f.hidden && f.outs >= 21 ? 'river-1x-high-outs' : 'river-1x-other',
      vars,
    };
  }
  const bestIsPlay = best.action.type === 'play';
  if ((f.basicAction === 'play') !== bestIsPlay) {
    alt.basicException = {
      ruleAction: f.basicAction === 'play' ? { type: 'play', multiple: 1 } : { type: 'fold' },
    };
  }
  return alt;
}
