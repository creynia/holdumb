import './sim.css';
import type { Cents, Street } from '../engine';
import type { OptionKey } from '../scene';
import type { DecisionPreview } from '../math';
import type { EvStatus } from './text';
import { DEAL_SHORTCUT, OPTION_SHORTCUT } from './shortcuts';
import {
  DECISION_TIER_SHORT,
  OPTION_LABELS,
  OPTION_SLOT,
  type ActionSlot,
  SLOT_ORDER,
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
  /** When set, each decision button shows its EV and a tier word. EV after the move: leave unset. */
  preview?: DecisionPreview | null;
  /** `pending` shows "Calculating…" and `error` "EV not available" under each decision button, no badges. */
  evStatus?: EvStatus;
  /** EV after the move (D11): no EV or tier on the buttons. */
  hideEv?: boolean;
  /** No EV can ever reach the buttons here (EV off for the scene or step): no reserved EV line. */
  evOff?: boolean;
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
  /** False when the scene gates Clear / Change bets (the button is dimmed, not hidden). */
  canClear?: boolean;
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

/**
 * The decision buttons for a street in slot order (I012): the passive action first, then the bets
 * by size, largest last. Preflop Check, Bet 3x, Bet 4x; flop Check, Bet 2x; river Fold, Bet 1x.
 */
export function optionsFor(street: Street, allowed?: readonly OptionKey[]): OptionKey[] {
  const set = BY_STREET[street] ?? [];
  return SLOT_ORDER.filter((k) => set.includes(k) && (!allowed || allowed.includes(k)));
}

/**
 * The slot an option takes. A scene that allows only one of the two preflop bets gets that bet
 * across b + c, like the flop and river bets, so no narrow button sits alone in one column.
 */
export function slotOf(k: OptionKey, keys: readonly OptionKey[]): ActionSlot {
  const s = OPTION_SLOT[k];
  if (s !== 'b' && s !== 'c') return s;
  const bets = keys.filter((x) => OPTION_SLOT[x] === 'b' || OPTION_SLOT[x] === 'c');
  return bets.length === 1 ? 'bc' : s;
}

/** DOM order = visual order: left to right in the bar, top to bottom (largest first) in the rail. */
const inLayout = <T,>(items: T[], layout: 'bar' | 'rail'): T[] =>
  layout === 'rail' ? [...items].reverse() : items;

export function ActionBar({
  street,
  layout = 'bar',
  preview: rawPreview,
  evStatus,
  hideEv,
  evOff,
  selected,
  allowed,
  highlight = [],
  onOption,
  onDeal,
  onClear,
  onRebet,
  onChangeBets,
  canDeal = true,
  canClear = true,
  dealSub,
  bets,
  disabled,
}: ActionBarProps) {
  const preview = !hideEv && isUsablePreview(rawPreview) ? rawPreview : null;
  const status: EvStatus | null = hideEv
    ? null
    : preview
      ? 'ready'
      : evStatus === 'pending'
        ? 'pending'
        : evStatus || rawPreview
          ? 'error'
          : null;
  const cls = `sim-actions sim-actions-${layout}`;
  if (street === 'betting' || street === 'settled') {
    const betting = street === 'betting';
    const sub = betting
      ? (dealSub ?? (bets ? dealSubtitle(bets.ante, bets.trips) : undefined))
      : undefined;
    const buttons = [
      // Slot a: the way back (Clear / Change bets).
      <button
        key="a"
        type="button"
        class="sim-act sim-act-secondary"
        disabled={disabled || !canClear}
        onClick={betting ? onClear : onChangeBets}
        data-action={betting ? 'clear' : 'change-bets'}
        data-slot="a"
      >
        <span class="sim-act-label">{betting ? 'Clear' : 'Change bets'}</span>
      </button>,
      // Slots b + c: Deal / Rebet & Deal, where the largest bet sits on every street.
      <button
        key="bc"
        type="button"
        class="sim-act sim-act-primary"
        disabled={disabled || (betting && !canDeal)}
        onClick={betting ? onDeal : onRebet}
        aria-keyshortcuts={DEAL_SHORTCUT}
        title={`${betting ? 'Deal' : 'Rebet & Deal'} (${DEAL_SHORTCUT} or Enter)`}
        data-action={betting ? 'deal' : 'rebet'}
        data-slot="bc"
      >
        <span class="sim-act-label">{betting ? 'Deal' : 'Rebet & Deal'}</span>
        {sub ? <span class="sim-act-sub">{sub}</span> : null}
      </button>,
    ];
    return (
      <div class={cls} role="group" aria-label="Actions" data-street={street}>
        {inLayout(buttons, layout)}
      </div>
    );
  }
  const keys = inLayout(optionsFor(street, allowed), layout);
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
            aria-keyshortcuts={OPTION_SHORTCUT[k]}
            title={`${OPTION_LABELS[k]} (${OPTION_SHORTCUT[k]})`}
            data-option={k}
            data-slot={slotOf(k, keys)}
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
            ) : hideEv || evOff ? null : (
              // The EV line is reserved while EV is idle, so the label never jumps when it lands.
              <span class="sim-act-sub" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
