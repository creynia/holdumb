// EV visibility and confirm policy as a scene sets them (D39). In a lesson the scene decides; the
// user's settings apply only in the sandbox (src/sim/ui/settings.ts).
import type { ConfirmOn, EvMode, SceneConfig, SceneStep } from './types';

export const EV_MODES: readonly EvMode[] = ['before', 'after', 'never'];
export const CONFIRM_ON: readonly ConfirmOn[] = ['all', 'costly', 'blunder', 'never'];

/** The scene's own mode: `evMode`, else the legacy aliases practice: true -> 'after', showEV: false -> 'never'. */
export function sceneEvMode(scene: SceneConfig): EvMode {
  if (scene.evMode) return scene.evMode;
  if (scene.practice) return 'after';
  return scene.showEV === false ? 'never' : 'before';
}

/** A step's mode: its `evMode` wins; a step `showEV` toggles EV off (or back on) as before. */
export function stepEvMode(scene: SceneConfig, step?: SceneStep | null): EvMode {
  const base = sceneEvMode(scene);
  if (!step) return base;
  if (step.evMode) return step.evMode;
  if (step.showEV === false) return 'never';
  if (step.showEV === true && base === 'never') return 'before';
  return base;
}

/** A step's confirm policy: step, then scene, default 'never'. */
export function stepConfirmOn(scene: SceneConfig, step?: SceneStep | null): ConfirmOn {
  return step?.confirmOn ?? scene.confirmOn ?? 'never';
}
