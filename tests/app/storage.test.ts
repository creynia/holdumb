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
  sanitizeSettings,
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
  it('sanitizes persistAsked to no | granted | denied (I076)', () => {
    expect(sanitizeSettings({ persistAsked: 'granted' }).persistAsked).toBe('granted');
    expect(sanitizeSettings({ persistAsked: 'denied' }).persistAsked).toBe('denied');
    expect(sanitizeSettings({ persistAsked: 'yes' }).persistAsked).toBe('no');
    expect(sanitizeSettings({}).persistAsked).toBe('no');
  });
  it('normalises confirmTiers to the effective confirmOn (D40, I088)', () => {
    expect(sanitizeSettings({ confirmOn: 'costly' }).confirmTiers).toBe('costly');
    expect(sanitizeSettings({ confirmOn: 'never', confirmTiers: 'blunder' })).toMatchObject({
      confirmOn: 'never',
      confirmTiers: 'blunder',
    });
    expect(sanitizeSettings({ confirmOn: 'never' }).confirmTiers).toBe('all');
    expect(sanitizeSettings({ confirmOn: 'all', confirmTiers: 'blunder' }).confirmTiers).toBe(
      'all',
    );
    expect(sanitizeSettings({ confirmOn: 'never', confirmTiers: 'nope' }).confirmTiers).toBe('all');
    for (const raw of [
      { confirmOn: 'costly' },
      { confirmOn: 'never', confirmTiers: 'blunder' },
      {},
    ]) {
      expect(sanitizeSettings(sanitizeSettings(raw))).toEqual(sanitizeSettings(raw));
    }
  });
  it('keeps confirmTiers through an export and import round trip (I088)', () => {
    const p = defaultPersisted();
    p.settings = { ...p.settings, confirmOn: 'never', confirmTiers: 'costly' };
    const back = decodeImport(encodeExport(p));
    expect(back!.settings.confirmTiers).toBe('costly');
    expect(back!.settings.confirmOn).toBe('never');
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
      evMode: 'before',
      confirmOn: 'never',
      handsPerHour: 500,
      anteUnitCents: 1200,
      theme: 'system',
    });
    expect(Object.keys(p.lessons)).toEqual(['ok']);
    expect(p.drill.byStreet.flop).toEqual({ answered: 2, correct: 2 });
    expect(p.drill.recentMisses).toEqual(['a']);
  });
  it('drill lens and per-lens stats round-trip; a pre-lens record gets perfect', () => {
    const p = sanitize({
      version: 1,
      drill: {
        lens: 'practical',
        byStreet: { flop: { answered: 3, correct: 2 } },
        byCategory: { 'flop-nothing': { answered: 2, correct: 1 } },
        practical: { byStreet: { flop: { answered: 5, correct: 9 }, bogus: { answered: 1 } } },
      },
    })!;
    expect(p.drill.lens).toBe('practical');
    // pre-lens category stats migrate into the perfect lens, not the basic-card one
    expect(p.drill.byCategory['flop-nothing']).toEqual({ answered: 2, correct: 1 });
    expect(p.drill.practical.byCategory).toEqual({});
    expect(p.drill.byStreet.flop).toEqual({ answered: 3, correct: 2 });
    expect(p.drill.practical.byStreet.flop).toEqual({ answered: 5, correct: 5 });
    expect(decodeImport(encodeExport(p))).toEqual(p);
    const old = sanitize({
      version: 1,
      drill: { bestStreak: 4, byStreet: { river: { answered: 2, correct: 1 } } },
    })!;
    expect(old.drill.lens).toBe('perfect');
    expect(old.drill.bestStreak).toBe(4);
    expect(old.drill.byStreet.river).toEqual({ answered: 2, correct: 1 });
    expect(old.drill.practical.byStreet.river).toEqual({ answered: 0, correct: 0 });
  });

  describe('D39 migration of the legacy EV flags', () => {
    const ev = (raw: Record<string, unknown>) => {
      const s = sanitizeSettings(raw);
      return [s.evMode, s.confirmOn];
    };
    it('practice: true -> evMode after', () => {
      expect(ev({ practice: true })).toEqual(['after', 'never']);
    });
    it('practice: false or missing -> evMode before', () => {
      expect(ev({ practice: false })).toEqual(['before', 'never']);
      expect(ev({})).toEqual(['before', 'never']);
      expect(ev({ practice: 'yes' })).toEqual(['before', 'never']);
    });
    it('every old record -> confirmOn never, whatever confirmCostlyMoves said', () => {
      expect(ev({ confirmCostlyMoves: true })).toEqual(['before', 'never']);
      expect(ev({ confirmCostlyMoves: false })).toEqual(['before', 'never']);
    });
    it('drops skipPreview and the other legacy keys', () => {
      const s = sanitizeSettings({ practice: true, confirmCostlyMoves: true, skipPreview: true });
      expect(Object.keys(s)).not.toContain('skipPreview');
      expect(Object.keys(s)).not.toContain('practice');
      expect(Object.keys(s)).not.toContain('confirmCostlyMoves');
      expect(s.evMode).toBe('after');
    });
    it('a valid evMode / confirmOn wins over the legacy keys', () => {
      expect(ev({ practice: true, evMode: 'never', confirmOn: 'costly' })).toEqual([
        'never',
        'costly',
      ]);
      expect(ev({ practice: false, evMode: 'after', confirmOn: 'all' })).toEqual(['after', 'all']);
      expect(ev({ evMode: 'before', confirmOn: 'blunder', confirmCostlyMoves: false })).toEqual([
        'before',
        'blunder',
      ]);
    });
    it('unknown strings fall back to the defaults', () => {
      expect(ev({ evMode: 'sometimes', confirmOn: 'maybe' })).toEqual(['before', 'never']);
      expect(ev({ evMode: 1, confirmOn: null })).toEqual(['before', 'never']);
    });
    it('is idempotent', () => {
      for (const raw of [
        {},
        { practice: true, confirmCostlyMoves: false, skipPreview: true },
        { evMode: 'never', confirmOn: 'all' },
        { evMode: 'junk', practice: true },
      ]) {
        const once = sanitizeSettings(raw);
        expect(sanitizeSettings(once)).toEqual(once);
      }
    });
  });
  it('migrates a pre-category drill record keeping streaks and byStreet', () => {
    const old = {
      version: 1,
      lessons: {},
      settings: {},
      drill: {
        bestStreak: 7,
        byStreet: { preflop: { answered: 4, correct: 3 }, river: { answered: 1, correct: 0 } },
        recentMisses: ['f:x'],
      },
    };
    const p = migrate(old)!;
    expect(p.drill.bestStreak).toBe(7);
    expect(p.drill.byStreet.preflop).toEqual({ answered: 4, correct: 3 });
    expect(p.drill.byStreet.river).toEqual({ answered: 1, correct: 0 });
    expect(p.drill.recentMisses).toEqual(['f:x']);
    expect(p.drill.byCategory).toEqual({});
  });
  it('sanitizes byCategory: unknown ids dropped, correct clamped, round-trips', () => {
    const p = sanitize({
      version: 1,
      drill: {
        byCategory: {
          'flop-flush-draw': { answered: 10, correct: 4 },
          'river-outs-low': { answered: 2, correct: 9 },
          'made-up': { answered: 3, correct: 1 },
          __proto__: { answered: 1, correct: 1 },
        },
      },
    })!;
    expect(p.drill.byCategory).toEqual({
      'flop-flush-draw': { answered: 10, correct: 4 },
      'river-outs-low': { answered: 2, correct: 2 },
    });
    expect(decodeImport(encodeExport(p))).toEqual(p);
    expect(sanitize(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it('closeCalls defaults on, survives a round trip, and only false turns it off', () => {
    expect(sanitize({ version: 1, drill: {} })!.drill.closeCalls).toBe(true);
    expect(sanitize({ version: 1, drill: { closeCalls: 'no' } })!.drill.closeCalls).toBe(true);
    const off = sanitize({ version: 1, drill: { closeCalls: false } })!;
    expect(off.drill.closeCalls).toBe(false);
    expect(decodeImport(encodeExport(off))!.drill.closeCalls).toBe(false);
  });
  it('sounds defaults off and only a real boolean turns it on', () => {
    expect(sanitize({ version: 1, settings: {} })!.settings.sounds).toBe(false);
    expect(sanitize({ version: 1, settings: { sounds: 'yes' } })!.settings.sounds).toBe(false);
    const on = sanitize({ version: 1, settings: { sounds: true } })!;
    expect(on.settings.sounds).toBe(true);
    expect(decodeImport(encodeExport(on))!.settings.sounds).toBe(true);
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
