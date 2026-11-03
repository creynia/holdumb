// I062 Six Card Bonus at the table (decisions.md D5a). The bet is a sandbox setting held by the
// driver, outside the engine's wager registry (engine types are frozen). It settles at the deal,
// because the bonus cards do not depend on play, so no money is ever pending mid-hand: the profit
// goes straight into the bankroll and the session ledger gets the wager, the result and the exact
// expectation (−edge × wager), so "Perfect play expects" and luck stay exact.
import { SIX_CARD_MAX, SIX_CARD_MIN, settleSixCard } from '../engine/sixcard';
import type { SixCardPaytableId, SixCardResult } from '../engine/sixcard';
import type { Cents, GameState } from '../engine/types';
import { sixCardEdge } from '../math/edges';
import { add, neg, scale } from '../math/fraction';
import type { SessionTotals } from './driver';

export interface SixCardSetting {
  bet: Cents;
  paytable: SixCardPaytableId;
}

export type SixCardOutcome =
  { kind: 'settled'; result: SixCardResult } | { kind: 'skipped'; bet: Cents; reason: string };

/** A valid Six Card bet: whole dollars from $1 to $25. */
export function validSixCardBet(bet: Cents): boolean {
  return Number.isInteger(bet) && bet % 100 === 0 && bet >= SIX_CARD_MIN && bet <= SIX_CARD_MAX;
}

/**
 * Settles the Six Card bet on a hand that was just dealt. It is only taken when, after it, the
 * rack still covers a 4x Play bet, so the side bet can never block the main game's best move.
 */
export function applySixCard(
  state: GameState,
  setting: SixCardSetting | null,
): { state: GameState; outcome: SixCardOutcome | null } {
  const hand = state.hand;
  if (!setting || !hand || state.street !== 'preflop') return { state, outcome: null };
  const { bet, paytable } = setting;
  if (state.bankroll - bet < 4 * state.bets.ante)
    return {
      state,
      outcome: { kind: 'skipped', bet, reason: 'Six Card skipped: keep enough for a 4x bet.' },
    };
  const result = settleSixCard(hand.deal, state.seed, hand.n, bet, paytable);
  return {
    state: { ...state, bankroll: state.bankroll + result.profit },
    outcome: { kind: 'settled', result },
  };
}

/** The session ledger with one settled Six Card bet added. */
export function addSixCard(t: SessionTotals, o: SixCardOutcome | null): SessionTotals {
  if (o?.kind !== 'settled') return t;
  const r = o.result;
  return {
    ...t,
    sixCardCents: t.sixCardCents + r.profit,
    sixCardWageredCents: t.sixCardWageredCents + r.bet,
    sixCardExpectedCents: add(
      t.sixCardExpectedCents,
      scale(neg(sixCardEdge(r.paytable).edge), r.bet),
    ),
  };
}
