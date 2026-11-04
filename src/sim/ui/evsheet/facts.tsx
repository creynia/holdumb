// The EV sheet's street facts, moved out of EvSheet.tsx (I082): the river's dealer outs (lesson
// 12) and the flop's basic-card rule (I058), both hidden while the EV is hidden.
import { basicFlopRule, riverFacts } from '../../math';
import type { DecisionPreview, PreviewRequest } from '../../math';
import { flopRuleLine } from '../altCopy';
import { DealerOuts } from '../DealerOuts';

export function sheetFacts({
  preview,
  request,
  hidden,
  detail,
  after,
}: {
  preview: DecisionPreview | null;
  request: PreviewRequest | null | undefined;
  hidden: boolean;
  detail: 'basic' | 'full';
  /** The move is made (or the sheet is read-only): the outs show as "what happened". */
  after: boolean;
}) {
  // River facts (lesson 12): on every river preview, hidden only while EV after the move hides it.
  // 47 hand evaluations, so cheap enough to recompute on each render.
  const river =
    preview?.street === 'river' &&
    request?.street === 'river' &&
    request.board.length === 5 &&
    !hidden
      ? riverFacts(request.hole, request.board)
      : null;
  // Flop (I058): which basic-card rule fires. Same visibility as the river facts: hidden while
  // EV after the move hides it, shown after the move, and never in a read-only sheet's absence.
  const flopRule =
    detail === 'full' &&
    preview?.street === 'flop' &&
    request?.street === 'flop' &&
    request.board.length === 3 &&
    !hidden
      ? flopRuleLine(basicFlopRule(request.hole, request.board), preview)
      : null;
  const outs =
    river && request ? (
      <DealerOuts facts={river} request={request} mode={after ? 'after' : 'before'} />
    ) : null;
  return { flopRule, outs };
}
