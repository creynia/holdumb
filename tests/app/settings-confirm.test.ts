import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  confirmEnabled,
  withConfirmEnabled,
  withConfirmTiers,
} from '../../src/app/settings';
import type { Settings } from '../../src/app/settings';

const s = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('confirm helpers (D40, I088)', () => {
  it('confirmEnabled is the box: any policy but never', () => {
    expect(confirmEnabled(s({ confirmOn: 'never' }))).toBe(false);
    expect(confirmEnabled(s({ confirmOn: 'costly' }))).toBe(true);
  });
  it('ticking turns on the stored scope; unticking keeps it', () => {
    expect(withConfirmEnabled(s({ confirmOn: 'never', confirmTiers: 'costly' }), true)).toEqual({
      confirmOn: 'costly',
    });
    expect(withConfirmEnabled(s({ confirmOn: 'blunder', confirmTiers: 'blunder' }), false)).toEqual(
      {
        confirmOn: 'never',
      },
    );
  });
  it('a scope pick is stored and applied only while the box is ticked', () => {
    expect(withConfirmTiers(s({ confirmOn: 'never' }), 'blunder')).toEqual({
      confirmTiers: 'blunder',
      confirmOn: 'never',
    });
    expect(withConfirmTiers(s({ confirmOn: 'all' }), 'costly')).toEqual({
      confirmTiers: 'costly',
      confirmOn: 'costly',
    });
  });
});
