// Sandbox snapshot: JSON-safe, opaque to the app. The app keeps it in PersistedV1.sandbox
// (decisions: not a separate storage key). Anything that does not validate is dropped.
import { HISTORY_LIMIT, PAYTABLE_PRESET_IDS, parseCards } from '../engine';
import type { Cents, GameState, HandRecord, TripsPaytableId } from '../engine';
import { EMPTY_TOTALS } from '../scene';
import type { SessionTotals, SimDriver } from '../scene';
import { EV_MODES, evModeOfPractice } from './settings';
import type { EvMode } from './types';

export interface SandboxSnapshot {
  v: 1;
  state: GameState;
  startEquity: Cents;
  totals: SessionTotals;
  /** The table's EV visibility (D39). Older snapshots carry a boolean `practice` instead. */
  evMode: EvMode;
  /** The last hands, newest first. Its own version: an unknown one restores as no history. */
  history: { v: 1; items: HandRecord[] };
}

const HISTORY_VERSION = 1;

/** `evMode` defaults to the driver's practice flag ('after' when on, else 'before'). */
export function encodeSnapshot(d: SimDriver, evMode?: EvMode): SandboxSnapshot {
  const s = d.snapshotData();
  return {
    v: 1,
    state: s.state,
    startEquity: s.startEquity,
    totals: s.totals,
    evMode: evMode ?? evModeOfPractice(s.practice),
    history: { v: HISTORY_VERSION, items: s.history.slice(0, HISTORY_LIMIT) },
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
    parseCards(`${p}${d}${b}`); // disjoint
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
      if (typeof dec[3] !== 'string' || !/^-?\d+(\/\d+)?$/.test(dec[3])) return false;
    }
  }
  return true;
}

/** The saved history, or none when the block is missing, malformed or of another version. */
export function decodeHistory(raw: unknown): HandRecord[] {
  if (!isObj(raw) || raw.v !== HISTORY_VERSION || !Array.isArray(raw.items)) return [];
  return (raw.items as unknown[]).filter(isHandRecord).slice(0, HISTORY_LIMIT);
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
    const totals: SessionTotals = { ...EMPTY_TOTALS };
    for (const k of Object.keys(EMPTY_TOTALS) as (keyof SessionTotals)[]) {
      const x = raw.totals[k];
      if (typeof x === 'number' && Number.isFinite(x)) totals[k] = x;
    }
    return {
      restore: { state, startEquity: raw.startEquity, totals, history: decodeHistory(raw.history) },
      // A valid evMode wins; a legacy snapshot's `practice: true` maps to 'after' (D39).
      evMode: (EV_MODES as readonly unknown[]).includes(raw.evMode)
        ? (raw.evMode as EvMode)
        : evModeOfPractice(raw.practice === true),
    };
  } catch {
    return null;
  }
}
