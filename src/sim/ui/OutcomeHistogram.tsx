// Outcome counts (win / lose / tie / fold) and the final hand categories, as horizontal bars.
import { HAND_CATEGORIES } from '../engine/types';
import type { SessionSeries } from '../strategy/types';

const OUTCOMES = ['win', 'lose', 'tie', 'fold'] as const;
const LABEL: Record<string, string> = {
  win: 'Win',
  lose: 'Lose',
  tie: 'Tie',
  fold: 'Fold',
  'high-card': 'High card',
  pair: 'Pair',
  'two-pair': 'Two pair',
  trips: 'Trips',
  straight: 'Straight',
  flush: 'Flush',
  'full-house': 'Full house',
  quads: 'Quads',
  'straight-flush': 'Straight flush',
  'royal-flush': 'Royal flush',
};

function Bars({ rows, total, label }: { rows: [string, number][]; total: number; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <table
      aria-label={label}
      style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
    >
      <tbody>
        {rows.map(([name, n]) => (
          <tr key={name}>
            <th scope="row" style={{ textAlign: 'left', fontWeight: 400, width: '26%' }}>
              {LABEL[name] ?? name}
            </th>
            <td style={{ width: '40%' }}>
              <div
                style={{
                  height: '10px',
                  width: `${(100 * n) / max}%`,
                  background: 'var(--accent)',
                  borderRadius: '2px',
                }}
              />
            </td>
            <td
              style={{
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {n.toLocaleString('en-US')} ({total ? ((100 * n) / total).toFixed(1) : '0.0'}%)
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OutcomeHistogram({ series }: { series: SessionSeries }) {
  const total = series.handsPlayed;
  const cats = HAND_CATEGORIES.map((c, i): [string, number] => [c, series.byCategory[i] ?? 0]);
  return (
    <div data-testid="outcome-histogram">
      <h4 style={{ margin: '8px 0 4px' }}>Outcomes</h4>
      <Bars
        label="Outcomes"
        total={total}
        rows={OUTCOMES.map((o): [string, number] => [o, series.outcomes[o]])}
      />
      <h4 style={{ margin: '8px 0 4px' }}>Your final hands</h4>
      <Bars label="Final hand categories" total={total} rows={cats.filter((c) => c[1] > 0)} />
    </div>
  );
}
