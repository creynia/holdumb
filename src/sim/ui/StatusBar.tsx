import './sim.css';
import type { Cents } from '../engine';
import { formatMoney } from '../engine';

export interface StatusBarProps {
  bankroll: Cents;
  onFelt: Cents;
  /** Session result so far. */
  sessionNet?: Cents;
}

/** Bankroll, money on the felt, session result. */
export function StatusBar({ bankroll, onFelt, sessionNet }: StatusBarProps) {
  return (
    <dl class="sim-status" aria-label="Money">
      <div>
        <dt>Bankroll</dt>
        <dd data-testid="bankroll">{formatMoney(bankroll)}</dd>
      </div>
      <div>
        <dt>On felt</dt>
        <dd data-testid="on-felt">{formatMoney(onFelt)}</dd>
      </div>
      {sessionNet !== undefined ? (
        <div>
          <dt>Session</dt>
          <dd data-testid="session-net">
            {formatMoney(sessionNet, { sign: true }).replace('-', '\u2212')}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
