// I062 Six Card Bonus at the table (decisions.md D5a). The bet is a sandbox setting held by the
// driver, outside the engine's wager registry (engine types are frozen). It settles at the deal,
// because the bonus cards do not depend on play, so no money is ever pending mid-hand: the profit
// goes straight into the bankroll and the session ledger gets the wager, the result and the exact
// expectation (−edge × wager), so "Perfect play expects" and luck stay exact.
import type { SixCardOutcome } from '../engine/sixcard';
import { sixCardEdge } from '../math/edges';
import { add, neg, scale } from '../math/fraction';
import type { SessionTotals } from './driver';

// The skip-and-settle step lives in the engine, so auto-play shares it (one rule, one stream).
export { applySixCard, validSixCardBet } from '../engine/sixcard';
export type { SixCardOutcome, SixCardSetting } from '../engine/sixcard';

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
