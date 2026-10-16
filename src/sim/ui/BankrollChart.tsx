// Hand-rolled SVG (crappy's BankrollChart pattern). One session: equity line(s) against the
// dashed exact-expected line. Many sessions (D32): a p10-p90 band, the median, the expected
// line, and a survival curve underneath. A text summary stands in for the picture (a11y).
import { formatMoney } from '../engine/money';
import { STRATEGY_CONSTANTS } from '../strategy/constants';
import type { SessionSeries } from '../strategy/types';

const W = 360;
const H = 180;
const SH = 54; // survival panel
const PAD = { l: 52, r: 8, t: 8, b: 18 };
// Neutral palette (no red/orange: those mean "mistake" elsewhere). Colour is never the only cue:
// each series also has its own dash pattern and a legend entry.
const COLORS = ['var(--accent)', 'var(--text)', 'var(--tier-close)', 'var(--muted)'];
const DASHES = ['', '7 3', '2 2', '9 3 2 3'];

export interface BankrollChartProps {
  series: readonly SessionSeries[];
  bankroll: number;
  hands: number;
  /** Cents shown as dollars; default true. */
  class?: string;
}

function extent(series: readonly SessionSeries[], bankroll: number): [number, number] {
  let lo = bankroll;
  let hi = bankroll;
  const add = (a?: ArrayLike<number>): void => {
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      const v = a[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  };
  for (const s of series) {
    add(s.equity);
    add(s.p10);
    add(s.p90);
    add(s.expected);
  }
  if (hi === lo) hi = lo + 1;
  return [lo, hi];
}

function pathOf(a: ArrayLike<number>, x: (i: number) => number, y: (v: number) => number): string {
  // Thin to <= ~400 points so a 10,000-hand path stays light on a phone.
  const step = Math.max(1, Math.floor(a.length / 400));
  let d = '';
  for (let i = 0; i < a.length; i += step)
    d += `${d ? 'L' : 'M'}${x(i).toFixed(1)} ${y(a[i]!).toFixed(1)}`;
  const last = a.length - 1;
  if (last % step !== 0) d += `L${x(last).toFixed(1)} ${y(a[last]!).toFixed(1)}`;
  return d;
}

export function BankrollChart({ series, bankroll, hands, class: cls }: BankrollChartProps) {
  const many = series.some((s) => s.p10 !== undefined);
  const [lo, hi] = extent(series, bankroll);
  const x = (i: number): number => PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(1, hands);
  const y = (v: number): number => PAD.t + ((H - PAD.t - PAD.b) * (hi - v)) / (hi - lo);
  const ys = (v: number): number => H + 10 + (SH - 14) * (1 - v);
  const total = H + (many ? SH + 14 : 0);
  const summary = series
    .map((s) => {
      const end = s.p50 ? s.p50[s.p50.length - 1]! : s.equity![s.equity!.length - 1]!;
      const surv = s.survival
        ? `, survival ${(s.survival[s.survival.length - 1]! * 100).toFixed(0)}%`
        : '';
      return `${STRATEGY_CONSTANTS[s.strategy.id].name}: ends ${formatMoney(end)} (expected ${formatMoney(s.expected[s.expected.length - 1]!)})${surv}`;
    })
    .join('. ');
  const whole = (v: number): number => Math.round(v / 100) * 100;
  const ticks = [...new Set([whole(lo), whole((lo + hi) / 2), whole(hi)])];
  return (
    <figure class={cls} style={{ margin: 0 }} data-testid="bankroll-chart">
      <svg
        viewBox={`0 0 ${W} ${total}`}
        width="100%"
        role="img"
        aria-label={`Bankroll over ${hands} hands. ${summary}`}
        style={{ maxWidth: '520px', display: 'block' }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--muted)"
              opacity="0.25"
            />
            <text x={PAD.l - 4} y={y(t) + 3} text-anchor="end" font-size="9" fill="var(--muted)">
              {formatMoney(t)}
            </text>
          </g>
        ))}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(bankroll)}
          y2={y(bankroll)}
          stroke="var(--muted)"
          stroke-dasharray="2 3"
        />
        {series.map((s, k) => {
          const color = COLORS[k % COLORS.length]!;
          return (
            <g key={s.strategy.id + k}>
              {s.p10 && s.p90 ? (
                <path
                  d={`${pathOf(s.p90, x, y)}L${pathOf([...s.p10].reverse(), (i) => x(hands - i), y).slice(1)}Z`}
                  fill={color}
                  opacity="0.18"
                  data-testid="band"
                />
              ) : null}
              {s.p50 ? (
                <path
                  d={pathOf(s.p50, x, y)}
                  fill="none"
                  stroke={color}
                  stroke-width="1.6"
                  stroke-dasharray={DASHES[k % DASHES.length]}
                />
              ) : null}
              {s.equity ? (
                <path
                  d={pathOf(s.equity, x, y)}
                  fill="none"
                  stroke={color}
                  stroke-width="1.6"
                  stroke-dasharray={DASHES[k % DASHES.length]}
                />
              ) : null}
              <path
                d={pathOf(s.expected, x, y)}
                fill="none"
                stroke={color}
                stroke-width="1.2"
                stroke-dasharray="1 3"
                stroke-linecap="round"
                opacity="0.8"
              />
            </g>
          );
        })}
        <text x={W - PAD.r} y={H - 4} text-anchor="end" font-size="9" fill="var(--muted)">
          {hands} hands
        </text>
        {many ? (
          <g data-testid="survival">
            <text x={PAD.l} y={H + 8} font-size="9" fill="var(--muted)">
              Sessions not busted
            </text>
            {series.map((s, k) =>
              s.survival ? (
                <path
                  key={k}
                  d={pathOf(s.survival, x, ys)}
                  fill="none"
                  stroke={COLORS[k % COLORS.length]}
                  stroke-width="1.4"
                />
              ) : null,
            )}
            <text x={PAD.l - 4} y={ys(1) + 3} text-anchor="end" font-size="9" fill="var(--muted)">
              100%
            </text>
            <text x={PAD.l - 4} y={ys(0) + 3} text-anchor="end" font-size="9" fill="var(--muted)">
              0%
            </text>
          </g>
        ) : null}
      </svg>
      <ul
        aria-label="Legend"
        data-testid="legend"
        style={{
          listStyle: 'none',
          margin: '4px 0 0',
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 12px',
          fontSize: '12px',
        }}
      >
        {series.map((s, k) => (
          <li key={s.strategy.id + k} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="26" height="8" aria-hidden="true">
              <line
                x1="0"
                x2="26"
                y1="4"
                y2="4"
                stroke={COLORS[k % COLORS.length]}
                stroke-width="2"
                stroke-dasharray={DASHES[k % DASHES.length]}
              />
            </svg>
            {STRATEGY_CONSTANTS[s.strategy.id].name}
          </li>
        ))}
      </ul>
      <figcaption style={{ fontSize: '12px', color: 'var(--muted)' }}>
        {many ? 'Band: middle 80% of sessions (p10 to p90). ' : ''}Fine dotted line: exact expected
        value. Grey dotted horizontal line: your starting bankroll.
      </figcaption>
    </figure>
  );
}
