import './sim.css';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { OptionKey } from '../scene';
import type { DecisionPreview } from '../math';
import { EvOptionList } from './EvOptionList';
import { TierBadge } from './TierBadge';
import { WhyTable } from './WhyTable';
import {
  OPTION_LABELS,
  isUsablePreview,
  bestOf,
  fmtAnteUnits,
  fmtCentsFraction,
  fmtCost,
  fmtVsBest,
  mulInt,
  optionKeyOf,
  sub,
  typographic,
} from './text';

export interface EvSheetProps {
  /** null while the flop EV is still computing (shows a skeleton; Confirm stays enabled). */
  preview: DecisionPreview | null;
  /** The option the player tapped. */
  selected: OptionKey;
  onSelect?: (k: OptionKey) => void;
  /** Omit for a read-only result sheet: no Confirm/Cancel, rows not selectable. */
  onConfirm?: (k: OptionKey) => void;
  onCancel?: () => void;
  /** `error`: the EV could not be computed. Shows "EV not available"; Confirm still works. */
  error?: boolean;
  /** 0..1 progress of a running preview. */
  progress?: number;
  /** `sheet`: modal dialog (portrait); `rail`: panel in the landscape rail; `inline`: plain panel. */
  variant?: 'sheet' | 'rail' | 'inline';
  /** Red-tier moves need a second tap (D24, default on). */
  confirmCostlyMoves?: boolean;
  /** Practice mode (D11): hide EVs until the move is confirmed. */
  hideEv?: boolean;
  /** Set once confirmed in practice mode: shows the result card and the full sheet. */
  chosen?: OptionKey | null;
  onContinue?: () => void;
  /** `basic` = EV + badge; `full` = + alternative + Why? */
  detail?: 'basic' | 'full';
  whyOpen?: boolean;
  onWhyToggle?: (open: boolean) => void;
  /** Adds "about $x an hour" to the cost line. */
  handsPerHour?: number;
  /** Options a scene forbids are hidden. */
  allowed?: readonly OptionKey[];
}

const FOCUSABLE =
  'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** Result of a practice-mode move, e.g. "Best play" or "Mistake: Bet 2x was worth $0.48 more". */
function ResultCard({ preview, chosen }: { preview: DecisionPreview; chosen: OptionKey }) {
  const best = bestOf(preview);
  const o = preview.options.find((x) => optionKeyOf(x.action) === chosen);
  if (!o) return null;
  const cost = sub(best.evCents, o.evCents);
  const isBest = optionKeyOf(best.action) === chosen || o.tier === 'best';
  return (
    <div class="sim-result" role="status" data-testid="practice-result">
      <TierBadge tier={o.tier} />
      <p>
        {isBest
          ? `${o.label} was the best play.`
          : `${best.label} was worth ${fmtCost(cost)} more than ${o.label}.`}
      </p>
    </div>
  );
}

/** The EV sheet (simulator.md 3.4): headline, every option, the better alternative, "Why?", Confirm. */
export function EvSheet({
  preview: rawPreview,
  error,
  selected,
  onSelect,
  onConfirm,
  onCancel,
  progress,
  variant = 'sheet',
  confirmCostlyMoves = true,
  hideEv,
  chosen,
  onContinue,
  detail = 'full',
  whyOpen,
  onWhyToggle,
  handsPerHour,
  allowed,
}: EvSheetProps) {
  const preview = isUsablePreview(rawPreview) ? rawPreview : null;
  const failed = !!error || (!!rawPreview && !preview);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const whyId = useId();
  const [armed, setArmed] = useState(false);
  const [why, setWhy] = useState(!!whyOpen);
  useEffect(() => setArmed(false), [selected]);
  useEffect(() => setWhy(!!whyOpen), [whyOpen]);
  const readOnly = !onConfirm && !onCancel;
  const modal = variant === 'sheet';
  useEffect(() => {
    if (modal) rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [modal]);

  const confirmed = chosen != null;
  const hidden = !!hideEv && !confirmed;
  const opt = preview?.options.find((o) => optionKeyOf(o.action) === selected) ?? null;
  const best = preview ? bestOf(preview) : null;
  const isBest = !!opt && !!best && opt.tier === 'best';
  const cost = opt && best ? sub(best.evCents, opt.evCents) : null;
  const needsSecondTap =
    !!opt && opt.tier === 'blunder' && confirmCostlyMoves && !hidden && !confirmed;
  const label = OPTION_LABELS[selected];

  const confirm = () => {
    if (needsSecondTap && !armed) {
      setArmed(true);
      return;
    }
    onConfirm?.(selected);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel?.();
      return;
    }
    if (modal && e.key === 'Tab' && rootRef.current) {
      const els = [...rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !rootRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const toggleWhy = () => {
    const next = !why;
    setWhy(next);
    onWhyToggle?.(next);
  };

  const alt = best && opt && !isBest && !confirmed && detail === 'full' && !hidden ? best : null;
  const selectedWhy = opt?.why;
  const perHour =
    cost && handsPerHour && !isBest
      ? `about ${fmtCost(mulInt(cost, handsPerHour))} an hour at ${handsPerHour} hands an hour`
      : null;

  const body = (
    <div
      ref={rootRef}
      class={`sim-evsheet sim-evsheet-${variant}`}
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal ? 'true' : undefined}
      aria-labelledby={titleId}
      onKeyDown={onKey}
      data-testid="ev-sheet"
    >
      <h2 id={titleId} class="sim-evsheet-title" tabIndex={-1} data-autofocus>
        {hidden || !opt ? (
          label
        ) : (
          <>
            {label}: {typographic(fmtCentsFraction(opt.evCents))} <TierBadge tier={opt.tier} />
          </>
        )}
      </h2>

      {preview ? (
        <>
          {hidden ? (
            <p class="sim-muted" data-testid="practice-hidden">
              Practice mode: the EV is hidden until you confirm.
            </p>
          ) : (
            <p class="sim-evsheet-sub">
              {opt ? (
                <>Whole hand (Ante, Blind and Play): {typographic(fmtAnteUnits(opt.ev))} ante. </>
              ) : null}
              <span class="sim-exact">exact</span>
              {cost && !isBest ? (
                <span data-testid="cost-vs-best">
                  {' '}
                  Costs {fmtVsBest(cost).replace('−', '')} against {best!.label}
                  {perHour ? `, ${perHour}` : ''}.
                </span>
              ) : null}
            </p>
          )}
          {confirmed ? <ResultCard preview={preview} chosen={chosen} /> : null}
          <EvOptionList
            preview={preview}
            selected={selected}
            onSelect={confirmed || readOnly ? undefined : onSelect}
            hideEv={hidden}
            allowed={allowed}
          />
          {alt ? (
            <div class="sim-alt" data-testid="alternative">
              <p>
                <b>{alt.label} instead:</b> {typographic(fmtCentsFraction(alt.evCents))} against{' '}
                {typographic(fmtCentsFraction(opt!.evCents))}. You keep {fmtCost(cost!)} more per
                hand on average.
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
          ) : null}
          {detail === 'full' && !hidden && selectedWhy ? (
            <div class="sim-why-wrap">
              <button
                type="button"
                class="sim-why-toggle"
                aria-expanded={why}
                aria-controls={whyId}
                onClick={toggleWhy}
              >
                Why?
              </button>
              {why ? <WhyTable why={selectedWhy} id={whyId} /> : null}
            </div>
          ) : null}
        </>
      ) : failed ? (
        <p class="sim-muted" role="status" data-testid="ev-unavailable">
          EV not available. You can still play this move.
        </p>
      ) : (
        <div class="sim-skeleton" data-testid="ev-loading" aria-busy="true">
          <p class="sim-muted sim-calc" role="status">
            <span class="sim-spinner" aria-hidden="true" />
            Calculating…
          </p>
          <div
            class="sim-progress"
            role="progressbar"
            aria-label="EV progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress ?? 0) * 100)}
          >
            <span style={`width:${Math.round((progress ?? 0) * 100)}%`} />
          </div>
          <span class="sim-skel-row" />
          <span class="sim-skel-row" />
        </div>
      )}

      {needsSecondTap && armed ? (
        <p class="sim-warn" role="alert" data-testid="blunder-warning">
          This is a big mistake{best ? `: ${best.label} is the better play` : ''}. Tap again to do
          it anyway.
        </p>
      ) : null}

      {readOnly ? null : (
        <div class="sim-evsheet-actions">
          {confirmed ? (
            <button type="button" class="sim-btn sim-btn-primary" onClick={onContinue ?? onCancel}>
              Continue
            </button>
          ) : (
            <>
              <button type="button" class="sim-btn sim-btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                class={`sim-btn ${needsSecondTap && armed ? 'sim-btn-danger' : 'sim-btn-primary'}`}
                onClick={confirm}
                data-testid="confirm"
              >
                {needsSecondTap && armed ? 'Do it anyway' : `Confirm ${label}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
  return modal ? (
    <div class="sim-scrim">
      <button
        type="button"
        class="sim-scrim-close"
        aria-label="Close"
        tabIndex={-1}
        onClick={onCancel}
      />
      {body}
    </div>
  ) : (
    body
  );
}
