// I063: the progressive jackpot calculator in lesson 20. Drag the meter and read the exact house edge
// of the example $1 table, its cost per hour (30 hands, D10) and how far you are from break-even.
// Lesson-only (D5): nothing is dealt.
import './progressive.css';
import { useState } from 'preact/hooks';
import {
  HANDS_PER_HOUR,
  formatMoney,
  formatPct,
  fraction,
  progressiveBreakEven,
  progressiveEdge,
} from '../../sim';
import type { Fraction } from '../../sim';
import {
  PROGRESSIVE_METER_MAX,
  PROGRESSIVE_METER_MIN,
  PROGRESSIVE_METER_STEP,
} from '../../content/progressive';
import type { ProgressiveBlockData } from '../../content/types';
import { wagerTierOf } from '../bets';
import { TierBadge } from './TierBadge';

const dollars = (n: number) => formatMoney(n * 100);
const minus = (s: string) => s.replace(/^-/, '−');
/** An exact Fraction of dollars as cents, rounded once (half away from zero). */
const toCents = (f: Fraction): number => fraction.round(fraction.scale(f, 100));

export const BREAK_EVEN = progressiveBreakEven();
export const BREAK_EVEN_CENTS = toCents(BREAK_EVEN);

/** The line under the slider for a meter (whole dollars). */
export function progressiveLine(meter: number): { edge: string; hour: string; vs: string } {
  const edge = progressiveEdge(meter);
  const perHour = toCents({ num: edge.num * BigInt(HANDS_PER_HOUR), den: edge.den });
  const abs = edge.num < 0n ? { num: -edge.num, den: edge.den } : edge;
  // Near break-even one decimal would read "0.0%": show two below 1%.
  const pct = formatPct(abs, abs.num * 100n < abs.den ? 2 : 1);
  const gapCents = BREAK_EVEN_CENTS - meter * 100;
  return {
    edge: edge.num > 0n ? `House edge ${pct}` : edge.num < 0n ? `Player edge ${pct}` : 'Break-even',
    hour:
      perHour > 0
        ? `$1 a hand costs about ${formatMoney(perHour)} an hour`
        : perHour < 0
          ? `$1 a hand earns about ${formatMoney(-perHour)} an hour on average`
          : '$1 a hand costs nothing on average',
    vs:
      gapCents > 0
        ? `${formatMoney(gapCents)} below break-even`
        : `${formatMoney(-gapCents)} above break-even`,
  };
}

export function ProgressiveBlock({ block }: { block: ProgressiveBlockData }) {
  const [meter, setMeter] = useState(block.meter);
  const line = progressiveLine(meter);
  const edge = progressiveEdge(meter);
  const range = PROGRESSIVE_METER_MAX - PROGRESSIVE_METER_MIN;
  const bePct = ((BREAK_EVEN_CENTS / 100 - PROGRESSIVE_METER_MIN) / range) * 100;
  return (
    <figure class="card progressive-block" data-testid="progressive">
      <figcaption>
        <strong>Try it: the example $1 progressive</strong>
      </figcaption>
      <label class="progressive-label" for="progressive-meter">
        Meter: <strong data-testid="progressive-meter">{dollars(meter)}</strong>
      </label>
      <div class="progressive-track">
        <input
          id="progressive-meter"
          type="range"
          min={PROGRESSIVE_METER_MIN}
          max={PROGRESSIVE_METER_MAX}
          step={PROGRESSIVE_METER_STEP}
          value={meter}
          onInput={(e) => setMeter(Number(e.currentTarget.value))}
          aria-valuetext={`${dollars(meter)}: ${line.edge}`}
          data-testid="progressive-slider"
        />
        <span class="progressive-be" style={`left: ${bePct}%`} aria-hidden="true" />
      </div>
      <p data-testid="progressive-edge">
        {line.edge} <TierBadge tier={wagerTierOf(edge)} /> · {minus(line.hour)}.
      </p>
      <p class="muted" data-testid="progressive-vs">
        Break-even meter: <strong>{formatMoney(BREAK_EVEN_CENTS)}</strong> (exactly $3,050,080 ÷
        19). This meter is {line.vs}.
      </p>
    </figure>
  );
}
