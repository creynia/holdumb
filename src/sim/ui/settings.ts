// How the container combines app settings, scene options and URL presets.
import type { DecisionTier } from '../math';
import { stepConfirmOn, stepEvMode } from '../scene/modes';
import type { SceneConfig, SceneStep } from '../scene/types';
import type { ConfirmOn, EvMode, SimSettings } from './types';
import { effectiveSpeed } from './animation';
import type { Speed } from './animation';

export { CONFIRM_ON, EV_MODES } from '../scene/modes';

/** EV shown on the buttons and sheet before you act (D39). */
export function evVisibleBefore(mode: EvMode): boolean {
  return mode === 'before';
}

/** EV comparison shown once you have acted (D39). */
export function evVisibleAfter(mode: EvMode): boolean {
  return mode !== 'never';
}

/**
 * Whether a move of this tier asks for a confirm step (D24, D39). Tiers themselves are unchanged:
 * `costly` covers Mistake and Big mistake (regret > 0.10 Ante), `blunder` only Big mistake.
 */
export function needsConfirm(confirmOn: ConfirmOn, tier: DecisionTier): boolean {
  switch (confirmOn) {
    case 'all':
      return true;
    case 'costly':
      return tier === 'costly' || tier === 'blunder';
    case 'blunder':
      return tier === 'blunder';
    default:
      return false;
  }
}

/** Legacy boolean practice flag (stored settings, snapshots, scenes) onto the EV mode. */
export function evModeOfPractice(practice: boolean): EvMode {
  return practice ? 'after' : 'before';
}

export function resolveSpeed(settings: SimSettings, scene: SceneConfig): Speed {
  return effectiveSpeed(scene.ui?.speed ?? settings.animationSpeed);
}

type Mode = 'sandbox' | 'scene';

/**
 * EV visibility (D39). In a lesson the scene decides (its `evMode`, or the legacy `practice` /
 * `showEV` aliases; a step override wins); the user's setting applies only in the sandbox.
 */
export function resolveEvMode(
  settings: SimSettings,
  scene: SceneConfig,
  mode: Mode,
  step?: SceneStep | null,
): EvMode {
  return mode === 'sandbox' ? settings.evMode : stepEvMode(scene, step);
}

/** Confirm policy (D39): the scene's (step override wins, default 'never') in a lesson. */
export function resolveConfirm(
  settings: SimSettings,
  scene: SceneConfig,
  step: SceneStep | null | undefined,
  mode: Mode,
): ConfirmOn {
  return mode === 'sandbox' ? settings.confirmOn : stepConfirmOn(scene, step);
}

/**
 * Legacy: practice behaviour (EV hidden until confirm) is evMode 'after'. Until the one-tap
 * interaction lands the container still reads this boolean.
 */
export function resolvePractice(
  settings: SimSettings,
  scene: SceneConfig,
  mode: Mode = 'sandbox',
): boolean {
  return resolveEvMode(settings, scene, mode) === 'after';
}

/** Sandbox: "never" hides every EV, like a scene with `showEV: false` (D39). */
export function resolveEvShown(
  settings: SimSettings,
  scene: SceneConfig,
  sandbox: boolean,
  step?: SceneStep | null,
): boolean {
  // A lesson: its own evMode (or the showEV / practice aliases), step first (D39).
  if (!sandbox) return evVisibleAfter(stepEvMode(scene, step));
  const explicit = step?.showEV ?? scene.showEV;
  if (explicit !== undefined) return explicit;
  return evVisibleAfter(settings.evMode);
}

export function randomSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0]! | 0;
  } catch {
    return Math.floor(Math.random() * 2 ** 31);
  }
}
