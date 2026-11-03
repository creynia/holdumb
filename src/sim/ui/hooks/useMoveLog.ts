// The move log's state (I081): folds each new batch of driver events (view.lastEvents, once per
// eventSeq) into the log, with the decision preview that was ready before the move. New session
// (no events, no hands) clears it. Computed during render, so the log and the table never disagree.
import { useRef } from 'preact/hooks';
import type { DecisionPreview } from '../../math';
import type { DriverView } from '../../scene';
import { appendEvents, eventsForHandInProgress } from '../moveLog';
import type { LoggedHand } from '../moveLog';
import { isUsablePreview } from '../text';

export function useMoveLog(view: DriverView, initial: () => LoggedHand[]): readonly LoggedHand[] {
  const s = useRef<{ seq: number | null; hands: LoggedHand[]; pv: DecisionPreview | null } | null>(
    null,
  );
  if (!s.current) s.current = { seq: null, hands: initial(), pv: null };
  const cur = s.current;
  if (view.eventSeq !== cur.seq) {
    const first = cur.seq === null;
    cur.seq = view.eventSeq;
    if (!first && view.lastEvents.length === 0 && view.session.hands === 0) cur.hands = [];
    else
      cur.hands = appendEvents(
        cur.hands,
        first && view.lastEvents.length === 0
          ? eventsForHandInProgress(view.state, cur.hands)
          : view.lastEvents,
        {
          bets: { ante: view.state.bets.ante, trips: view.state.bets.trips },
          preview: cur.pv,
          tripsPaytable: view.state.rules.tripsPaytable,
          ...(view.state.hand ? { deal: view.state.hand.deal } : {}),
        },
      );
    cur.pv = null;
  }
  const pv = view.preview;
  if (pv.status === 'ready' && isUsablePreview(pv.value)) cur.pv = pv.value;
  return cur.hands;
}
