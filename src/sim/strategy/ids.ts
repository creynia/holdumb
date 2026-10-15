import type { StrategyId } from './types';

/** Every strategy id in ladder order. Content tests cover exactly these (strategy.json). */
export const STRATEGY_IDS: readonly StrategyId[] = [
  'perfect',
  'expert',
  'basic',
  'simple',
  'check-to-river',
  'never-fold',
  'always-max',
  'river-leak',
];
