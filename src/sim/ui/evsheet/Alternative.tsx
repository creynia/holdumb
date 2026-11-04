// The better-alternative block of the EV sheet, moved out of EvSheet.tsx (I082).
import type { DecisionOption } from '../../math';
import type { OptionKey } from '../../scene';
import { fmtCentsFraction, fmtCostC, optionKeyOf, typographic } from '../text';

export function Alternative({
  alt,
  altText,
  opt,
  cost,
  onSelect,
}: {
  alt: DecisionOption;
  altText: { lead: string; text: string } | null;
  opt: DecisionOption;
  cost: number;
  onSelect?: (k: OptionKey) => void;
}) {
  return (
    <div class="sim-alt" data-testid="alternative">
      <p>
        {altText ? (
          <>
            <b>{altText.lead}</b> {altText.text}
          </>
        ) : (
          <>
            <b>{alt.label} instead:</b> {typographic(fmtCentsFraction(alt.evCents))} against{' '}
            {typographic(fmtCentsFraction(opt.evCents))}. You keep {fmtCostC(cost)} more per hand on
            average.
          </>
        )}
      </p>
      {onSelect ? (
        <button
          type="button"
          class="sim-btn sim-btn-secondary"
          onClick={() => onSelect(optionKeyOf(alt.action))}
        >
          Use this
        </button>
      ) : null}
    </div>
  );
}
