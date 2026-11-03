// Per-strategy exact metrics (simulator.md §2.8, §5.2): edge, element of risk, $ per hand / hour.
import { resolveRules } from '../engine/rules';
import type { TableRules } from '../engine/types';
import type { Fraction } from '../math/types';
import { HANDS_PER_HOUR, tripsEdge } from '../math/edges';
import { STRATEGY_CONSTANTS } from './constants';
import { frac, fracAdd, fracDiv, fracMul, fracNeg, fracSub } from './fraction';
import type { StrategyMetrics, StrategySpec } from './types';

/**
 * Exact metrics for a spec. `evPerHandCents` includes the Trips bet (edge x Trips amount);
 * `edgePerAnte` is the Ante-game edge only (Trips excluded); `elementOfRisk` is loss over
 * E[total wagered] including Trips when it is used.
 */
export function strategyMetrics(
  spec: StrategySpec,
  rules?: Partial<TableRules>,
  handsPerHour: number = HANDS_PER_HOUR,
): StrategyMetrics {
  const r = resolveRules(rules);
  const c = STRATEGY_CONSTANTS[spec.id];
  const ante = frac(spec.ante);
  const trips = frac(spec.trips);
  const tripsEv = fracNeg(fracMul(tripsEdge(r.tripsPaytable).edge, trips));
  const evPerHandCents = fracAdd(fracMul(c.ev, ante), tripsEv);
  const wagerCents = fracAdd(fracMul(c.wager, ante), trips);
  const loss = fracNeg(evPerHandCents);
  return {
    edgePerAnte: fracNeg(c.ev),
    elementOfRisk: wagerCents.num === 0n ? frac(0n) : fracDiv(loss, wagerCents),
    evPerHandCents,
    evPerHourCents: fracMul(evPerHandCents, frac(handsPerHour)),
  };
}

/**
 * What the strategy costs per hour over perfect play, in cents (exact; Trips is the same for every
 * strategy so it cancels). Perfect is 0. decisions.md §4: at $10 and 30 hands/hour expert $0.26,
 * basic $0.59, simple $1.57.
 */
export function costVsPerfectPerHour(
  spec: StrategySpec,
  handsPerHour: number = HANDS_PER_HOUR,
): Fraction {
  const gap = fracSub(STRATEGY_CONSTANTS.perfect.ev, STRATEGY_CONSTANTS[spec.id].ev);
  return fracMul(fracMul(gap, frac(spec.ante)), frac(handsPerHour));
}

/** Expected $ per hand in whole cents as a number (display / chart line), Trips included. */
export function evPerHandCents(spec: StrategySpec, rules?: Partial<TableRules>): number {
  const f: Fraction = strategyMetrics(spec, rules).evPerHandCents;
  return Number((f.num * 1_000_000n) / f.den) / 1_000_000;
}
