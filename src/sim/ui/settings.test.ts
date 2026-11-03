import { describe, expect, it } from 'vitest';
import type { DecisionTier } from '../math';
import {
  CONFIRM_ON,
  EV_MODES,
  evVisibleAfter,
  evVisibleBefore,
  needsConfirm,
  resolveConfirm,
  resolveEvMode,
  resolveEvShown,
} from './settings';
import { DEFAULT_SIM_SETTINGS } from './types';

const step = (o: object) => ({
  id: 'a',
  text: '',
  completeWhen: { acknowledged: true as const },
  ...o,
});
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
  it('the sandbox follows the user, a lesson follows its scene (D39)', () => {
    const scene = { id: 's', version: 1 as const };
    const s = (evMode: 'before' | 'after' | 'never') => ({ ...DEFAULT_SIM_SETTINGS, evMode });
    expect(resolveEvMode(s('after'), { ...scene, practice: false }, 'sandbox')).toBe('after');
    expect(resolveEvMode(s('after'), scene, 'scene')).toBe('before');
    expect(resolveEvMode(s('before'), { ...scene, practice: true }, 'scene')).toBe('after');
    expect(resolveEvShown(s('never'), scene, true)).toBe(false);
    expect(resolveEvShown(s('after'), scene, true)).toBe(true);
    // Scenes keep their own showEV; "never" only applies to the sandbox here.
    expect(resolveEvShown(s('never'), scene, false)).toBe(true);
    expect(resolveEvShown(s('before'), { ...scene, showEV: false }, true)).toBe(false);
    expect(resolveEvShown(s('never'), { ...scene, showEV: true }, true)).toBe(true);
    expect(resolveEvShown(s('before'), scene, true, step({ showEV: false }))).toBe(false);
    // Lessons follow the scene's evMode keys, step first.
    expect(resolveEvShown(s('before'), { ...scene, evMode: 'never' }, false)).toBe(false);
    expect(resolveEvShown(s('never'), { ...scene, evMode: 'after' }, false)).toBe(true);
    expect(resolveEvShown(s('before'), scene, false, step({ evMode: 'never' }))).toBe(false);
    expect(resolveEvShown(s('before'), { ...scene, showEV: false }, false, step({}))).toBe(false);
  });
  describe('resolveEvMode / resolveConfirm (D39)', () => {
    const users = EV_MODES.flatMap((evMode) =>
      CONFIRM_ON.map((confirmOn) => ({ ...DEFAULT_SIM_SETTINGS, evMode, confirmOn })),
    );
    const scene = { id: 's', version: 1 as const };
    const st = { id: 'a', text: '', completeWhen: { acknowledged: true as const } };
    it('a lesson with no scene keys is (before, never) for all 12 user settings', () => {
      expect(users).toHaveLength(12);
      for (const u of users) {
        expect(resolveEvMode(u, scene, 'scene')).toBe('before');
        expect(resolveEvMode(u, scene, 'scene', st)).toBe('before');
        expect(resolveConfirm(u, scene, st, 'scene')).toBe('never');
        expect(resolveConfirm(u, scene, null, 'scene')).toBe('never');
      }
    });
    it('lesson aliases: practice: true -> after, showEV: false -> never', () => {
      for (const u of users) {
        expect(resolveEvMode(u, { ...scene, practice: true }, 'scene')).toBe('after');
        expect(resolveEvMode(u, { ...scene, showEV: false }, 'scene')).toBe('never');
        expect(resolveEvMode(u, { ...scene, showEV: true }, 'scene')).toBe('before');
        expect(resolveEvMode(u, scene, 'scene', { ...st, showEV: false })).toBe('never');
        expect(
          resolveEvMode(u, { ...scene, showEV: false }, 'scene', { ...st, showEV: true }),
        ).toBe('before');
      }
    });
    it('a step override wins over the scene', () => {
      const sc = { ...scene, evMode: 'after' as const, confirmOn: 'costly' as const };
      for (const u of users) {
        expect(resolveEvMode(u, sc, 'scene')).toBe('after');
        expect(resolveEvMode(u, sc, 'scene', { ...st, evMode: 'never' })).toBe('never');
        expect(resolveConfirm(u, sc, st, 'scene')).toBe('costly');
        expect(resolveConfirm(u, sc, { ...st, confirmOn: 'all' }, 'scene')).toBe('all');
      }
    });
    it('the sandbox uses the user setting', () => {
      for (const u of users) {
        expect(resolveEvMode(u, { ...scene, practice: true }, 'sandbox')).toBe(u.evMode);
        expect(resolveConfirm(u, { ...scene, confirmOn: 'all' }, null, 'sandbox')).toBe(
          u.confirmOn,
        );
      }
    });
  });
});
