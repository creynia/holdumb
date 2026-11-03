// How the container combines app settings, scene options and URL presets.
import type { DecisionTier } from '../math';
import type { SceneConfig } from '../scene';
import type { ConfirmOn, EvMode, SimSettings } from './types';
import { effectiveSpeed } from './animation';
import type { Speed } from './animation';

export const EV_MODES: readonly EvMode[] = ['before', 'after', 'never'];
export const CONFIRM_ON: readonly ConfirmOn[] = ['all', 'costly', 'blunder', 'never'];

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

/**
 * A scene may force practice (D11); the sandbox starts from the setting. Until the one-tap
 * interaction lands, "after" maps onto today's practice behaviour (EV hidden until confirm).
 */
export function resolvePractice(settings: SimSettings, scene: SceneConfig): boolean {
  return scene.practice ?? settings.evMode === 'after';
}

/** Sandbox: "never" hides every EV, like a scene with `showEV: false` (D39). */
export function resolveEvShown(
  settings: SimSettings,
  scene: SceneConfig,
  sandbox: boolean,
  stepShowEV?: boolean,
): boolean {
  const explicit = stepShowEV ?? scene.showEV;
  if (explicit !== undefined) return explicit;
  return !(sandbox && !evVisibleAfter(settings.evMode));
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
