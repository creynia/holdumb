import { describe, expect, it } from 'vitest';
import {
  MemoryStorage,
  STORAGE_KEY,
  decodeImport,
  defaultPersisted,
  encodeExport,
  load,
  sanitize,
  save,
} from '../../src/app/storage';
import { Store } from '../../src/app/store';

describe('storage', () => {
  it('uses the holdumb:v1 key and round-trips', () => {
    const m = new MemoryStorage();
    const d = defaultPersisted();
    d.settings.paytable = 'trips-9-7-4';
    expect(save(m, d)).toBe(true);
    expect(m.getItem(STORAGE_KEY)).toContain('trips-9-7-4');
    expect(STORAGE_KEY).toBe('holdumb:v1');
    expect(load(m).settings.paytable).toBe('trips-9-7-4');
  });
  it('never throws on junk and falls back to defaults', () => {
    const m = new MemoryStorage();
    m.setItem(STORAGE_KEY, '{not json');
    expect(load(m)).toEqual(defaultPersisted());
    expect(sanitize({ version: 2 })).toBeNull();
  });
  it('sanitizes settings (D30) and drops prototype keys', () => {
    const p = sanitize({
      version: 1,
      lessons: { __proto__: {}, ok: { quizzes: {}, scenes: {} } },
      settings: {
        paytable: 'nope',
        practice: 'yes',
        handsPerHour: 99999,
        anteUnitCents: 1234,
        theme: 'neon',
      },
      drill: {
        bestStreak: 3,
        byStreet: { flop: { answered: 2, correct: 9 } },
        recentMisses: ['a', 5],
      },
    })!;
    expect(p.settings).toMatchObject({
      paytable: 'trips-8-6-5',
      practice: false,
      confirmCostlyMoves: true,
      skipPreview: false,
      handsPerHour: 500,
      anteUnitCents: 1200,
      theme: 'system',
    });
    expect(Object.keys(p.lessons)).toEqual(['ok']);
    expect(p.drill.byStreet.flop).toEqual({ answered: 2, correct: 2 });
    expect(p.drill.recentMisses).toEqual(['a']);
  });
  it('export codes round-trip and reject other prefixes', () => {
    const d = defaultPersisted();
    expect(decodeImport(encodeExport(d))).toEqual(d);
    expect(decodeImport('crappy1:abc')).toBeNull();
    expect(decodeImport('holdumb1:!!!')).toBeNull();
  });
  it('a throwing localStorage falls back to memory without throwing', () => {
    const boom = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {},
    };
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: boom, configurable: true });
    try {
      const s = new Store();
      expect(s.persistent).toBe(false);
      s.completeLesson('a');
      s.flush();
      expect(s.status('a')).toBe('done');
    } finally {
      if (real) Object.defineProperty(globalThis, 'localStorage', real);
    }
  });
});
