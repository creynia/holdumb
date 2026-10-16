import './sim.css';
import type { DecisionTier, WagerTier } from '../math';
import { DECISION_TIER_LABEL, WAGER_TIER_LABEL } from './text';

export type AnyTier = DecisionTier | WagerTier;

const isDecision = (t: AnyTier): t is DecisionTier => t in DECISION_TIER_LABEL;

/** A different shape per tier, so colour is never the only signal. */
function TierIcon({ tier }: { tier: AnyTier }) {
  const shape: Record<string, string> = {
    // check
    best: 'M2.5 7.5l3 3 6-7',
    free: 'M2.5 7.5l3 3 6-7',
    // plain circle
    close: 'M7 3.5a3.5 3.5 0 1 0 0.01 0Z',
    good: 'M7 3.5a3.5 3.5 0 1 0 0.01 0Z',
    // dash
    small: 'M3 7h8',
    fair: 'M3 7h8',
    // triangle
    costly: 'M7 2.5 12 11.5H2Z',
    poor: 'M7 2.5 12 11.5H2Z',
    // cross
    blunder: 'M3 3l8 8M11 3l-8 8',
    avoid: 'M3 3l8 8M11 3l-8 8',
  };
  const filled = tier === 'close' || tier === 'good' || tier === 'costly' || tier === 'poor';
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" class="sim-tier-icon">
      <path
        d={shape[tier]}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export interface TierBadgeProps {
  tier: AnyTier;
  /** Shorter text for crowded places (action buttons). */
  short?: string;
  /** Extra text after the label, e.g. "−0.011 ante". */
  detail?: string;
}

/** The tier as an icon plus a text label. Colour reinforces it but is never alone (D24). */
export function TierBadge({ tier, short, detail }: TierBadgeProps) {
  const label = short ?? (isDecision(tier) ? DECISION_TIER_LABEL[tier] : WAGER_TIER_LABEL[tier]);
  const kind = isDecision(tier) ? 'tier' : 'wager';
  return (
    <span class={`sim-badge sim-badge-${kind}-${tier}`} data-tier={tier}>
      <TierIcon tier={tier} />
      <span class="sim-badge-text">
        {label}
        {detail ? <span class="sim-badge-detail"> · {detail}</span> : null}
      </span>
    </span>
  );
}
