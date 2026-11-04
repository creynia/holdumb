// Text helpers (options); re-exported unchanged by ../text.ts (I082 split).
import type { Action, DecisionAction } from '../../engine';
import type { OptionKey } from '../../scene';

// ---------- option labels (D31: never "Raise") ----------

export const OPTION_LABELS: Record<OptionKey, string> = {
  'play-4': 'Bet 4x',
  'play-3': 'Bet 3x',
  check: 'Check',
  'play-2': 'Bet 2x',
  'play-1': 'Bet 1x',
  fold: 'Fold',
};
/** The order options are named in prose and lists (D31). Buttons use SLOT_ORDER (I012). */
export const OPTION_ORDER: readonly OptionKey[] = [
  'play-4',
  'play-3',
  'check',
  'play-2',
  'play-1',
  'fold',
];

/**
 * The three fixed action slots (I012). Slot `a` always holds the passive action (Check, or Fold on
 * the river); bets fill `b` and `c` in size order, largest last. A street's single bet spans `bc`.
 * Portrait: a is the left column and c the right; the landscape rail stacks c on top and a at the
 * bottom. A slot never changes with the street, so no button ever jumps sides.
 */
export type ActionSlot = 'a' | 'b' | 'c' | 'bc';
export const OPTION_SLOT: Readonly<Record<OptionKey, ActionSlot>> = {
  check: 'a',
  fold: 'a',
  'play-3': 'b',
  'play-4': 'c',
  'play-2': 'bc',
  'play-1': 'bc',
};
/** Slot order (passive first, then bets ascending): the order buttons sit in, left to right. */
export const SLOT_ORDER: readonly OptionKey[] = [
  'check',
  'fold',
  'play-1',
  'play-2',
  'play-3',
  'play-4',
];

export function optionKeyOf(a: DecisionAction): OptionKey {
  if (a.type === 'check') return 'check';
  if (a.type === 'fold') return 'fold';
  return `play-${a.multiple}` as OptionKey;
}
export function actionOfKey(k: OptionKey): Extract<Action, { type: 'check' | 'play' | 'fold' }> {
  if (k === 'check') return { type: 'check' };
  if (k === 'fold') return { type: 'fold' };
  return { type: 'play', multiple: Number(k.slice(5)) as 1 | 2 | 3 | 4 };
}
