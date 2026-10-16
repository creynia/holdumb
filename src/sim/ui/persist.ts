// Sandbox snapshot: JSON-safe, opaque to the app. The app keeps it in PersistedV1.sandbox
// (decisions: not a separate storage key). Anything that does not validate is dropped.
import { PAYTABLE_PRESET_IDS } from '../engine';
import type { Cents, GameState, TripsPaytableId } from '../engine';
import { EMPTY_TOTALS } from '../scene';
import type { SessionTotals, SimDriver } from '../scene';

export interface SandboxSnapshot {
  v: 1;
  state: GameState;
  startEquity: Cents;
  totals: SessionTotals;
  practice: boolean;
}

export function encodeSnapshot(d: SimDriver): SandboxSnapshot {
  const s = d.snapshotData();
  return {
    v: 1,
    state: s.state,
    startEquity: s.startEquity,
    totals: s.totals,
    practice: s.practice,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const cents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Restores the saved table as it was. The paytable follows the current setting. */
export function decodeSnapshot(
  raw: unknown,
  paytable: TripsPaytableId,
): {
  restore: { state: GameState; startEquity: Cents; totals: SessionTotals };
  practice: boolean;
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
      restore: { state, startEquity: raw.startEquity, totals },
      practice: raw.practice === true,
    };
  } catch {
    return null;
  }
}
