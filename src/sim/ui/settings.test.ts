import { describe, expect, it } from 'vitest';
import type { DecisionTier } from '../math';
import {
  CONFIRM_ON,
  EV_MODES,
  evVisibleAfter,
  evVisibleBefore,
  needsConfirm,
  resolveEvShown,
  resolvePractice,
} from './settings';
import { DEFAULT_SIM_SETTINGS } from './types';

const TIERS: DecisionTier[] = ['best', 'close', 'small', 'costly', 'blunder'];

describe('D39 settings helpers', () => {
  it('defaults: EV before, no confirm step', () => {
    expect(DEFAULT_SIM_SETTINGS.evMode).toBe('before');
    expect(DEFAULT_SIM_SETTINGS.confirmOn).toBe('never');
    expect(EV_MODES).toEqual(['before', 'after', 'never']);
    expect(CONFIRM_ON).toEqual(['all', 'costly', 'blunder', 'never']);
  });
  it('needsConfirm follows the policy for every tier', () => {
    const asked = (c: (typeof CONFIRM_ON)[number]) => TIERS.filter((t) => needsConfirm(c, t));
    expect(asked('all')).toEqual(TIERS);
    expect(asked('costly')).toEqual(['costly', 'blunder']);
    expect(asked('blunder')).toEqual(['blunder']);
    expect(asked('never')).toEqual([]);
  });
  it('evVisibleBefore / evVisibleAfter', () => {
    expect(EV_MODES.map((m) => [evVisibleBefore(m), evVisibleAfter(m)])).toEqual([
      [true, true],
      [false, true],
      [false, false],
    ]);
  });
  it('maps the mode onto the table until the one-tap interaction lands', () => {
    const scene = { id: 's', version: 1 as const };
    const s = (evMode: 'before' | 'after' | 'never') => ({ ...DEFAULT_SIM_SETTINGS, evMode });
    expect(resolvePractice(s('before'), scene)).toBe(false);
    expect(resolvePractice(s('after'), scene)).toBe(true);
    expect(resolvePractice(s('never'), scene)).toBe(false);
    expect(resolvePractice(s('after'), { ...scene, practice: false })).toBe(false);
    expect(resolveEvShown(s('never'), scene, true)).toBe(false);
    expect(resolveEvShown(s('after'), scene, true)).toBe(true);
    // Scenes keep their own showEV; "never" only applies to the sandbox here.
    expect(resolveEvShown(s('never'), scene, false)).toBe(true);
    expect(resolveEvShown(s('before'), { ...scene, showEV: false }, true)).toBe(false);
    expect(resolveEvShown(s('never'), { ...scene, showEV: true }, true)).toBe(true);
    expect(resolveEvShown(s('before'), scene, true, false)).toBe(false);
  });
});
