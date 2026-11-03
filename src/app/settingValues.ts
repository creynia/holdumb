// The value lists the store validates against, as plain data (I095). They mirror the simulator's
// own lists (engine paytables, scene modes, strategy drill categories) without importing those
// modules, so Home's first paint never loads simulator code. tests/app/settings-values.test.ts
// fails if they ever differ.
import type { PaytablePresetId } from '../sim/engine/types';
import type { ConfirmOn, EvMode } from '../sim/scene/types';
import type { DrillCategoryId } from '../sim/strategy/types';

export const PAYTABLE_PRESET_IDS: readonly PaytablePresetId[] = [
  'trips-8-6-5',
  'trips-9-7-4',
  'trips-8-7-4',
  'trips-7-6-5',
  'trips-8-6-4',
];
export const EV_MODES: readonly EvMode[] = ['before', 'after', 'never'];
export const CONFIRM_ON: readonly ConfirmOn[] = ['all', 'costly', 'blunder', 'never'];
export const DRILL_CATEGORY_IDS: readonly DrillCategoryId[] = [
  'pre-premium',
  'pre-ace',
  'pre-king',
  'pre-queen-jack',
  'pre-small-pair',
  'pre-low',
  'flop-hidden-pair',
  'flop-two-pair-plus',
  'flop-board-pair',
  'flop-flush-draw',
  'flop-straight-draw',
  'flop-nothing',
  'flop-deuces',
  'river-hidden-pair',
  'river-outs-low',
  'river-outs-edge',
  'river-outs-high',
  'river-board-plays',
];
/** Legacy boolean practice flag onto the EV mode (D39), as src/sim/ui/settings.ts does. */
export const evModeOfPractice = (practice: boolean): EvMode => (practice ? 'after' : 'before');
