import type { Cents } from '../engine';
import { formatMoney } from '../engine';
import type { CircleId } from '../scene/types';
import { ChipStack } from './ChipStack';
import type { Pt } from './layouts';

export interface BetCircleProps {
  id: CircleId;
  c: Pt;
  r: number;
  label: string;
  amount: Cents;
  /** Extra small text, e.g. "4x" on the Play circle. */
  sublabel?: string;
  /** Tap target size in viewBox units. */
  minTap: number;
  onTap?: (id: CircleId) => void;
  highlight?: boolean;
  /** Spoken extra, e.g. "Blind matches." */
  hint?: string;
  disabled?: boolean;
}

const NAME: Record<CircleId, string> = {
  trips: 'Trips',
  ante: 'Ante',
  blind: 'Blind',
  play: 'Play',
};

/** A betting circle. Tap target is a transparent `[data-hit]` rect of at least `minTap`. */
export function BetCircle({
  id,
  c,
  r,
  label,
  amount,
  sublabel,
  minTap,
  onTap,
  highlight,
  hint,
  disabled,
}: BetCircleProps) {
  const hit = Math.max(minTap, r * 2);
  const interactive = !!onTap && !disabled;
  const spoken = `${NAME[id]}, ${amount > 0 ? formatMoney(amount) : 'no bet'}.${hint ? ' ' + hint : ''}`;
  const activate = () => onTap?.(id);
  return (
    <g
      class={`sim-circle sim-circle-${id}${amount > 0 ? ' has-bet' : ''}${highlight ? ' is-hl' : ''}${interactive ? ' is-tap' : ''}`}
      role={interactive ? 'button' : 'img'}
      aria-label={spoken}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive
          ? (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate();
              }
            }
          : undefined
      }
      data-circle={id}
    >
      <circle cx={c.x} cy={c.y} r={r} class="sim-circle-ring" />
      {highlight ? <circle cx={c.x} cy={c.y} r={r + 5} class="sim-circle-hl" /> : null}
      <text x={c.x} y={c.y - r - 7} text-anchor="middle" class="sim-circle-label">
        {label}
      </text>
      {amount > 0 ? (
        <ChipStack x={c.x} y={c.y - 2} amount={amount} r={r * 0.72} />
      ) : (
        <text x={c.x} y={c.y + 5} text-anchor="middle" class="sim-circle-empty">
          {sublabel ?? (interactive ? 'tap' : '')}
        </text>
      )}
      {amount > 0 && sublabel ? (
        <text x={c.x + r * 0.78} y={c.y - r * 0.6} text-anchor="middle" class="sim-circle-mult">
          {sublabel}
        </text>
      ) : null}
      <rect
        x={c.x - hit / 2}
        y={c.y - hit / 2}
        width={hit}
        height={hit}
        class="sim-hit"
        data-hit={id}
        fill="transparent"
      />
    </g>
  );
}
