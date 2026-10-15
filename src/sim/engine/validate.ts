import type {
  Action,
  Cents,
  DecisionStreet,
  GameState,
  PlayMultiple,
  Validation,
  Warning,
} from './types';

const fail = (code: Extract<Validation, { ok: false }>['code'], message: string): Validation => ({
  ok: false,
  code,
  message,
});
const ok = (warnings: Warning[] = []): Validation => ({ ok: true, warnings });

const isDecision = (s: GameState['street']): s is DecisionStreet =>
  s === 'preflop' || s === 'flop' || s === 'river';

/** Largest ante the bankroll can carry (ante counts twice, plus current Trips), snapped to betUnit. */
export function maxAnte(state: GameState): Cents {
  const { rules } = state;
  const { bets } = state;
  // In 'betting' the current chips are already off the rack; in 'settled' nothing is.
  const available =
    state.bankroll + (state.street === 'betting' ? bets.ante + bets.blind + bets.trips : 0);
  const raw = Math.floor((available - bets.trips) / 2 / rules.betUnit) * rules.betUnit;
  return Math.max(0, Math.min(rules.anteMax, raw));
}

/** Pure; first failure wins (simulator.md §1.4). */
export function validateAction(state: GameState, action: Action): Validation {
  const { rules, street, bets, bankroll } = state;
  const inBetting = street === 'betting' || street === 'settled';
  switch (action.type) {
    case 'set-bet': {
      if (!inBetting) return fail('wrong-street', 'Bets can only change between hands.');
      const amount = action.amount;
      const isTrips = action.wager === 'trips';
      if (
        !Number.isInteger(amount) ||
        amount < 0 ||
        (amount === 0 && !isTrips) ||
        amount % rules.betUnit !== 0
      )
        return fail('bad-amount', `Bets are whole multiples of ${rules.betUnit} cents.`);
      if (amount > 0 || !isTrips) {
        const min = isTrips ? rules.tripsMin : rules.anteMin;
        const max = isTrips ? rules.tripsMax : rules.anteMax;
        if (amount < min) return fail('below-min', `Minimum is ${min} cents.`);
        if (amount > max) return fail('above-max', `Maximum is ${max} cents.`);
      }
      const ante = isTrips ? bets.ante : amount;
      if (isTrips && amount > 0 && ante <= 0)
        return fail('needs-ante', 'Place an Ante before a Trips bet.');
      const trips = isTrips ? amount : bets.trips;
      const newTotal = ante * 2 + trips;
      // In 'betting' the current chips are off the rack already; in 'settled' they are not.
      const oldOnFelt = street === 'betting' ? bets.ante + bets.blind + bets.trips : 0;
      if (newTotal - oldOnFelt > bankroll)
        return fail('insufficient-funds', 'Not enough in the rack for that bet.');
      return ok();
    }
    case 'deal': {
      if (!inBetting) return fail('wrong-street', 'A hand is already in progress.');
      if (bets.ante <= 0) return fail('needs-ante', 'Place an Ante first.');
      const total = bets.ante * 2 + bets.trips;
      let remaining = bankroll;
      if (street === 'settled') {
        if (total > bankroll)
          return fail('insufficient-funds', 'Not enough in the rack to re-bet.');
        remaining = bankroll - total;
      }
      const warnings: Warning[] = [];
      if (remaining < 4 * bets.ante)
        warnings.push({
          code: 'cant-afford-max-raise',
          message: 'You cannot afford a 4x Play with this bankroll.',
        });
      return ok(warnings);
    }
    case 'clear':
      return street === 'settled' ? ok() : fail('wrong-street', 'Nothing to clear.');
    case 'check':
      return street === 'preflop' || street === 'flop'
        ? ok()
        : fail('wrong-street', 'You cannot check here.');
    case 'play': {
      if (!isDecision(street)) return fail('wrong-street', 'No decision to make.');
      const m: PlayMultiple = action.multiple;
      const legal =
        street === 'preflop'
          ? rules.preflopMultiples.includes(m as 3 | 4)
          : street === 'flop'
            ? m === 2
            : m === 1;
      if (!legal) return fail('bad-multiple', `${m}x is not allowed on the ${street}.`);
      if (m * bets.ante > bankroll)
        return fail('insufficient-funds', `Not enough in the rack for a ${m}x Play.`);
      return ok();
    }
    case 'fold':
      return street === 'river' ? ok() : fail('wrong-street', 'You can only fold at the river.');
  }
}
