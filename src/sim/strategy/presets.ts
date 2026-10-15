// Strategy presets: data (rules.ts) + exact constants (constants.ts) -> `Strategy` objects.
import type { Card, DecisionAction, DecisionStreet, VisibleView } from '../engine/types';
import { STRATEGY_CONSTANTS } from './constants';
import { matchesAny } from './predicates';
import { handClass } from './ranks';
import { riverPlays } from './river';
import { RULE_DEFS } from './rules';
import type { Strategy, StrategyId } from './types';

const CHECK: DecisionAction = { type: 'check' };
const FOLD: DecisionAction = { type: 'fold' };
const play = (multiple: 1 | 2 | 3 | 4): DecisionAction => ({ type: 'play', multiple });

const FOUR_X: Readonly<Record<StrategyId, ReadonlySet<string>>> = Object.fromEntries(
  Object.values(RULE_DEFS).map((d) => [d.id, new Set(d.preflop4x)]),
) as unknown as Record<StrategyId, ReadonlySet<string>>;

/** The action a strategy takes with this hole and board (0, 3 or 5 cards). Pure and sync. */
export function strategyAction(
  id: StrategyId,
  hole: readonly [Card, Card],
  board: readonly Card[],
  blind: 'blind-standard' = 'blind-standard',
): DecisionAction {
  const def = RULE_DEFS[id];
  if (board.length === 0) return FOUR_X[id].has(handClass(hole)) ? play(4) : CHECK;
  if (board.length === 3) {
    if (id === 'perfect')
      throw new Error("'perfect' decides the flop by enumeration: use the preview job");
    return matchesAny(def.flop2x, hole, board) ? play(2) : CHECK;
  }
  if (board.length !== 5) throw new Error(`Bad board length ${board.length}`);
  const r = def.river1x;
  if (r === 'always') return play(1);
  if (r === 'perfect') return riverPlays(hole, board, blind) ? play(1) : FOLD;
  return matchesAny(r, hole, board) ? play(1) : FOLD;
}

/** Street of a decision view; throws when no decision is pending. */
function decisionStreet(view: VisibleView): DecisionStreet {
  if (view.played || !view.hole) throw new Error('No decision pending');
  if (view.street === 'preflop' || view.street === 'flop' || view.street === 'river')
    return view.street;
  throw new Error(`No decision on street ${view.street}`);
}

function make(id: StrategyId): Strategy {
  const c = STRATEGY_CONSTANTS[id];
  return {
    id,
    name: c.name,
    lens: c.lens,
    ev: c.ev,
    wager: c.wager,
    decide(view: VisibleView): DecisionAction {
      decisionStreet(view);
      return strategyAction(id, view.hole!, view.board, view.rules.blindPaytable);
    },
  };
}

export const STRATEGIES: Readonly<Record<StrategyId, Strategy>> = {
  perfect: make('perfect'),
  expert: make('expert'),
  basic: make('basic'),
  simple: make('simple'),
  'check-to-river': make('check-to-river'),
  'never-fold': make('never-fold'),
  'always-max': make('always-max'),
  'river-leak': make('river-leak'),
};

export function getStrategy(id: StrategyId): Strategy {
  return STRATEGIES[id];
}

/** Auto-play picker, grouped by lens (river-leak is lesson-only and never listed, D15). */
export const PICKER_GROUPS: readonly {
  lens: 'perfect' | 'practical' | 'fun';
  ids: StrategyId[];
}[] = [
  { lens: 'perfect', ids: ['perfect', 'expert'] },
  { lens: 'practical', ids: ['basic', 'simple'] },
  { lens: 'fun', ids: ['check-to-river', 'never-fold', 'always-max'] },
];
