import './sim.css';
import type { Cents, Street } from '../engine';
import type { OptionKey } from '../scene';
import type { DecisionPreview } from '../math';
import type { EvStatus } from './text';
import {
  DECISION_TIER_SHORT,
  OPTION_LABELS,
  OPTION_ORDER,
  isUsablePreview,
  fmtAnteUnits,
  money,
  optionKeyOf,
  typographic,
} from './text';

export interface ActionBarProps {
  street: Street;
  /** `rail`: stacked buttons (landscape). */
  layout?: 'bar' | 'rail';
  /** When set, each decision button shows its EV and a tier word. Practice mode: leave unset. */
  preview?: DecisionPreview | null;
  /** `pending` shows "Calculating…" and `error` "EV not available" under each decision button, no badges. */
  evStatus?: EvStatus;
  /** The option whose sheet is open. */
  selected?: OptionKey | null;
  /** A scene may hide options. Omit for all. */
  allowed?: readonly OptionKey[];
  highlight?: readonly OptionKey[];
  onOption?: (k: OptionKey) => void;
  onDeal?: () => void;
  onClear?: () => void;
  /** Settled: Rebet & Deal / Change bets. */
  onRebet?: () => void;
  onChangeBets?: () => void;
  canDeal?: boolean;
  /** Under Deal: "Ante + Blind $20 · Trips $5". */
  dealSub?: string;
  /** Used to build `dealSub` when it isn't given. */
  bets?: { ante: Cents; trips: Cents };
  disabled?: boolean;
}

const BY_STREET: Partial<Record<Street, readonly OptionKey[]>> = {
  preflop: ['play-4', 'play-3', 'check'],
  flop: ['play-2', 'check'],
  river: ['play-1', 'fold'],
};

export function dealSubtitle(ante: Cents, trips: Cents): string {
  return `Ante + Blind ${money(ante * 2)}${trips > 0 ? ` · Trips ${money(trips)}` : ''}`;
}

/** The decision buttons for a street, in the D31 order: Bet 4x, Bet 3x, Check, Bet 2x, Bet 1x, Fold. */
export function optionsFor(street: Street, allowed?: readonly OptionKey[]): OptionKey[] {
  const set = BY_STREET[street] ?? [];
  return OPTION_ORDER.filter((k) => set.includes(k) && (!allowed || allowed.includes(k)));
}

export function ActionBar({
  street,
  layout = 'bar',
  preview: rawPreview,
  evStatus,
  selected,
  allowed,
  highlight = [],
  onOption,
  onDeal,
  onClear,
  onRebet,
  onChangeBets,
  canDeal = true,
  dealSub,
  bets,
  disabled,
}: ActionBarProps) {
  const preview = isUsablePreview(rawPreview) ? rawPreview : null;
  const status: EvStatus | null = preview
    ? 'ready'
    : evStatus === 'pending'
      ? 'pending'
      : evStatus || rawPreview
        ? 'error'
        : null;
  const cls = `sim-actions sim-actions-${layout}`;
  if (street === 'betting') {
    const sub = dealSub ?? (bets ? dealSubtitle(bets.ante, bets.trips) : undefined);
    return (
      <div class={cls} role="group" aria-label="Actions" data-street={street}>
        <button
          type="button"
          class="sim-act sim-act-primary"
          disabled={disabled || !canDeal}
          onClick={onDeal}
          data-action="deal"
        >
          <span class="sim-act-label">Deal</span>
          {sub ? <span class="sim-act-sub">{sub}</span> : null}
        </button>
        <button
          type="button"
          class="sim-act sim-act-secondary"
          disabled={disabled}
          onClick={onClear}
          data-action="clear"
        >
          <span class="sim-act-label">Clear</span>
        </button>
      </div>
    );
  }
  if (street === 'settled') {
    return (
      <div class={cls} role="group" aria-label="Actions" data-street={street}>
        <button
          type="button"
          class="sim-act sim-act-primary"
          disabled={disabled}
          onClick={onRebet}
          data-action="rebet"
        >
          <span class="sim-act-label">Rebet &amp; Deal</span>
        </button>
        <button
          type="button"
          class="sim-act sim-act-secondary"
          disabled={disabled}
          onClick={onChangeBets}
          data-action="change-bets"
        >
          <span class="sim-act-label">Change bets</span>
        </button>
      </div>
    );
  }
  const keys = optionsFor(street, allowed);
  return (
    <div class={cls} role="group" aria-label="Your decision" data-street={street}>
      {keys.map((k) => {
        const o = preview?.options.find((x) => optionKeyOf(x.action) === k);
        const isBest = !!preview && preview.options[preview.bestIndex] === o;
        return (
          <button
            key={k}
            type="button"
            class={`sim-act sim-act-decision${selected === k ? ' is-selected' : ''}${highlight.includes(k) ? ' is-hl' : ''}${o ? ` tier-${o.tier}` : ''}${isBest ? ' is-best' : ''}`}
            disabled={disabled}
            aria-pressed={selected === k}
            onClick={() => onOption?.(k)}
            data-option={k}
          >
            <span class="sim-act-label">{OPTION_LABELS[k]}</span>
            {o ? (
              <span class="sim-act-sub">
                {typographic(fmtAnteUnits(o.ev))} · {DECISION_TIER_SHORT[o.tier]}
              </span>
            ) : status === 'pending' ? (
              <span class="sim-act-sub">Calculating…</span>
            ) : status === 'error' ? (
              <span class="sim-act-sub">EV not available</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
