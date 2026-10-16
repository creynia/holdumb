import { TIER_LABEL, type Tier } from '../../content/types';

export function TierBadge({ tier }: { tier: Tier }) {
  return <span class={`badge tier-${tier}`}>{TIER_LABEL[tier]}</span>;
}
