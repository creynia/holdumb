import type { PreviewRequest, RiverFacts } from '../math';
import { basicRiverLine, dealerOutsLine, hiddenPairLine, outsDetailText } from './text';

export interface DealerOutsProps {
  facts: RiverFacts;
  request: PreviewRequest;
  /** `before`: the move is still open; `after`: in a result (practice, drill). Both show the basic card. */
  mode: 'before' | 'after';
}

/**
 * The river facts the basic card rests on (decisions.md section 3, lesson 12): how many of the 45
 * unseen cards beat you and which, whether you have a hidden pair or better, and what the basic
 * card says here. Shown on every river preview, right or wrong, so the count you were meant to
 * make is always there to check.
 */
export function DealerOuts({ facts, request, mode }: DealerOutsProps) {
  return (
    <div class="sim-outs" data-testid="dealer-outs" data-mode={mode}>
      <p>
        <b>{dealerOutsLine(facts)}</b>
        <span class="sim-outs-list" data-testid="dealer-outs-list">
          {' '}
          ({outsDetailText(facts, request.hole, request.board)})
        </span>
      </p>
      <p data-testid="hidden-pair">{hiddenPairLine(facts)}</p>
      <p data-testid="basic-river">{basicRiverLine(facts)}</p>
    </div>
  );
}
