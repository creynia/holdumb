// Scene gating helpers shared by the validator, the runner and the UI (pure, no DOM).
import type { Action, ActionType, DecisionStreet } from '../engine/types';
import type { ActionMatcher, OptionKey, SceneConfig, SceneStep } from './types';

export const OPTION_KEYS: readonly OptionKey[] = [
  'check',
  'play-4',
  'play-3',
  'play-2',
  'play-1',
  'fold',
];
export const ACTION_TYPES: readonly ActionType[] = [
  'set-bet',
  'deal',
  'clear',
  'check',
  'play',
  'fold',
];

/** The options on each decision street, in display order (D31). */
export const STREET_OPTIONS: Record<DecisionStreet, readonly OptionKey[]> = {
  preflop: ['play-4', 'play-3', 'check'],
  flop: ['play-2', 'check'],
  river: ['play-1', 'fold'],
};

export function optionKeyOfAction(a: Action): OptionKey | null {
  if (a.type === 'check') return 'check';
  if (a.type === 'fold') return 'fold';
  if (a.type === 'play') return `play-${a.multiple}` as OptionKey;
  return null;
}
export function actionOfOption(k: OptionKey): Action {
  if (k === 'check') return { type: 'check' };
  if (k === 'fold') return { type: 'fold' };
  return { type: 'play', multiple: Number(k.slice(5)) as 1 | 2 | 3 | 4 };
}
export function actionTypeOfOption(k: OptionKey): ActionType {
  return k === 'check' ? 'check' : k === 'fold' ? 'fold' : 'play';
}

export interface Gate {
  actions?: readonly ActionType[];
  options?: readonly OptionKey[];
}

/** A step's own gating replaces the scene's; a step that says nothing inherits the scene's. */
export function effectiveGate(scene: SceneConfig, step?: SceneStep): Gate {
  return {
    actions: step?.allowedActions ?? scene.allowedActions,
    options: step?.allowedOptions ?? scene.allowedOptions,
  };
}

/** Does the gate let this action through? (`set-bet` and `deal` are gated by action type only.) */
export function gateAllows(gate: Gate, a: Action): boolean {
  if (gate.actions && !gate.actions.includes(a.type)) return false;
  const k = optionKeyOfAction(a);
  if (k && gate.options && !gate.options.includes(k)) return false;
  return true;
}

/** Options the gate leaves on a decision street. */
export function gatedOptions(gate: Gate, street: DecisionStreet): OptionKey[] {
  return STREET_OPTIONS[street].filter((k) => gateAllows(gate, actionOfOption(k)));
}

/** Does the matcher accept this action? `best` needs the container's verdict. */
export function matchAction(m: ActionMatcher, a: Action, wasBest?: boolean): boolean {
  if (m.type !== a.type) return false;
  if (m.option !== undefined) {
    const k = optionKeyOfAction(a);
    const want = Array.isArray(m.option) ? m.option : [m.option];
    if (!k || !want.includes(k)) return false;
  }
  if (a.type === 'set-bet') {
    if (m.wager !== undefined && m.wager !== a.wager) return false;
    if (m.amount !== undefined && m.amount !== a.amount) return false;
    if (m.minAmount !== undefined && a.amount < m.minAmount) return false;
    if (m.maxAmount !== undefined && a.amount > m.maxAmount) return false;
  }
  if (m.best && wasBest !== true) return false;
  return true;
}
