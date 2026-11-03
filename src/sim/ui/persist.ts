// Sandbox snapshot: JSON-safe, opaque to the app. The app keeps it in PersistedV1.sandbox
// (decisions: not a separate storage key). Anything that does not validate is dropped.
import { PAYTABLE_PRESET_IDS } from '../engine';
import type { Cents, GameState, TripsPaytableId } from '../engine';
import { frac } from '../math/fraction';
import type { Fraction } from '../math';
import { EMPTY_TOTALS } from '../scene';
import type { SessionTotals, SimDriver } from '../scene';
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
  /** The table's EV visibility (D39). Older snapshots carry a boolean `practice` instead. */
  evMode: EvMode;
}

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
export function encodeSnapshot(d: SimDriver, evMode?: EvMode): SandboxSnapshot {
  const s = d.snapshotData();
  return {
    v: 1,
    state: s.state,
    startEquity: s.startEquity,
    totals: encodeTotals(s.totals),
    evMode: evMode ?? s.evMode,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const cents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

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

/** Restores the saved table as it was. The paytable follows the current setting. */
export function decodeSnapshot(
  raw: unknown,
  paytable: TripsPaytableId,
): {
  restore: { state: GameState; startEquity: Cents; totals: SessionTotals };
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
      restore: { state, startEquity: raw.startEquity, totals: decodeTotals(raw.totals) },
      // A valid evMode wins; a legacy snapshot's `practice: true` maps to 'after' (D39).
      evMode: (EV_MODES as readonly unknown[]).includes(raw.evMode)
        ? (raw.evMode as EvMode)
        : evModeOfPractice(raw.practice === true),
    };
  } catch {
    return null;
  }
}
