import { describe, expect, it, vi } from 'vitest';
import {
  MemoryStorage,
  STORAGE_KEY,
  decodeImport,
  defaultPersisted,
  encodeExport,
  load,
  migrate,
  sanitize,
  save,
} from '../../src/app/storage';
import { Store } from '../../src/app/store';

const backups = (m: MemoryStorage) => m.keys().filter((k) => k.startsWith('holdumb:v1:backup-'));

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

  it('backs up corrupt JSON before loading defaults', () => {
    const m = new MemoryStorage();
    m.setItem(STORAGE_KEY, '{oops');
    const s = new Store(m);
    expect(s.snapshot).toEqual(defaultPersisted());
    expect(s.persistent).toBe(true);
    expect(backups(m).map((k) => m.getItem(k))).toEqual(['{oops']);
  });
  it('a newer version is backed up, never overwritten, and shows the banner', () => {
    const m = new MemoryStorage();
    const newer = JSON.stringify({ version: 2, lessons: { x: 1 } });
    m.setItem(STORAGE_KEY, newer);
    const s = new Store(m);
    expect(s.persistent).toBe(false);
    s.completeLesson('a');
    s.flush();
    expect(m.getItem(STORAGE_KEY)).toBe(newer);
    expect(backups(m).map((k) => m.getItem(k))).toEqual([newer]);
  });
  it('an unknown older version is backed up but stays writable', () => {
    const m = new MemoryStorage();
    m.setItem(STORAGE_KEY, JSON.stringify({ version: 0 }));
    const s = new Store(m);
    expect(s.persistent).toBe(true);
    expect(backups(m)).toHaveLength(1);
  });
  it('migrate: v1 is the identity, others are refused', () => {
    const d = defaultPersisted();
    expect(migrate(d)).toEqual(d);
    expect(migrate({ version: 7 })).toBeNull();
    expect(migrate('x')).toBeNull();
  });
  it('a refused save (quota) flips persistent and notifies; a later save recovers', () => {
    const m = new MemoryStorage();
    const s = new Store(m);
    const fn = vi.fn();
    s.subscribe(fn);
    let full = true;
    const set = m.setItem.bind(m);
    m.setItem = (k, v) => {
      if (full) throw new Error('QuotaExceededError');
      set(k, v);
    };
    s.completeLesson('a');
    fn.mockClear();
    s.flush();
    expect(s.persistent).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    full = false;
    s.flush();
    expect(s.persistent).toBe(true);
  });
});
