import './sim.css';
import type { Cents, HandResult } from '../engine';
import { formatMoney } from '../engine';

export interface StatusBarProps {
  bankroll: Cents;
  onFelt: Cents;
  /** Session result so far. */
  sessionNet?: Cents;
  /**
   * The settled hand's outcome and net, a one-line result that stays on screen (I012). `null`
   * keeps the column reserved before the hand settles, so nothing shifts; omit for no column.
   */
  hand?: Pick<HandResult, 'outcome' | 'net'> | null;
}

const OUTCOME_WORD: Record<HandResult['outcome'], string> = {
  win: 'Won',
  lose: 'Lost',
  tie: 'Push',
  fold: 'Folded',
};

const signed = (c: Cents) => formatMoney(c, { sign: true }).replace('-', '\u2212');

/** Bankroll, money on the felt, the last hand's result, session result. */
export function StatusBar({ bankroll, onFelt, sessionNet, hand }: StatusBarProps) {
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
      {hand !== undefined ? (
        <div data-testid="hand-result">
          <dt>{hand ? OUTCOME_WORD[hand.outcome] : 'Hand'}</dt>
          <dd>{hand ? (hand.net === 0 ? formatMoney(0) : signed(hand.net)) : '\u2014'}</dd>
        </div>
      ) : null}
      {sessionNet !== undefined ? (
        <div>
          <dt>Session</dt>
          <dd data-testid="session-net">{signed(sessionNet)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
