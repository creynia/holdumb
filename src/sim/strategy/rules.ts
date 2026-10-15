// The rule-based presets as DATA (simulator.md §5.2, decisions.md §3 / D16 / D20).
import type { Rank } from '../engine/types';
import { ALL_CLASSES } from './ranks';
import type { HandPredicate, RuleStrategyDef, StrategyId } from './types';

const R = '23456789TJQKA';
const cls = (hi: string, lo: string, t = ''): string => hi + lo + t;

/** Classes `hi` + each of the ranks from `loMin` up to just below `hi`, as 's' / 'o' / both. */
function span(hi: string, loMin: string, kind: 's' | 'o' | 'so'): string[] {
  const out: string[] = [];
  for (let i = R.indexOf(hi) - 1; i >= R.indexOf(loMin); i--) {
    const lo = R.charAt(i);
    if (kind.includes('s')) out.push(cls(hi, lo, 's'));
    if (kind.includes('o')) out.push(cls(hi, lo, 'o'));
  }
  return out;
}
const pairs = (from: string): string[] => {
  const out: string[] = [];
  for (let i = R.length - 1; i >= R.indexOf(from); i--) out.push(R.charAt(i) + R.charAt(i));
  return out;
};

/** 33+, any ace, any suited king, K5o+, Q6s+, Q8o+, J8s+, JTo: the 69-class optimal set (§3). */
export const PREFLOP_4X_PERFECT: readonly string[] = [
  ...pairs('3'),
  ...span('A', '2', 'so'),
  ...span('K', '2', 's'),
  ...span('K', '5', 'o'),
  ...span('Q', '6', 's'),
  ...span('Q', '8', 'o'),
  ...span('J', '8', 's'),
  'JTo',
];
/** D16 `simple`: 33+, any ace, any king, Q8+ (suited or not), JT (suited or not). */
export const PREFLOP_4X_SIMPLE: readonly string[] = [
  ...pairs('3'),
  ...span('A', '2', 'so'),
  ...span('K', '2', 'so'),
  ...span('Q', '8', 'so'),
  'JTs',
  'JTo',
];
/** Lesson-only `river-leak`: any pair or any ace. */
export const PREFLOP_4X_RIVER_LEAK: readonly string[] = [...pairs('2'), ...span('A', '2', 'so')];

const FLOP_A: HandPredicate = { flopMade: 'two-pair-plus-hole-plays' };
const FLOP_B_NO_DEUCES: HandPredicate = { hiddenPair: { exceptPocket: [0 as Rank] } };
const FLOP_B_ANY: HandPredicate = { hiddenPair: {} };
const FLOP_C: HandPredicate = { flushDraw: { minCards: 4, minHoleRank: 8 as Rank } };
const RIVER_HIDDEN: HandPredicate = { hidden: true };
const RIVER_OUTS: HandPredicate = { dealerOutsBelow: 21 };

export const RULE_DEFS: Readonly<Record<StrategyId, RuleStrategyDef>> = {
  perfect: { id: 'perfect', preflop4x: PREFLOP_4X_PERFECT, flop2x: [], river1x: 'perfect' },
  expert: {
    id: 'expert',
    preflop4x: PREFLOP_4X_PERFECT,
    flop2x: [FLOP_A, FLOP_B_NO_DEUCES, FLOP_C],
    river1x: 'perfect',
  },
  basic: {
    id: 'basic',
    preflop4x: PREFLOP_4X_PERFECT,
    flop2x: [FLOP_A, FLOP_B_NO_DEUCES, FLOP_C],
    river1x: [RIVER_HIDDEN, RIVER_OUTS],
  },
  simple: {
    id: 'simple',
    preflop4x: PREFLOP_4X_SIMPLE,
    flop2x: [FLOP_A, FLOP_B_NO_DEUCES],
    river1x: [RIVER_HIDDEN, RIVER_OUTS],
  },
  'river-leak': {
    id: 'river-leak',
    preflop4x: PREFLOP_4X_RIVER_LEAK,
    flop2x: [FLOP_A, FLOP_B_ANY],
    river1x: [RIVER_HIDDEN],
  },
  'check-to-river': { id: 'check-to-river', preflop4x: [], flop2x: [], river1x: 'perfect' },
  'never-fold': { id: 'never-fold', preflop4x: [], flop2x: [], river1x: 'always' },
  'always-max': { id: 'always-max', preflop4x: ALL_CLASSES, flop2x: [], river1x: [] },
};
