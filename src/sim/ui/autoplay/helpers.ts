// Auto-play panel constants and pure helpers, moved out of AutoPlayPanel.tsx (I082); the panel
// re-exports shownNet and alwaysMaxNote.
import { formatPct } from '../../engine/money';
import type { TableRules } from '../../engine/types';
import { strategyMetrics } from '../../strategy/metrics';
import type { StrategySpec } from '../../strategy/types';

export const HAND_CHOICES = [30, 300, 3000] as const;
export const GROUP_LABEL = {
  perfect: 'Perfect play (Expert)',
  practical: 'Practical',
  fun: 'Fun',
} as const;

/**
 * The three net figures as shown, in whole cents. Luck is the difference of the two shown
 * figures, so Expected + Luck = Actual to the cent (rounding each figure on its own broke that).
 */
export function shownNet(
  exactNet: number,
  simNet: number,
): { expected: number; actual: number; luck: number } {
  const expected = Math.round(exactNet);
  const actual = Math.round(simNet);
  return { expected, actual, luck: actual - expected };
}

/**
 * The note under the strategy select. Always bet 4x has the same exact loss per hand as Never
 * fold but twice the money in action, so half the element of risk. Figures come from
 * strategyMetrics, so they stay right if the tables change.
 */
export function alwaysMaxNote(
  spec: StrategySpec,
  rules: Partial<TableRules> | undefined,
  handsPerHour: number,
): string {
  const never = strategyMetrics({ ...spec, id: 'never-fold' }, rules, handsPerHour);
  const always = strategyMetrics({ ...spec, id: 'always-max' }, rules, handsPerHour);
  return `Same expected loss per hand as Never fold (${formatPct(never.edgePerAnte, 2)} of the Ante), but twice the money in action, so a lower element of risk (${formatPct(always.elementOfRisk, 2)} vs ${formatPct(never.elementOfRisk, 2)}).`;
}
