// The EV sheet state machine: tap an option -> sheet open -> confirm -> (practice) reveal ->
// continue; cancel closes it and gives focus back to the option button that opened it.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OptionKey, SimDriver } from '../../scene';
import { betterAlternative } from '../../math';
import type { BetterAlternative, DecisionPreview, PreviewRequest } from '../../math';
import type { EvSheetProps } from '../EvSheet';
import { isDecisionStreet } from '../simView';
import type { Orientation } from '../Table';
import { needsConfirm } from '../settings';
import { actionOfKey, narrationText, optionKeyOf } from '../text';
import type { SimDriverHandle } from './useSimDriver';

/** The preview request for the decision on the table now, or null between decisions. */
export function requestNow(d: SimDriver): PreviewRequest | null {
  const st = d.view.state;
  const h = st.hand;
  if (!h || !isDecisionStreet(st.street)) return null;
  return {
    street: st.street as PreviewRequest['street'],
    hole: h.deal.player,
    board: h.deal.board.slice(0, h.boardShown),
    blindPaytable: st.rules.blindPaytable,
    ante: st.bets.ante,
  };
}

export interface Reveal {
  preview: DecisionPreview;
  chosen: OptionKey;
  req: PreviewRequest | null;
}

export interface EvSheetState {
  /** The option whose sheet is open (null when closed). */
  open: OptionKey | null;
  /** Tap on an ActionBar option. */
  onOption: (k: OptionKey) => void;
  /** Props for the EvSheet, or null when no sheet is shown. */
  sheet: EvSheetProps | null;
}

/**
 * `practice` (D11): confirming shows the reveal card before the sheet closes. The sheet is a modal
 * in portrait and a rail panel in landscape. `evShown`: the scene or step shows EVs; `decision`:
 * the hand is on a decision street (an open sheet only shows there).
 */
export function useEvSheet(
  sim: SimDriverHandle,
  practice: boolean,
  orientation: Orientation,
  evShown: boolean,
  decision: boolean,
): EvSheetState {
  const { d, pushToast, act } = sim;
  const settings = sim.latest.current.settings;
  const { scene, state, preview: pv } = d.view;
  // Changes on every new hand or street; closes an open (non-reveal) sheet.
  const handKey = `${state.hand?.n ?? 0}:${state.street}`;
  const [open, setOpen] = useState<OptionKey | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const lastKey = useRef(handKey);
  useEffect(() => {
    if (lastKey.current !== handKey) {
      lastKey.current = handKey;
      if (!reveal) setOpen(null);
    }
  }, [handKey, reveal]);

  const confirm = async (k: OptionKey) => {
    const before = d.view.preview.value;
    const reqBefore = requestNow(d);
    const r = await d.act(actionOfKey(k));
    if (practice && before) setReveal({ preview: before, chosen: k, req: reqBefore });
    else setOpen(null);
    if (!r.ok && !d.view.step) pushToast(r.message, 'bad');
    // I080: say what the choice was worth. The practice reveal card already does, a settled hand
    // has its own result toast, and guided steps have the step panel.
    else if (r.ok && before && !practice && !d.view.step && d.view.state.street !== 'settled') {
      const i = before.options.findIndex((o) => optionKeyOf(o.action) === k);
      if (i >= 0) pushToast(narrationText(before, i));
    }
  };
  const onOption = (k: OptionKey) => {
    if (!evShown) {
      void act(actionOfKey(k));
      return;
    }
    setOpen(k);
    d.previewed(k, false);
  };

  const sheetKey = reveal?.chosen ?? open;
  const sheetPreview = reveal ? reveal.preview : pv.value;
  const sheetReq = reveal ? reveal.req : requestNow(d);
  let alternative: BetterAlternative | null = null;
  if (sheetKey && sheetPreview && sheetReq && sheetPreview.street === sheetReq.street) {
    const idx = sheetPreview.options.findIndex((o) => optionKeyOf(o.action) === sheetKey);
    try {
      if (idx >= 0) alternative = betterAlternative(sheetReq, sheetPreview, idx);
    } catch {
      alternative = null;
    }
  }
  const sheet: EvSheetProps | null =
    sheetKey && (reveal || (open && decision))
      ? {
          preview: reveal ? reveal.preview : pv.value,
          error: !reveal && pv.status === 'error',
          progress: pv.progress,
          selected: sheetKey,
          variant: orientation === 'landscape' ? 'rail' : 'sheet',
          onSelect: (k) => {
            setOpen(k);
            d.previewed(k, false);
          },
          onConfirm: (k) => void confirm(k),
          onCancel: () => {
            const k = sheetKey;
            setOpen(null);
            setReveal(null);
            // Give focus back to the button that opened the sheet.
            setTimeout(
              () => document.querySelector<HTMLElement>(`button[data-option="${k}"]`)?.focus(),
              0,
            );
          },
          confirmBlunder: needsConfirm(settings.confirmOn, 'blunder'),
          hideEv: practice,
          alternative,
          request: sheetReq,
          chosen: reveal?.chosen ?? null,
          onContinue: () => {
            setReveal(null);
            setOpen(null);
          },
          detail: scene.evDetail ?? 'full',
          whyOpen: scene.whyOpen,
          onWhyToggle: (o) => {
            if (o && sheetKey) d.previewed(sheetKey, true);
          },
          handsPerHour: settings.handsPerHour,
          allowed: d.view.allowedOptions,
        }
      : null;
  return { open, onOption, sheet };
}
