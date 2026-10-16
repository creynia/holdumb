// How the container combines app settings, scene options and URL presets.
import type { SceneConfig } from '../scene';
import type { SimSettings } from './types';
import { effectiveSpeed } from './animation';
import type { Speed } from './animation';

export function resolveSpeed(settings: SimSettings, scene: SceneConfig): Speed {
  return effectiveSpeed(scene.ui?.speed ?? settings.animationSpeed);
}

/** A scene may force practice (D11); the sandbox starts from the setting. */
export function resolvePractice(settings: SimSettings, scene: SceneConfig): boolean {
  return scene.practice ?? settings.practice;
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
