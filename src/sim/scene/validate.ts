// WP0: shape-only validation. TODO(integration) replaces it with the strict validator
// (simulator.md §4.1: card codes, duplicate cards, completability, no dead ends per D27a).
import type { SceneConfig } from './types';

export type SceneValidation = { ok: true; scene: SceneConfig } | { ok: false; errors: string[] };

export function validateScene(json: unknown): SceneValidation {
  const errors: string[] = [];
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: ['scene must be an object'] };
  }
  const s = json as Record<string, unknown>;
  if (typeof s.id !== 'string' || s.id === '') errors.push('scene.id must be a non-empty string');
  if (s.version !== 1) errors.push('scene.version must be 1');
  if (s.steps !== undefined) {
    if (!Array.isArray(s.steps)) errors.push('scene.steps must be an array');
    else {
      s.steps.forEach((step: unknown, i) => {
        const o = (typeof step === 'object' && step !== null ? step : {}) as Record<
          string,
          unknown
        >;
        if (typeof o.id !== 'string') errors.push(`steps[${i}].id must be a string`);
        if (typeof o.text !== 'string') errors.push(`steps[${i}].text must be a string`);
        if (typeof o.completeWhen !== 'object' || o.completeWhen === null) {
          errors.push(`steps[${i}].completeWhen is required`);
        }
      });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, scene: json as SceneConfig };
}
