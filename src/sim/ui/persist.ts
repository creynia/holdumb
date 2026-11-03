// Sandbox snapshot: JSON-safe, opaque to the app. The app keeps it in PersistedV1.sandbox
// (decisions: not a separate storage key). Anything that does not validate is dropped.
import { HISTORY_LIMIT, HISTORY_RECORD_BYTES, PAYTABLE_PRESET_IDS, parseCards } from '../engine';
import type { Cents, GameState, HandRecord, TripsPaytableId } from '../engine';
import { frac } from '../math/fraction';
import type { Fraction } from '../math';
import { EMPTY_TOTALS, MAX_MISTAKE_SPOTS } from '../scene';
import type { SessionTotals, SimDriver } from '../scene';
import type { LoggedHand } from './moveLog';
import { spotCode, spotFromCode } from '../strategy';
import { EV_MODES, evModeOfPractice } from './settings';
import type { EvMode } from './types';

/** An exact Fraction as JSON (bigint does not stringify). */
export interface FractionJson {
  num: string;
  den: string;
}
/** SessionTotals with every Fraction as FractionJson. */
export type SessionTotalsJson = {
  [K in keyof SessionTotals]: SessionTotals[K] extends Fraction ? FractionJson : number;
};

export interface SandboxSnapshot {
  v: 1;
  state: GameState;
  startEquity: Cents;
  totals: SessionTotalsJson;
  /** Drill spot codes of table mistakes, newest first (I056). Older snapshots lack it. */
  mistakeSpots?: string[];
  /** The table's EV visibility (D39). Older snapshots carry a boolean `practice` instead. */
  evMode: EvMode;
  /** The move log (I081), newest hand first; read back with decodeMoveLog. Optional. */
  log?: LoggedHand[];
  /** The hand history (I055), newest first. Its own version: an unknown one restores as none. */
  history: { v: 1; items: HandRecord[] };
}

const HISTORY_VERSION = 1;

const isFraction = (v: unknown): v is Fraction =>
  typeof v === 'object' && v !== null && typeof (v as Fraction).num === 'bigint';

export function encodeTotals(t: SessionTotals): SessionTotalsJson {
  const out: Record<string, number | FractionJson> = {};
  for (const [k, v] of Object.entries(t)) {
    out[k] = isFraction(v) ? { num: v.num.toString(), den: v.den.toString() } : (v as number);
  }
  return out as SessionTotalsJson;
}

/** `evMode` defaults to the driver's table mode. */
export function encodeSnapshot(
  d: SimDriver,
  evMode?: EvMode,
  log?: readonly LoggedHand[],
): SandboxSnapshot {
  const s = d.snapshotData();
  return {
    v: 1,
    state: s.state,
    startEquity: s.startEquity,
    totals: encodeTotals(s.totals),
    mistakeSpots: s.mistakeSpots,
    evMode: evMode ?? s.evMode,
    history: { v: HISTORY_VERSION, items: s.history.slice(0, HISTORY_LIMIT) },
    ...(log && log.length ? { log: log.slice() } : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const cents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

const CHOICES = new Set(['4x', '3x', '2x', '1x', 'check', 'fold']);
const TIERS = new Set(['b', 'c', 's', 'm', 'x']);
const cardsOf = (v: unknown, n: number): boolean => {
  if (typeof v !== 'string' || v.length !== 2 * n) return false;
  try {
    return parseCards(v).length === n;
  } catch {
    return false;
  }
};
/** A well-formed HandRecord (engine/log.ts); anything else is dropped from the history. */
export function isHandRecord(v: unknown): v is HandRecord {
  if (!isObj(v)) return false;
  if (!(typeof v.n === 'number' && Number.isInteger(v.n) && v.n >= 1)) return false;
  const { p, d, b } = v;
  if (!cardsOf(p, 2) || !cardsOf(d, 2) || !cardsOf(b, 5)) return false;
  try {
    parseCards(`${p as string}${d as string}${b as string}`); // disjoint
  } catch {
    return false;
  }
  if (!Array.isArray(v.w) || v.w.length !== 2 || !cents(v.w[0]) || !cents(v.w[1])) return false;
  if (!(typeof v.net === 'number' && Number.isInteger(v.net))) return false;
  if (!Array.isArray(v.a) || v.a.length > 3) return false;
  for (const dec of v.a as unknown[]) {
    if (!Array.isArray(dec) || (dec.length !== 2 && dec.length !== 4)) return false;
    if (!['p', 'f', 'r'].includes(dec[0] as string) || !CHOICES.has(dec[1] as string)) return false;
    if (dec.length === 4) {
      if (!TIERS.has(dec[2] as string)) return false;
      // An exact ratio: at most 15 digits each side, and a denominator of at least 1.
      if (typeof dec[3] !== 'string' || !/^-?\d{1,15}(\/[1-9]\d{0,14})?$/.test(dec[3]))
        return false;
    }
  }
  return true;
}

/**
 * The saved history, or none when the block is missing, malformed or of another version. Rows that
 * do not validate, repeat a hand number or exceed HISTORY_RECORD_BYTES are dropped.
 */
export function decodeHistory(raw: unknown): HandRecord[] {
  if (!isObj(raw) || raw.v !== HISTORY_VERSION || !Array.isArray(raw.items)) return [];
  const seen = new Set<number>();
  const out: HandRecord[] = [];
  for (const item of raw.items as unknown[]) {
    if (!isHandRecord(item) || seen.has(item.n)) continue;
    if (new TextEncoder().encode(JSON.stringify(item)).length > HISTORY_RECORD_BYTES) continue;
    seen.add(item.n);
    out.push(item);
    if (out.length === HISTORY_LIMIT) break;
  }
  return out;
}

/**
 * A saved Fraction, or a legacy float of cents (snapshots before the exact ledger) rounded to the
 * cent. Anything else is null, and the field keeps its empty value.
 */
function decodeFraction(x: unknown): Fraction | null {
  if (isObj(x) && typeof x.num === 'string' && typeof x.den === 'string') {
    if (!/^-?\d+$/.test(x.num) || !/^[1-9]\d*$/.test(x.den)) return null;
    return frac(BigInt(x.num), BigInt(x.den));
  }
  if (typeof x === 'number' && Number.isFinite(x)) return frac(Math.round(x));
  return null;
}

/** Missing or malformed fields keep their empty value (0), so a row that needs them stays hidden. */
export function decodeTotals(raw: Record<string, unknown>): SessionTotals {
  const totals: Record<string, number | Fraction> = { ...EMPTY_TOTALS };
  for (const k of Object.keys(EMPTY_TOTALS) as (keyof SessionTotals)[]) {
    const x = raw[k];
    if (isFraction(EMPTY_TOTALS[k])) {
      const f = decodeFraction(x);
      if (f) totals[k] = f;
    } else if (typeof x === 'number' && Number.isFinite(x)) totals[k] = x;
  }
  return totals as unknown as SessionTotals;
}

/**
 * Saved mistake spot codes: each must parse as a real spot (cards, street and board agree); the
 * canonical code is kept, repeats dropped, at most MAX_MISTAKE_SPOTS.
 */
function decodeSpots(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const c of raw) {
    if (typeof c !== 'string') continue;
    try {
      const code = spotCode(spotFromCode(c));
      if (!out.includes(code)) out.push(code);
    } catch {
      // not a spot: dropped
    }
  }
  return out.slice(0, MAX_MISTAKE_SPOTS);
}

/** Restores the saved table as it was. The paytable follows the current setting. */
export function decodeSnapshot(
  raw: unknown,
  paytable: TripsPaytableId,
): {
  restore: {
    state: GameState;
    startEquity: Cents;
    totals: SessionTotals;
    history: HandRecord[];
    mistakeSpots: string[];
  };
  evMode: EvMode;
} | null {
  try {
    if (!isObj(raw) || raw.v !== 1 || !isObj(raw.state) || !isObj(raw.totals)) return null;
    const st = raw.state as unknown as GameState;
    if (st.version !== 1 || !isObj(st.rules) || !isObj(st.bets) || !isObj(st.stats)) return null;
    if (!(PAYTABLE_PRESET_IDS as readonly string[]).includes(st.rules.tripsPaytable)) return null;
    if (!cents(st.bankroll) || !cents(raw.startEquity)) return null;
    for (const w of ['ante', 'blind', 'play', 'trips'] as const)
      if (!cents(st.bets[w])) return null;
    if (!Array.isArray(st.rng?.s) || st.rng.s.length !== 4) return null;
    if (!['betting', 'preflop', 'flop', 'river', 'settled'].includes(st.street)) return null;
    // Mid-hand snapshots restore exactly (reloading is not an escape from a bad river).
    const state: GameState = { ...st, rules: { ...st.rules, tripsPaytable: paytable } };
    if (state.street === 'preflop' || state.street === 'flop' || state.street === 'river') {
      const d = state.hand?.deal;
      const ok =
        !!d &&
        Array.isArray(d.player) &&
        d.player.length === 2 &&
        Array.isArray(d.dealer) &&
        d.dealer.length === 2 &&
        Array.isArray(d.board) &&
        d.board.length === 5 &&
        [...d.player, ...d.dealer, ...d.board].every(
          (c) => Number.isInteger(c) && c >= 0 && c < 52,
        );
      if (!ok) return null;
    }
    return {
      restore: {
        state,
        startEquity: raw.startEquity,
        totals: decodeTotals(raw.totals),
        history: decodeHistory(raw.history),
        mistakeSpots: decodeSpots(raw.mistakeSpots),
      },
      // A valid evMode wins; a legacy snapshot's `practice: true` maps to 'after' (D39).
      evMode: (EV_MODES as readonly unknown[]).includes(raw.evMode)
        ? (raw.evMode as EvMode)
        : evModeOfPractice(raw.practice === true),
    };
  } catch {
    return null;
  }
}
