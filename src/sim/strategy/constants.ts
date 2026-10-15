// Exact constants (decisions.md §4, D6b), Trips excluded. Pinned in constants.test.ts.
// E[total wager] values (ante units) for the non-perfect strategies come from the exact
// per-class counts of the independent solver (solve3.c); EVs match decisions.md §4 exactly.
import type { TripsPaytableId } from '../engine/types';
import type { Fraction } from '../math/types';
import { frac } from './fraction';
import type { StrategyId, StrategyLens } from './types';

export interface StrategyConstant {
  name: string;
  lens: StrategyLens;
  /** EV per hand in antes. */
  ev: Fraction;
  /** E[total wagered] per hand in antes (Ante + Blind + Play). */
  wager: Fraction;
  /** Offered in the auto-play picker (river-leak is lesson-only, D15). */
  pickable: boolean;
}

const NEVER_FOLD_EV = frac(-6432686411n, 15803301150n);

export const STRATEGY_CONSTANTS: Readonly<Record<StrategyId, StrategyConstant>> = {
  perfect: {
    name: 'Perfect',
    lens: 'perfect',
    ev: frac(-50643648973n, 2317817502000n),
    wager: frac(29163830173n, 7023689400n),
    pickable: true,
  },
  expert: {
    name: 'Expert',
    lens: 'perfect',
    ev: frac(-106357031n, 4682459600n),
    wager: frac(5832669223n, 1404737880n),
    pickable: true,
  },
  basic: {
    name: 'Basic',
    lens: 'practical',
    ev: frac(-54758439n, 2299422125n),
    wager: frac(1720109869n, 413158200n),
    pickable: true,
  },
  simple: {
    name: 'Simple',
    lens: 'practical',
    ev: frac(-47068162901n, 1738363126500n),
    wager: frac(3683618672n, 877961175n),
    pickable: true,
  },
  'check-to-river': {
    name: 'Check to the river',
    lens: 'fun',
    ev: frac(-111371309107n, 347672625300n),
    wager: frac(326252651n, 117061490n),
    pickable: true,
  },
  'never-fold': {
    name: 'Never fold',
    lens: 'fun',
    ev: NEVER_FOLD_EV,
    wager: frac(3n),
    pickable: true,
  },
  'always-max': {
    name: 'Always bet 4x',
    lens: 'fun',
    ev: NEVER_FOLD_EV,
    wager: frac(6n),
    pickable: true,
  },
  'river-leak': {
    name: 'River leak',
    lens: 'practical',
    ev: frac(-6205519211n, 38630291700n),
    wager: frac(4106862871n, 1170614900n),
    pickable: false,
  },
};

/** Exact Trips edge per unit wagered (decisions.md D6b): the house's expected win. */
export const TRIPS_EDGE: Readonly<Record<TripsPaytableId, Fraction>> = {
  'trips-9-7-4': frac(301629n, 33446140n),
  'trips-8-6-5': frac(48987n, 2572780n),
  'trips-8-7-4': frac(233985n, 6689228n),
  'trips-7-6-5': frac(115779n, 2572780n),
  'trips-8-6-4': frac(545459n, 8361535n),
};

/** D10: hands per hour for every per-hour figure. */
export const HANDS_PER_HOUR = 30;
