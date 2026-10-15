// Better-alternative card (simulator.md §2.5, curriculum.md §8.4). The alternative is always the
// best option; this module picks the copy key and the variables the copy needs. The UI/content
// layer owns the wording, keyed by `copyKey`.
import { handValueOf } from '../engine/evaluator';
import { RANK_CHARS } from '../engine/types';
import type { Card, DecisionAction } from '../engine/types';
import { isChartHand, preflopClass } from './preflop';
import type { DecisionPreview, Fraction, PreviewRequest } from './types';

export type AlternativeCopyKey =
  | 'pre-check-chart-hand' //   Check a chart hand → Bet 4x
  | 'pre-4x-non-chart' //       Bet 4x a non-chart hand → Check
  | 'pre-3x' //                 Bet 3x (never best) → best option
  | 'pre-check-other' //        Check a non-chart hand that is still better as 4x (rare)
  | 'flop-check-hidden' //      Check with a hidden pair / two pair+ → Bet 2x
  | 'flop-check-other' //       Check where 2x is still better (draws, rare)
  | 'flop-2x-no-hand' //        Bet 2x without a qualifying hand → Check
  | 'river-fold-hidden' //      Fold with a hidden pair → Bet 1x
  | 'river-fold-low-outs' //    Fold with < 21 outs → Bet 1x
  | 'river-fold-board-plays' // Fold when the board plays → Bet 1x
  | 'river-fold-other' //       Fold where 1x is still better
  | 'river-1x-high-outs'; //    Bet 1x with ≥ 21 outs and no hidden pair → Fold

/** Facts the copy mentions. All optional: only those relevant to the situation are set. */
export interface AlternativeVars {
  hand?: string; //                   preflop class, 'AKs'
  outs?: number; //                   dealer outs at the river
  pairRank?: string; //               rank char of the hidden pair, 'K'
  flopReason?: 'board-pair' | 'straight-draw' | 'flush-draw' | 'nothing';
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
  /** Your best five is the board itself. */
  boardPlays: boolean;
  /** Basic river: bet 1x if hidden or outs < 21, else fold. */
  basicAction: 'play' | 'fold';
}

export function riverFacts(hole: readonly [Card, Card], board: readonly Card[]): RiverFacts {
  const mine = handValueOf([...hole, ...board]);
  const boardValue = handValueOf(board);
  const hidden = catOf(mine) >= 1 && catOf(mine) > catOf(boardValue);
  let outs = 0;
  const seen = new Set<number>([...hole, ...board]);
  for (let c = 0; c < 52; c++) {
    if (seen.has(c)) continue;
    if (handValueOf([...board, c]) > mine) outs++;
  }
  return {
    hidden,
    outs,
    boardPlays: mine === boardValue,
    basicAction: hidden || outs < 21 ? 'play' : 'fold',
  };
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
  reason: NonNullable<AlternativeVars['flopReason']>;
}

export function flopFacts(hole: readonly [Card, Card], flop: readonly Card[]): FlopFacts {
  const five = [...hole, ...flop];
  const v5 = handValueOf(five);
  const flopCat = catOf(flopOnly(flop));
  const twoPairPlus = catOf(v5) >= 2 && catOf(v5) > flopCat;
  const r0 = hole[0] >> 2;
  const r1 = hole[1] >> 2;
  const flopRanks = flop.map((c) => c >> 2);
  const pocket = r0 === r1;
  const match = flopRanks.includes(r0) || flopRanks.includes(r1);
  const hiddenPair = (pocket && r0 !== 0) || match;
  let flushDraw = false;
  for (let s = 0; s < 4; s++) {
    const n = five.filter((c) => (c & 3) === s).length;
    if (n >= 4 && hole.some((c) => (c & 3) === s && c >> 2 >= 8)) flushDraw = true;
  }
  const pairRank = pocket ? r0 : flopRanks.includes(r0) ? r0 : flopRanks.includes(r1) ? r1 : -1;
  const fourFlush = [0, 1, 2, 3].some((s) => five.filter((c) => (c & 3) === s).length >= 4);
  const paired = new Set(flopRanks).size < 3;
  const reason: FlopFacts['reason'] = fourFlush
    ? 'flush-draw'
    : paired
      ? 'board-pair'
      : hasStraightDraw(five)
        ? 'straight-draw'
        : 'nothing';
  const out: FlopFacts = {
    twoPairPlus,
    hiddenPair,
    flushDraw,
    basicRaise: twoPairPlus || hiddenPair || flushDraw,
    reason,
  };
  if (pairRank >= 0) out.pairRank = RANK_CHARS.charAt(pairRank);
  return out;
}

/** Category of three flop cards alone, as a packed value (pair / trips / high card). */
function flopOnly(flop: readonly Card[]): number {
  const ranks = flop.map((c) => c >> 2);
  const distinct = new Set(ranks).size;
  return distinct === 1 ? 3 << 20 : distinct === 2 ? 1 << 20 : 0;
}

function hasStraightDraw(cards: readonly Card[]): boolean {
  const mask = cards.reduce((m, c) => m | (1 << (c >> 2)), 0);
  const withLow = (mask << 1) | ((mask >> 12) & 1);
  for (let lo = 0; lo <= 9; lo++) {
    const window = (withLow >> lo) & 0b11111;
    let bits = 0;
    for (let i = 0; i < 5; i++) bits += (window >> i) & 1;
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
    const vars: AlternativeVars = { flopReason: f.reason };
    if (f.pairRank) vars.pairRank = f.pairRank;
    const alt: BetterAlternative =
      act.type === 'check'
        ? {
            ...base,
            copyKey: f.hiddenPair || f.twoPairPlus ? 'flop-check-hidden' : 'flop-check-other',
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
    alt = { ...base, copyKey: 'river-1x-high-outs', vars };
  }
  const bestIsPlay = best.action.type === 'play';
  if ((f.basicAction === 'play') !== bestIsPlay) {
    alt.basicException = {
      ruleAction: f.basicAction === 'play' ? { type: 'play', multiple: 1 } : { type: 'fold' },
    };
  }
  return alt;
}
