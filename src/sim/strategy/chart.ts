// Chart data for StrategyChart (table-ui renders it): preflop grid + flop/river rule lists.
import { RANK_CHARS } from '../engine/types';
import { STRATEGY_CONSTANTS } from './constants';
import { RULE_DEFS } from './rules';
import type { HandPredicate, StrategyId } from './types';

export interface ChartCell {
  /** 'AKs', 'AKo', 'TT' */
  cls: string;
  action: '4x' | 'check';
}
export interface RuleLine {
  /** Stable id for copy lookup in content/strategy.json. */
  id: string;
  predicate: HandPredicate;
  /** English fallback; the content layer owns the real wording. */
  text: string;
}
export interface StrategyChartData {
  id: StrategyId;
  name: string;
  /** 13 x 13, rows and columns A..2; above the diagonal suited, below offsuit, diagonal pairs. */
  grid: ChartCell[][];
  ranks: string[];
  fourXCount: number;
  flop: { rule: 'rules'; lines: RuleLine[] } | { rule: 'enumeration' } | { rule: 'never' };
  river:
    | { rule: 'rules'; lines: RuleLine[] }
    | { rule: 'always' }
    | { rule: 'enumeration' }
    | { rule: 'never' };
}

export function describePredicate(p: HandPredicate): RuleLine {
  if ('flopMade' in p)
    return {
      id: 'flop-two-pair-plus',
      predicate: p,
      text: 'Two pair or better using a hole card',
    };
  if ('hiddenPair' in p) {
    const noDeuces = (p.hiddenPair.exceptPocket ?? []).includes(0);
    return {
      id: 'flop-hidden-pair',
      predicate: p,
      text: noDeuces
        ? 'A hidden pair: a pocket pair (not 22) or a hole card matching the flop'
        : 'A hidden pair: any pocket pair or a hole card matching the flop',
    };
  }
  if ('flushDraw' in p)
    return {
      id: 'flop-flush-draw',
      predicate: p,
      text: `Four to a flush with a ${RANK_CHARS.charAt(p.flushDraw.minHoleRank)} or better of that suit in your hand`,
    };
  if ('hidden' in p)
    return {
      id: 'river-hidden-pair',
      predicate: p,
      text: 'A hidden pair or better (the board alone does not make it)',
    };
  if ('dealerOutsBelow' in p)
    return {
      id: 'river-outs',
      predicate: p,
      text: `Fewer than ${p.dealerOutsBelow} dealer outs`,
    };
  return {
    id: 'any',
    predicate: p,
    text: p.any.map((q) => describePredicate(q).text).join('; or '),
  };
}

export function strategyChart(id: StrategyId): StrategyChartData {
  const def = RULE_DEFS[id];
  const set = new Set(def.preflop4x);
  const ranks = [...RANK_CHARS].reverse();
  const grid = ranks.map((hi, r) =>
    ranks.map((lo, c) => {
      const cls = r === c ? hi + lo : r < c ? `${hi}${lo}s` : `${lo}${hi}o`;
      return { cls, action: set.has(cls) ? ('4x' as const) : ('check' as const) };
    }),
  );
  const lines = (ps: readonly HandPredicate[]): RuleLine[] => ps.map(describePredicate);
  let flop: StrategyChartData['flop'];
  if (id === 'perfect') flop = { rule: 'enumeration' };
  else if (def.flop2x.length === 0) flop = { rule: 'never' };
  else flop = { rule: 'rules', lines: lines(def.flop2x) };
  let river: StrategyChartData['river'];
  if (def.river1x === 'always') river = { rule: 'always' };
  else if (def.river1x === 'perfect') river = { rule: 'enumeration' };
  else if (def.river1x.length === 0) river = { rule: 'never' };
  else river = { rule: 'rules', lines: lines(def.river1x) };
  return {
    id,
    name: STRATEGY_CONSTANTS[id].name,
    grid,
    ranks,
    fourXCount: def.preflop4x.length,
    flop,
    river,
  };
}
