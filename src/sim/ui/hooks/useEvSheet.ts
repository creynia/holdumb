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
import { optionsFor } from '../ActionBar';
import { actionOfKey, bestOf, narrationText, optionKeyOf } from '../text';
import type { SimDriverHandle } from './useSimDriver';

/** How long taps are ignored after an act or a new street (the double-tap guard, D40). */
export const TAP_GUARD_MS = 450;

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
  /** Taps are being ignored for a moment after an act or a new street (double-tap guard). */
  guarding: boolean;
  /** Tap on an ActionBar option. */
  onOption: (k: OptionKey) => void;
  /** The status bar's Details button: opens the sheet on the best option without acting (I092). */
  openDetails: () => void;
  /** Closes any sheet and drops a pending confirm (Watch takes over the table, I078). */
  close: () => void;
  /** Props for the EvSheet, or null when no sheet is shown. */
  sheet: EvSheetProps | null;
}

/**
 * `tableMode`: the table's EV mode; 'after' (D11) shows the reveal card when you act. `evShown`: the scene or step shows
 * EVs at all (false = evMode 'never'). The sheet is a modal in portrait and a rail panel in
 * landscape; `decision`: the hand is on a decision street (an open sheet only shows there).
 */
export function useEvSheet(
  sim: SimDriverHandle,
  tableMode: EvMode,
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
  const evMode: EvMode = !evShown ? 'never' : tableMode;
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

  // Double-tap guard (D40): slot a sits in the same place on every street, so a second tap on Check
  // would play the next street unseen. Taps are ignored for a short while after an act or a new
  // street, and until the new street's preview has started.
  const lastActAt = useRef(0);
  const mounted = useRef(false);
  // Rendered state of the guard (a counter, so a second act restarts the timer), so the table can
  // say it is not taking taps yet (data-ev).
  const [guard, setGuard] = useState(0);
  const startGuard = () => {
    lastActAt.current = Date.now();
    setGuard((g) => g + 1);
  };
  useEffect(() => {
    if (guard === 0) return;
    const h = setTimeout(() => setGuard(0), TAP_GUARD_MS);
    return () => clearTimeout(h);
  }, [guard]);
  // The render that first shows a new street already counts as guarded (before the effect runs).
  const guardKey = useRef(handKey);
  const streetJustChanged = guardKey.current !== handKey;
  useEffect(() => {
    guardKey.current = handKey;
    // A new street or hand (a Deal tap included) starts the guard; the first render does not.
    if (mounted.current) startGuard();
    mounted.current = true;
  }, [handKey]);
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
    // Set before anything is awaited: a second click in the same tick must meet the guard.
    lastActAt.current = Date.now();
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
    // Details on that toast opens the reveal for this move against its pre-move preview (I094).
    const detailsAction =
      said && before
        ? {
            label: 'Details',
            onClick: () => {
              fromToast.current = true;
              fromDetails.current = false;
              setPending(false);
              setOpen(null);
              setReveal({ preview: before, chosen: k, req: reqBefore });
              d.previewed(k, false);
            },
          }
        : null;
    sim.narrationAction.current = detailsAction;
    const r = await d.act(actionOfKey(k));
    sim.narration.current = null;
    sim.narrationAction.current = null;
    if (r.ok) startGuard();
    else lastActAt.current = 0; // nothing was played: taps are welcome again
    if (r.ok && evMode === 'after' && before)
      setReveal({ preview: before, chosen: k, req: reqBefore });
    else setOpen(null);
    if (r.ok) refocus();
    if (!r.ok && !d.view.step) pushToast(r.message, 'bad');
    else if (r.ok && said && d.view.state.street !== 'settled')
      pushToast(said, undefined, undefined, detailsAction ?? undefined);
  };
  // The sheet was opened by the status bar's Details button (I092): closing it returns focus there,
  // and it is not a confirm step (D40).
  const fromDetails = useRef(false);
  // ...or by the Details button on the narration toast (I094): focus goes back to that button.
  const fromToast = useRef(false);
  const openDetails = () => {
    const pvNow = d.view.preview.value;
    const allowed = d.view.allowedOptions;
    const first = optionsFor(d.view.state.street, allowed)[0];
    const best = pvNow ? optionKeyOf(bestOf(pvNow).action) : undefined;
    // A gated step never opens the sheet on an option it hides.
    const k = best && (!allowed || allowed.includes(best)) ? best : first;
    if (!k) return;
    fromDetails.current = true;
    fromToast.current = false;
    setPending(false);
    setOpen(k);
    d.previewed(k, false);
  };
  const openSheet = (k: OptionKey, waiting = false) => {
    fromDetails.current = false;
    fromToast.current = false;
    setPending(waiting);
    setOpen(k);
    d.previewed(k, false);
  };
  const onOption = (k: OptionKey) => {
    const pv = d.view.preview;
    const st = d.view.state;
    if (Date.now() - lastActAt.current < TAP_GUARD_MS) return;
    if (isDecisionStreet(st.street) && pv.key !== `${st.hand?.n ?? 0}:${st.street}`) return;
    rememberSlot(k);
    const p = policy();
    // 'after' reveals the move against its preview: a tap before it is ready waits for it.
    if (p === 'never')
      return evMode === 'after' && pv.status === 'pending' ? openSheet(k, true) : void confirm(k);
    if (p === 'all') return openSheet(k);
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
          // Switching options in place keeps how the sheet was opened (confirm step or Details).
          onSelect: (k) => {
            setOpen(k);
            d.previewed(k, false);
          },
          onConfirm: (k) => void confirm(k),
          onCancel: () => {
            const k = sheetKey;
            setOpen(null);
            setReveal(null);
            setPending(false);
            // Give focus back to the button that opened the sheet.
            const opener = fromToast.current
              ? '[data-testid="toast-details"]'
              : fromDetails.current
                ? '[data-testid="ev-details"]'
                : `button[data-option="${k}"]`;
            setTimeout(() => document.querySelector<HTMLElement>(opener)?.focus(), 0);
          },
          evMode,
          // Opened by a tap the policy covers (D40): Confirm acts, Mistakes get "Do it anyway".
          // Opened by Details: the primary reads "Confirm <label>", warnings stay inline.
          confirming: !fromDetails.current,
          checking: pending,
          // Focus moves into the sheet when it opens, in the rail too (landscape).
          focusOnOpen: true,
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
  const close = () => {
    setOpen(null);
    setReveal(null);
    setPending(false);
  };
  return {
    open,
    evMode,
    guarding: guard > 0 || streetJustChanged,
    onOption,
    openDetails,
    close,
    sheet,
  };
}
