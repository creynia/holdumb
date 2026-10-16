// D38: what the status bar shows. Once a hand is settled the bankroll is equity() (never bankroll plus
// felt, which double-counts) and nothing is "on the felt".
import { equity } from '../engine';
import type { Cents, GameState } from '../engine';

export interface StatusMoney {
  bankroll: Cents;
  onFelt: Cents;
  /** Equity now minus equity at session start; undefined before the first hand. */
  sessionNet: Cents | undefined;
}

export function statusMoney(state: GameState, startEquity: Cents): StatusMoney {
  const settled = state.street === 'settled';
  const onFelt = settled ? 0 : Object.values(state.bets).reduce((a, b) => a + b, 0);
  return {
    bankroll: settled ? equity(state) : state.bankroll,
    onFelt,
    sessionNet: state.stats.hands ? equity(state) - startEquity : undefined,
  };
}
