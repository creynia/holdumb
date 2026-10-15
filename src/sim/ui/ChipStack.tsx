// Chips as SVG (on the felt) and helpers shared with the HTML rack. Colours come from tokens.
import type { Cents } from '../engine';
import { formatMoney } from '../engine';

/** Rack denominations, cents. Tokens exist for the first four; bigger chips reuse the last. */
export const CHIP_DENOMS: readonly Cents[] = [100, 500, 2500, 10000];

export function chipDenomFor(value: Cents): Cents {
  let best: Cents = CHIP_DENOMS[0]!;
  for (const d of CHIP_DENOMS) if (d <= value) best = d;
  return best;
}
/** "$5" style label for the face ("5", "25", "100", "1K"). */
export function chipLabel(value: Cents): string {
  const dollars = value / 100;
  if (dollars >= 1000 && dollars % 1000 === 0) return `${dollars / 1000}K`;
  return Number.isInteger(dollars) ? `${dollars}` : dollars.toFixed(2);
}
/** Greedy breakdown, biggest first. Anything under $1 shows as one $1 chip. */
export function chipBreakdown(amount: Cents, max = 60): Cents[] {
  const out: Cents[] = [];
  let rest = Math.max(0, Math.round(amount));
  for (const d of [...CHIP_DENOMS].reverse()) {
    while (rest >= d && out.length < max) {
      out.push(d);
      rest -= d;
    }
  }
  if (out.length === 0 && amount > 0) out.push(100);
  return out;
}

export function chipClass(denom: Cents): string {
  return `sim-chip sim-chip-${chipDenomFor(denom)}`;
}

/** One chip face centred on (0, 0). */
export function ChipFace({ denom, r }: { denom: Cents; r: number }) {
  const ring = r * 0.84;
  const dash = (2 * Math.PI * ring) / 16;
  const label = chipLabel(denom);
  return (
    <g class={chipClass(denom)}>
      <circle r={r} class="sim-chip-body" />
      <circle
        r={ring}
        class="sim-chip-edge"
        stroke-width={r * 0.22}
        stroke-dasharray={`${dash * 0.55} ${dash * 0.45}`}
      />
      <circle r={r * 0.62} class="sim-chip-face" />
      <text
        y={r * 0.2}
        text-anchor="middle"
        font-size={r * (label.length > 3 ? 0.46 : 0.6)}
        class="sim-chip-text"
      >
        {label}
      </text>
    </g>
  );
}

export interface ChipStackProps {
  x: number;
  y: number;
  amount: Cents;
  /** Chip radius. */
  r: number;
  class?: string;
}

const STACK_LIMIT = 4;

/** Up to four chips, biggest at the bottom, plus an amount pill. Decorative: the circle names the bet. */
export function ChipStack({ x, y, amount, r, class: cls }: ChipStackProps) {
  const chips = chipBreakdown(amount, STACK_LIMIT).reverse();
  const step = Math.max(3, r * 0.14);
  const text = formatMoney(amount);
  const pw = Math.max(r * 1.5, text.length * r * 0.32 + r * 0.6);
  const ph = Math.max(16, r * 0.58);
  return (
    <g
      class={`sim-stack${cls ? ' ' + cls : ''}`}
      transform={`translate(${x} ${y})`}
      aria-hidden="true"
      data-amount={amount}
    >
      {chips.map((d, i) => (
        <g key={i} transform={`translate(0 ${-i * step + (chips.length - 1) * step * 0.5})`}>
          <ChipFace denom={d} r={r} />
        </g>
      ))}
      <g transform={`translate(0 ${r + 2})`}>
        <rect x={-pw / 2} y={-ph / 2} width={pw} height={ph} rx={ph / 2} class="sim-pill" />
        <text y={ph * 0.33} text-anchor="middle" font-size={ph * 0.72} class="sim-pill-text">
          {text}
        </text>
      </g>
    </g>
  );
}
