// Persistence: one localStorage key with an in-memory fallback (private windows, file:// quirks).
import { PAYTABLE_PRESET_IDS } from '../sim/engine';
import { CONFIRM_ON, EV_MODES, evModeOfPractice } from '../sim/ui/settings';
import { DRILL_CATEGORY_IDS } from '../sim/strategy';
import type { DrillCategoryId } from '../sim/strategy';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './settings';

export { DEFAULT_SETTINGS };
export type { Settings };

export const STORAGE_KEY = 'holdumb:v1';
export const EXPORT_PREFIX = 'holdumb1:';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  keys(): string[] {
    return [...this.m.keys()];
  }
}

export interface StorageHandle {
  storage: StorageLike;
  /** false when localStorage is unavailable: progress lives in memory only (show a banner). */
  persistent: boolean;
}

/** localStorage when it really works, else memory. Never throws. */
export function createStorage(): StorageHandle {
  try {
    const ls = globalThis.localStorage;
    const probe = '__holdumb_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { storage: ls, persistent: true };
  } catch {
    return { storage: new MemoryStorage(), persistent: false };
  }
}

export interface LessonProgress {
  startedAt?: number;
  completedAt?: number;
  /** `firstTry`: the first attempt was correct (retries never count toward the exam badge) */
  quizzes: Record<string, { correct: boolean; attempts: number; firstTry?: boolean }>;
  scenes: Record<string, { completed: boolean; step: number }>;
}

export type DrillStreet = 'preflop' | 'flop' | 'river';
export const DRILL_STREETS: readonly DrillStreet[] = ['preflop', 'flop', 'river'];
export const MAX_RECENT_MISSES = 50;

export type DrillLens = 'perfect' | 'practical';
type StreetCounts = Record<DrillStreet, { answered: number; correct: number }>;

/** Everything graded under one lens. */
export interface LensStats {
  bestStreak: number;
  byStreet: StreetCounts;
  /** per spot category (I016); absent key = never answered. Records written before I016 lack it. */
  byCategory: Partial<Record<DrillCategoryId, { answered: number; correct: number }>>;
  /** spot codes (strategy/drill.ts), newest first */
  recentMisses: string[];
}

/**
 * The top-level fields are the perfect-play lens (the only one before I017, so old records migrate
 * into it unchanged); `practical` holds the basic-card lens. Switching lenses never mixes them.
 */
export interface DrillStats extends LensStats {
  lens: DrillLens;
  practical: LensStats;
  /** "Close calls" (I068): about 60% of spots are close, streets weighted by real play. Default on. */
  closeCalls: boolean;
}

/** Stats of the lens currently selected. */
export const lensStats = (d: DrillStats): LensStats => (d.lens === 'practical' ? d.practical : d);

export interface PersistedV1 {
  version: 1;
  lessons: Record<string, LessonProgress>;
  settings: Settings;
  drill: DrillStats;
  /** opaque snapshot owned by sim/ui (engine state JSON, money in cents) */
  sandbox?: unknown;
}

const emptyStreets = (): StreetCounts => ({
  preflop: { answered: 0, correct: 0 },
  flop: { answered: 0, correct: 0 },
  river: { answered: 0, correct: 0 },
});

const emptyLens = (): LensStats => ({
  bestStreak: 0,
  byStreet: emptyStreets(),
  byCategory: {},
  recentMisses: [],
});

export function emptyDrill(): DrillStats {
  return { ...emptyLens(), lens: 'perfect', practical: emptyLens(), closeCalls: true };
}

export function defaultPersisted(): PersistedV1 {
  return { version: 1, lessons: {}, settings: { ...DEFAULT_SETTINGS }, drill: emptyDrill() };
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const safeEntries = (o: Record<string, unknown>) =>
  Object.entries(o).filter(([k]) => !UNSAFE_KEYS.has(k));

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) ? x : undefined;
const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
const oneOf = <T extends string>(x: unknown, opts: readonly T[], d: T): T =>
  typeof x === 'string' && (opts as readonly string[]).includes(x) ? (x as T) : d;
const clampInt = (x: unknown, lo: number, hi: number, d: number) => {
  const n = num(x);
  return n === undefined || n < lo ? d : Math.min(Math.round(n), hi);
};

/** Cents rounded to whole dollars and clamped to [lo, hi] dollars; `d` (cents) when unusable. */
const wholeDollars = (x: unknown, lo: number, hi: number, d: number) => {
  const n = num(x);
  return n === undefined ? d : Math.min(Math.max(Math.round(n / 100), lo), hi) * 100;
};

/** Bounds shared by sanitizing and the Settings inputs (dollars, except handsPerHour). */
export const LIMITS = {
  anteUnitDollars: { min: 1, max: 500 },
  bankrollDollars: { min: 1, max: 1_000_000 },
  handsPerHour: { min: 1, max: 500 },
} as const;

const CONFIRM_TIERS = ['all', 'costly', 'blunder'] as const;

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const o = isObj(raw) ? raw : {};
  const confirmOn = oneOf(o.confirmOn, CONFIRM_ON, d.confirmOn);
  // D40: while Confirm is on, its scope is the effective policy (confirmTiers === confirmOn).
  const confirmTiers =
    confirmOn !== 'never' ? confirmOn : oneOf(o.confirmTiers, CONFIRM_TIERS, d.confirmTiers);
  return {
    theme: oneOf(o.theme, ['system', 'light', 'dark'], d.theme),
    animationSpeed: oneOf(o.animationSpeed, ['normal', 'fast', 'instant'], d.animationSpeed),
    reduceMotion: bool(o.reduceMotion, d.reduceMotion),
    fourColorDeck: bool(o.fourColorDeck, d.fourColorDeck),
    paytable: oneOf(o.paytable, PAYTABLE_PRESET_IDS, d.paytable),
    // D39 migration: a valid evMode wins; else the legacy practice flag (true -> 'after').
    evMode: oneOf(o.evMode, EV_MODES, o.practice === true ? evModeOfPractice(true) : d.evMode),
    // Old records can't tell an explicit confirmCostlyMoves from its old default: all -> 'never'.
    // The legacy skipPreview flag is dropped.
    confirmOn,
    confirmTiers,
    anteUnitCents: wholeDollars(
      o.anteUnitCents,
      LIMITS.anteUnitDollars.min,
      LIMITS.anteUnitDollars.max,
      d.anteUnitCents,
    ),
    handsPerHour: clampInt(
      o.handsPerHour,
      LIMITS.handsPerHour.min,
      LIMITS.handsPerHour.max,
      d.handsPerHour,
    ),
    defaultBankrollCents: wholeDollars(
      o.defaultBankrollCents,
      1,
      1_000_000,
      d.defaultBankrollCents,
    ),
    persistAsked: oneOf(o.persistAsked, ['no', 'granted', 'denied'], d.persistAsked),
  };
}

function sanitizeStreets(raw: unknown): StreetCounts {
  const out = emptyStreets();
  if (!isObj(raw)) return out;
  for (const s of DRILL_STREETS) {
    const v = raw[s];
    if (!isObj(v)) continue;
    const answered = clampInt(v.answered, 0, 10_000_000, 0);
    out[s] = { answered, correct: Math.min(clampInt(v.correct, 0, 10_000_000, 0), answered) };
  }
  return out;
}

function sanitizeLens(raw: unknown): LensStats {
  const d = emptyLens();
  if (!isObj(raw)) return d;
  d.bestStreak = clampInt(raw.bestStreak, 0, 1_000_000, 0);
  d.byStreet = sanitizeStreets(raw.byStreet);
  if (isObj(raw.byCategory))
    for (const id of DRILL_CATEGORY_IDS) {
      const v = raw.byCategory[id];
      if (!isObj(v)) continue;
      const answered = clampInt(v.answered, 0, 10_000_000, 0);
      if (answered === 0) continue;
      d.byCategory[id] = {
        answered,
        correct: Math.min(clampInt(v.correct, 0, 10_000_000, 0), answered),
      };
    }
  if (Array.isArray(raw.recentMisses))
    d.recentMisses = raw.recentMisses
      .filter((x): x is string => typeof x === 'string' && x.length <= 64)
      .slice(0, MAX_RECENT_MISSES);
  return d;
}

function sanitizeDrill(raw: unknown): DrillStats {
  if (!isObj(raw)) return emptyDrill();
  return {
    ...sanitizeLens(raw),
    lens: raw.lens === 'practical' ? 'practical' : 'perfect',
    practical: sanitizeLens(raw.practical),
    closeCalls: raw.closeCalls !== false,
  };
}

/** Validates arbitrary parsed JSON into PersistedV1; malformed parts fall back to defaults. */
export function sanitize(raw: unknown): PersistedV1 | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  return sanitizeV1(raw);
}

/** Upgrades any known stored version to the current shape. v1 is the identity (then sanitized). */
export function migrate(raw: unknown): PersistedV1 | null {
  if (!isObj(raw)) return null;
  switch (raw.version) {
    case 1:
      return sanitizeV1(raw);
    default:
      return null;
  }
}

function sanitizeV1(raw: Record<string, unknown>): PersistedV1 {
  const lessons: Record<string, LessonProgress> = {};
  if (isObj(raw.lessons)) {
    for (const [id, v] of safeEntries(raw.lessons)) {
      if (!isObj(v)) continue;
      const p: LessonProgress = { quizzes: {}, scenes: {} };
      const s = num(v.startedAt);
      const c = num(v.completedAt);
      if (s !== undefined) p.startedAt = s;
      if (c !== undefined) p.completedAt = c;
      if (isObj(v.quizzes))
        for (const [qid, q] of safeEntries(v.quizzes))
          if (isObj(q))
            p.quizzes[qid] = {
              correct: q.correct === true,
              attempts: Math.max(0, Math.floor(num(q.attempts) ?? 0)),
              ...(typeof q.firstTry === 'boolean' ? { firstTry: q.firstTry } : {}),
            };
      if (isObj(v.scenes))
        for (const [sid, sc] of safeEntries(v.scenes))
          if (isObj(sc))
            p.scenes[sid] = {
              completed: sc.completed === true,
              step: Math.max(0, Math.floor(num(sc.step) ?? 0)),
            };
      lessons[id] = p;
    }
  }
  return {
    version: 1,
    lessons,
    settings: sanitizeSettings(raw.settings),
    drill: sanitizeDrill(raw.drill),
    ...(raw.sandbox !== undefined ? { sandbox: raw.sandbox } : {}),
  };
}

export interface LoadResult {
  data: PersistedV1;
  /** true when the stored data came from a newer app: never overwrite it */
  readOnly: boolean;
}

function backUp(storage: StorageLike, text: string, now: number) {
  try {
    storage.setItem(`${STORAGE_KEY}:backup-${now}`, text);
  } catch {
    /* best effort */
  }
}

/**
 * Never throws. Unreadable or unknown-version data is copied to `holdumb:v1:backup-<ts>` before
 * defaults are used; data from a newer version (version > 1) is also left untouched (readOnly).
 */
export function loadDetailed(storage: StorageLike, now = Date.now()): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: defaultPersisted(), readOnly: false };
  }
  if (!text) return { data: defaultPersisted(), readOnly: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    backUp(storage, text, now);
    return { data: defaultPersisted(), readOnly: false };
  }
  const data = migrate(parsed);
  if (data) return { data, readOnly: false };
  backUp(storage, text, now);
  const newer = isObj(parsed) && typeof parsed.version === 'number' && parsed.version > 1;
  return { data: defaultPersisted(), readOnly: newer };
}

export function load(storage: StorageLike): PersistedV1 {
  return loadDetailed(storage).data;
}

export function save(storage: StorageLike, data: PersistedV1): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// ---- export / import: a base64 code of the JSON (copy-pasteable) ----

export function encodeExport(data: PersistedV1): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return EXPORT_PREFIX + btoa(bin);
}

export function decodeImport(code: string): PersistedV1 | null {
  try {
    const t = code.trim();
    if (!t.startsWith(EXPORT_PREFIX)) return null;
    const bin = atob(t.slice(EXPORT_PREFIX.length));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
