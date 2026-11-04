// The auto-play result (chart, exact vs simulated figures, hits, outcomes), moved out of
// AutoPlayPanel.tsx (I082).
import { formatMoney } from '../../engine/money';
import { neg, scale } from '../../math/fraction';
import type { Fraction } from '../../math/types';
import { fracToNumber } from '../../strategy/fraction';
import type { SimulateResult } from '../../strategy/types';
import { BankrollChart } from '../BankrollChart';
import { OutcomeHistogram } from '../OutcomeHistogram';
import { shownNet } from './helpers';

export function AutoPlayResult({
  result,
  bankroll,
  hands,
  sessions,
  trips,
  sixEdge,
}: {
  result: SimulateResult;
  bankroll: number;
  hands: number;
  sessions: number;
  trips: number;
  sixEdge: Fraction | null;
}) {
  const main = result.series[0]!;
  // Busted or stopped sessions play fewer hands: expected result = per-hand EV x hands played.
  const perHand = main ? main.expected[1]! - main.expected[0]! : 0;
  // I062: the Six Card bets actually taken expect −edge × wagered (exact), per session.
  const six = main?.sixCard;
  const sixExpected =
    six && sixEdge ? fracToNumber(scale(neg(sixEdge), six.wageredCents)) / sessions : 0;
  const exactNet = main ? perHand * (main.handsPlayed / sessions) + sixExpected : 0;
  const simNet = main ? main.meanFinal - bankroll : 0;
  const shown = shownNet(exactNet, simNet);
  return (
    <div data-testid="auto-play-result" style={{ display: 'grid', gap: '8px' }}>
      <BankrollChart series={result.series} bankroll={bankroll} hands={hands} />
      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
        <li>Expected result (exact): {formatMoney(shown.expected, { sign: true })}</li>
        <li>
          Actual (≈ simulated{sessions > 1 ? ' average' : ''}):{' '}
          {formatMoney(shown.actual, { sign: true })}
          {sessions > 1 ? ` ± ${formatMoney(Math.round(main.meanFinalCi95))}` : ''}
        </li>
        <li>Luck: {formatMoney(shown.luck, { sign: true })}</li>
        {sessions >= 10 ? (
          <>
            <li>Chance of finishing ahead (≈): {(main.probAhead * 100).toFixed(0)}%</li>
            <li>Busted (≈): {(main.bustRate * 100).toFixed(0)}% of sessions</li>
          </>
        ) : (
          <li>
            1 session: {simNet >= 0 ? 'finished ahead' : 'finished behind'} (one run says little
            about the odds; try 100 sessions)
          </li>
        )}
        {trips > 0 ? <li>Trips hits: {main.tripsHits}</li> : null}
        {six ? (
          <li data-testid="auto-play-six-card">
            Six Card{sessions > 1 ? ' (all sessions)' : ''}: {six.taken}{' '}
            {six.taken === 1 ? 'bet' : 'bets'}, {formatMoney(six.wageredCents)} wagered, net{' '}
            {formatMoney(six.profitCents, { sign: true })}, {six.hits} paid
            {six.skipped ? `, ${six.skipped} skipped (kept a 4x bet)` : ''}
          </li>
        ) : null}
        <li>Blind bonus hits: {main.blindBonusHits}</li>
      </ul>
      <OutcomeHistogram series={main} />
    </div>
  );
}
