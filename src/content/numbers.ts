// Computed figures for lesson prose (I064): `{{num:<id>}}` in a lesson is replaced by NUMBERS[id] at
// compile time, so a figure that appears in many lessons can never drift. Every value is derived
// from the exact fractions in the math/strategy modules and rounded once, at the end.
// build/seo/numbers.ts reads the same registry for the answer pages.
import { PAYTABLE_PRESET_IDS, formatMoney, formatPct } from '../sim/engine';
import {
  DEALER_QUALIFY_PROBABILITY,
  GAME_EDGE,
  GAME_ELEMENT_OF_RISK,
  GAME_EXPECTED_WAGER,
  HANDS_PER_HOUR,
  tripsEdge,
} from '../sim/math/edges';
import type { Fraction } from '../sim/math/types';
import { STRATEGY_CONSTANTS } from '../sim/strategy/constants';
import { frac, fracMul, fracNeg, fracSub } from '../sim/strategy/fraction';
import type { StrategyId } from '../sim/strategy/types';

/** The example stake: a $10 Ante, in cents. */
export const EXAMPLE_ANTE_CENTS = 1000;

/**
 * D36: "check to the river, bet 1x only with a hidden pair", settled exactly by the strategy work
 * package (decisions.md D36; pinned in src/sim/strategy/d36.slow.test.ts).
 */
export const D36_EV: Fraction = frac(-69584314001n, 139069050120n);

/** Round half away from zero to `digits` decimals, exactly (one rounding of an exact fraction). */
export function decimal(f: Fraction, digits: number): string {
  let { num: n, den: d } = f;
  if (d < 0n) [n, d] = [-n, -d];
  const neg = n < 0n;
  const scaled = (neg ? -n : n) * 10n ** BigInt(digits);
  const q = (2n * scaled + d) / (2n * d);
  const s = q.toString().padStart(digits + 1, '0');
  const body = digits > 0 ? `${s.slice(0, -digits)}.${s.slice(-digits)}` : s;
  return `${neg && q !== 0n ? '-' : ''}${body}`;
}

/** Exact cents rounded once, then formatted like the rest of the app ("$6.55", "$1,249"). */
export function money(cents: Fraction): string {
  return formatMoney(Number(decimal(cents, 0)));
}

/** Expected loss per hour at a $10 Ante and HANDS_PER_HOUR hands, from an edge per Ante. */
export const perHour = (edge: Fraction): string =>
  money(fracMul(edge, frac(BigInt(HANDS_PER_HOUR * EXAMPLE_ANTE_CENTS))));

const edgeOf = (id: StrategyId): Fraction => fracNeg(STRATEGY_CONSTANTS[id].ev);
const PER_HOUR_STRATEGIES: readonly StrategyId[] = ['perfect', 'expert', 'basic', 'simple'];
const D36_EDGE = fracNeg(D36_EV);

function build(): Record<string, string> {
  const n: Record<string, string> = {
    'perfect-edge-2': formatPct(GAME_EDGE, 2),
    'perfect-edge-3': formatPct(GAME_EDGE, 3),
    'perfect-eor-2': formatPct(GAME_ELEMENT_OF_RISK, 2),
    'perfect-eor-3': formatPct(GAME_ELEMENT_OF_RISK, 3),
    'perfect-wager': decimal(GAME_EXPECTED_WAGER, 2),
    'dealer-qualify': formatPct(DEALER_QUALIFY_PROBABILITY, 1),
    'd36-edge-2': formatPct(D36_EDGE, 2),
    'd36-per-hour': perHour(D36_EDGE),
    'd36-extra-per-hour': perHour(fracSub(D36_EDGE, GAME_EDGE)),
  };
  for (const id of PER_HOUR_STRATEGIES) {
    n[`${id}-per-hour`] = perHour(edgeOf(id));
    if (id === 'perfect') continue;
    n[`${id}-edge-2`] = formatPct(edgeOf(id), 2);
    n[`${id}-edge-3`] = formatPct(edgeOf(id), 3);
    n[`${id}-extra-3`] = formatPct(fracSub(edgeOf(id), GAME_EDGE), 3);
    n[`${id}-extra-per-hour`] = perHour(fracSub(edgeOf(id), GAME_EDGE));
  }
  n['basic-wager'] = decimal(STRATEGY_CONSTANTS.basic.wager, 2);
  n['basic-action-per-hour'] = money(
    fracMul(STRATEGY_CONSTANTS.basic.wager, frac(BigInt(HANDS_PER_HOUR * EXAMPLE_ANTE_CENTS))),
  );
  for (const id of PAYTABLE_PRESET_IDS)
    n[`${id}-edge`] = formatPct(tripsEdge(id).edge, 2);
  return n;
}

/** id -> the exact text a `{{num:id}}` token renders. */
export const NUMBERS: Readonly<Record<string, string>> = build();
