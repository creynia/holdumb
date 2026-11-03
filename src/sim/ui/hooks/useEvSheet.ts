// One tap acts (D40). A tap on an option acts at once unless the effective confirm policy covers
// that option's tier; then the EV sheet opens as the confirm step (Cancel + Confirm, or a warning
// and "Do it anyway"). Confirm does not depend on EV visibility. In 'after' mode the move is then
// revealed in the sheet (result card + full sheet + Continue). Cancel gives focus back to the
// option button that opened the sheet.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OptionKey, SimDriver } from '../../scene';
import { betterAlternative } from '../../math';
import type { BetterAlternative, DecisionPreview, PreviewRequest } from '../../math';
import type { EvSheetProps } from '../EvSheet';
import { isDecisionStreet } from '../simView';
import type { Orientation } from '../Table';
import { needsConfirm, resolveConfirm } from '../settings';
import type { EvMode } from '../types';
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
  /** The effective EV visibility this hook ran with. */
  evMode: EvMode;
  /** Tap on an ActionBar option. */
  onOption: (k: OptionKey) => void;
  /** Props for the EvSheet, or null when no sheet is shown. */
  sheet: EvSheetProps | null;
}

/**
 * `practice` (evMode 'after', D11): acting shows the reveal card. `evShown`: the scene or step shows
 * EVs at all (false = evMode 'never'). The sheet is a modal in portrait and a rail panel in
 * landscape; `decision`: the hand is on a decision street (an open sheet only shows there).
 */
export function useEvSheet(
  sim: SimDriverHandle,
  practice: boolean,
  orientation: Orientation,
  evShown: boolean,
  decision: boolean,
): EvSheetState {
  const { d, pushToast } = sim;
  const settings = sim.latest.current.settings;
  const { scene, state, preview: pv } = d.view;
  // Changes on every new hand or street; closes an open (non-reveal) sheet.
  const handKey = `${state.hand?.n ?? 0}:${state.street}`;
  const [open, setOpen] = useState<OptionKey | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // Opened as a confirm step while a tiered policy waits for the preview ("Checking your move…").
  const [pending, setPending] = useState(false);
  const evMode: EvMode = !evShown ? 'never' : practice ? 'after' : 'before';
  const policy = () => resolveConfirm(settings, scene, d.view.step, d.mode);
  const lastKey = useRef(handKey);
  useEffect(() => {
    if (lastKey.current !== handKey) {
      lastKey.current = handKey;
      if (!reveal) {
        setOpen(null);
        setPending(false);
      }
    }
  }, [handKey, reveal]);

  // The table that holds the tapped option (a lesson page has several) and its slot (I012).
  const tapped = useRef<{ root: Element | null; slot: string | undefined } | null>(null);
  const rememberSlot = (k: OptionKey) => {
    const btn =
      document.activeElement instanceof HTMLElement && document.activeElement.dataset.option === k
        ? document.activeElement
        : document.querySelector<HTMLElement>(`button[data-option="${k}"]`);
    tapped.current = btn
      ? { root: btn.closest('[data-testid="simulator"]'), slot: btn.dataset.slot }
      : null;
  };
  /** After an act, focus goes to the same slot on the next street, else to Rebet & Deal (D40). */
  const refocus = () => {
    const t = tapped.current;
    if (!t?.root) return;
    setTimeout(() => {
      const root = t.root!;
      if (root.querySelector('[data-testid="ev-sheet"]')) return; // the reveal takes focus
      const sel = (q: string) => root.querySelector<HTMLElement>(q);
      const next =
        (t.slot && sel(`button[data-slot="${t.slot}"]:not([disabled])`)) ||
        (t.slot && t.slot !== 'a' && sel('button[data-slot="bc"]:not([disabled])')) ||
        sel('button[data-action="rebet"]');
      next?.focus();
    }, 0);
  };
  /** Acts on `k`; in 'after' mode the move is then revealed against the pre-move preview. */
  const confirm = async (k: OptionKey) => {
    setPending(false);
    const pre = d.view.preview;
    const before = pre.status === 'ready' ? pre.value : null;
    const reqBefore = requestNow(d);
    // I080: say what the choice was worth, with EV shown before the move only (D40: 'after' gets the
    // reveal card, 'never' nothing); guided steps have the step panel. A hand that ends gets it at
    // the front of the result toast.
    const i = before ? before.options.findIndex((o) => optionKeyOf(o.action) === k) : -1;
    const said =
      before && i >= 0 && evMode === 'before' && !d.view.step ? narrationText(before, i) : null;
    sim.narration.current = said;
    const r = await d.act(actionOfKey(k));
    sim.narration.current = null;
    if (r.ok && evMode === 'after' && before)
      setReveal({ preview: before, chosen: k, req: reqBefore });
    else setOpen(null);
    if (r.ok) refocus();
    if (!r.ok && !d.view.step) pushToast(r.message, 'bad');
    else if (r.ok && said && d.view.state.street !== 'settled') pushToast(said);
  };
  const openSheet = (k: OptionKey, waiting = false) => {
    setPending(waiting);
    setOpen(k);
    d.previewed(k, false);
  };
  const onOption = (k: OptionKey) => {
    rememberSlot(k);
    const p = policy();
    if (p === 'never') return void confirm(k);
    if (p === 'all') return openSheet(k);
    const pv = d.view.preview;
    if (pv.status === 'error') return void confirm(k); // EV is advisory (architecture §4.2)
    const o =
      pv.status === 'ready' ? pv.value?.options.find((x) => optionKeyOf(x.action) === k) : null;
    if (!o) return openSheet(k, true); // tiered policy, preview still running
    if (needsConfirm(p, o.tier)) openSheet(k);
    else void confirm(k);
  };
  // A tiered confirm waiting on the preview: covered -> the warning shows; not covered -> act.
  useEffect(() => {
    if (!pending || !open) return;
    if (pv.status === 'error') return void confirm(open);
    if (pv.status !== 'ready' || !pv.value) return;
    const o = pv.value.options.find((x) => optionKeyOf(x.action) === open);
    if (o && needsConfirm(policy(), o.tier)) setPending(false);
    else void confirm(open);
  }, [pending, open, pv.status, pv.value]);

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
          onSelect: (k) => openSheet(k, pending),
          onConfirm: (k) => void confirm(k),
          onCancel: () => {
            const k = sheetKey;
            setOpen(null);
            setReveal(null);
            setPending(false);
            // Give focus back to the button that opened the sheet.
            setTimeout(
              () => document.querySelector<HTMLElement>(`button[data-option="${k}"]`)?.focus(),
              0,
            );
          },
          evMode,
          // Opened by a tap the policy covers (D40): Confirm acts, Mistakes get "Do it anyway".
          confirming: true,
          checking: pending,
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
  return { open, evMode, onOption, sheet };
}
