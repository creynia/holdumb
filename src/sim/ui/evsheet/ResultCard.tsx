// The revealed result of a move ('after'), moved out of EvSheet.tsx (I082).
import type { ComponentChildren } from 'preact';
import type { OptionKey } from '../../scene';
import type { DecisionPreview } from '../../math';
import { Say } from '../announcer';
import { TierBadge } from '../TierBadge';
import { bestOf, costCents, fmtCostC, optionKeyOf } from '../text';

export /** The revealed result of a move ('after'), e.g. "Bet 2x was worth $0.48 more than Check". */
function ResultCard({
  preview,
  chosen,
  children,
}: {
  preview: DecisionPreview;
  chosen: OptionKey;
  children?: ComponentChildren;
}) {
  const best = bestOf(preview);
  const o = preview.options.find((x) => optionKeyOf(x.action) === chosen);
  if (!o) return null;
  const cost = costCents(best, o);
  const isBest = optionKeyOf(best.action) === chosen || o.tier === 'best';
  return (
    <div class="sim-result" data-testid="reveal-result">
      <Say
        text={
          isBest
            ? `${o.label} was the best play.`
            : `${best.label} was worth ${fmtCostC(cost)} more than ${o.label}.`
        }
        dedupeKey="ev-result"
      />
      <TierBadge tier={o.tier} />
      <p>
        {isBest
          ? `${o.label} was the best play.`
          : `${best.label} was worth ${fmtCostC(cost)} more than ${o.label}.`}
      </p>
      {children}
    </div>
  );
}
