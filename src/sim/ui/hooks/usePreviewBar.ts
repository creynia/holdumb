// What the ActionBar shows of the running EV preview: the ready value and the status badge.
import type { DecisionPreview } from '../../math';
import type { SimDriver } from '../../scene';
import type { EvStatus } from '../text';

export interface PreviewBar {
  /** The preview to print on the buttons, once it is ready and EV is shown. */
  showPreviewOnBar: DecisionPreview | null;
  /** The ActionBar's evStatus, or undefined when no decision or EV is hidden. */
  barStatus: EvStatus | undefined;
}

/** `decision`: a decision street; `evShown`: the scene or step shows EVs. */
export function usePreviewBar(
  pv: SimDriver['view']['preview'],
  decision: boolean,
  evShown: boolean,
): PreviewBar {
  const showPreviewOnBar = evShown && pv.status === 'ready' ? pv.value : null;
  const barStatus =
    !decision || !evShown
      ? undefined
      : pv.status === 'idle'
        ? undefined
        : pv.status === 'ready'
          ? 'ready'
          : pv.status;
  return { showPreviewOnBar, barStatus };
}
