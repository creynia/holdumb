import './sim.css';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { alternativeCopy } from './altCopy';
import { EvOptionList } from './EvOptionList';
import { TierBadge } from './TierBadge';
import { WhyTable } from './WhyTable';
import {
  OPTION_LABELS,
  isUsablePreview,
  bestOf,
  fmtAnteUnits,
  fmtCentsFraction,
  fmtCostC,
  costCents,
  wrongEveryTimePerHour,
  optionKeyOf,
  typographic,
} from './text';
import { Say } from './announcer';
import { Alternative } from './evsheet/Alternative';
import { ResultCard } from './evsheet/ResultCard';
import { sheetActions } from './evsheet/SheetActions';
import { SheetLoading } from './evsheet/SheetStates';
import { useSheetFocus } from './evsheet/useSheetFocus';
import type { EvSheetProps } from './evsheet/types';
import { sheetFacts } from './evsheet/facts';

export type { EvSheetProps } from './evsheet/types';

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
  evMode = 'before',
  confirming = false,
  checking = false,
  chosen,
  onContinue,
  detail = 'full',
  whyOpen,
  onWhyToggle,
  handsPerHour,
  allowed,
  alternative,
  request,
  focusOnOpen,
}: EvSheetProps) {
  const preview = isUsablePreview(rawPreview) ? rawPreview : null;
  const failed = !!error || (!!rawPreview && !preview);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const whyId = useId();
  // The skeleton only appears after 150 ms, so fast previews never flash it.
  const [skel, setSkel] = useState(false);
  useEffect(() => {
    if (rawPreview) return setSkel(false);
    const h = setTimeout(() => setSkel(true), 150);
    return () => clearTimeout(h);
  }, [rawPreview]);
  const [why, setWhy] = useState(!!whyOpen);
  useEffect(() => setWhy(!!whyOpen), [whyOpen]);
  const readOnly = !onConfirm && !onCancel;
  const modal = variant === 'sheet';
  const onKey = useSheetFocus({ rootRef, modal, focusOnOpen, chosen, onCancel });
  const confirmed = chosen != null;
  // 'never' shows no EV at all; 'after' hides it until the move is made (then the reveal shows it).
  const noEv = evMode === 'never' && !confirmed;
  const hidden = evMode !== 'before' && !confirmed;
  const opt = preview?.options.find((o) => optionKeyOf(o.action) === selected) ?? null;
  const best = preview ? bestOf(preview) : null;
  const isBest = !!opt && !!best && opt.tier === 'best';
  const cost = opt && best ? costCents(best, opt) : null;
  // Mistakes and Big mistakes get a warning naming the better play; as the confirm step the
  // primary then reads "Do it anyway". A sheet's Confirm always acts (no "tap again", D40).
  const warn =
    !confirmed &&
    !readOnly &&
    (confirming || !hidden) &&
    !!opt &&
    (opt.tier === 'blunder' || opt.tier === 'costly');
  const danger = warn && confirming;
  const label = OPTION_LABELS[selected];
  const confirm = () => onConfirm?.(selected);
  const toggleWhy = () => {
    const next = !why;
    setWhy(next);
    onWhyToggle?.(next);
  };

  const alt = best && opt && !isBest && !confirmed && detail === 'full' && !hidden ? best : null;
  const selectedWhy = opt?.why;
  const altText = alternative && preview ? alternativeCopy(alternative, preview) : null;
  const perHour =
    preview && opt && handsPerHour && !isBest
      ? wrongEveryTimePerHour(preview, opt, handsPerHour)
      : null;
  const { flopRule, outs } = sheetFacts({
    preview,
    request,
    hidden,
    detail,
    after: confirmed || readOnly,
  });

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

      {checking ? (
        <p class="sim-muted sim-calc" data-testid="ev-checking">
          <Say text="Checking your move." dedupeKey="ev-state" />
          <span class="sim-spinner" aria-hidden="true" />
          Checking your move…
        </p>
      ) : noEv ? (
        warn ? null : (
          <p class="sim-muted" data-testid="confirm-move">
            Confirm this move.
          </p>
        )
      ) : preview ? (
        <>
          {hidden ? (
            <p class="sim-muted" data-testid="ev-hidden">
              EV is hidden until you act.
            </p>
          ) : (
            <p class="sim-evsheet-sub">
              {opt ? (
                <>Whole hand (Ante, Blind and Play): {typographic(fmtAnteUnits(opt.ev))} ante. </>
              ) : null}
              <span class="sim-exact">exact</span>
              {cost !== null && !isBest ? (
                <span data-testid="cost-vs-best">
                  {' '}
                  Costs {fmtCostC(cost)} against {best!.label}.
                </span>
              ) : null}
              {perHour ? (
                <span data-testid="per-hour">
                  {' '}
                  Getting this wrong every time costs about {perHour} an hour.
                </span>
              ) : null}
            </p>
          )}
          {flopRule ? (
            <p class="sim-flop-rule" data-testid="flop-rule">
              {flopRule}
            </p>
          ) : null}
          {confirmed ? (
            <ResultCard preview={preview} chosen={chosen}>
              {outs}
            </ResultCard>
          ) : (
            outs
          )}
          <EvOptionList
            preview={preview}
            selected={selected}
            onSelect={confirmed || readOnly ? undefined : onSelect}
            hideEv={hidden}
            allowed={allowed}
          />
          {alt ? (
            <Alternative alt={alt} altText={altText} opt={opt!} cost={cost!} onSelect={onSelect} />
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
        <p class="sim-muted" data-testid="ev-unavailable">
          <Say text="EV not available. You can still play this move." dedupeKey="ev-state" />
          EV not available. You can still play this move.
        </p>
      ) : (
        <SheetLoading skel={skel} progress={progress} />
      )}

      {sheetActions(
        warn && !checking ? opt : null,
        best,
        readOnly,
        confirmed,
        checking,
        danger,
        label,
        confirm,
        onCancel,
        onContinue,
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
