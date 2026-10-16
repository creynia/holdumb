import './sim.css';
import type { OptionKey } from '../scene';
import type { DecisionPreview } from '../math';
import { TierBadge } from './TierBadge';
import {
  DECISION_TIER_LABEL,
  bestOf,
  fmtAnteUnits,
  fmtCentsFraction,
  fmtVsBest,
  optionKeyOf,
  sub,
  typographic,
} from './text';

export interface EvOptionListProps {
  preview: DecisionPreview;
  selected?: OptionKey | null;
  /** Rows become selectable (radio) when given. */
  onSelect?: (k: OptionKey) => void;
  /** Practice mode (D11): labels only. */
  hideEv?: boolean;
  compact?: boolean;
  /** Options a scene forbids are hidden. */
  allowed?: readonly OptionKey[];
}

/** Every option with its whole-hand EV (dollars and antes), cost vs best, and tier badge. */
export function EvOptionList({
  preview,
  selected,
  onSelect,
  hideEv,
  compact,
  allowed,
}: EvOptionListProps) {
  const best = bestOf(preview);
  const rows = preview.options.filter((o) => !allowed || allowed.includes(optionKeyOf(o.action)));
  return (
    <ul
      class={`sim-evlist${compact ? ' is-compact' : ''}`}
      role={onSelect ? 'radiogroup' : 'list'}
      aria-label="Options and their expected results"
    >
      {rows.map((o) => {
        const key = optionKeyOf(o.action);
        const isBest = o === best;
        const cost = sub(best.evCents, o.evCents);
        const body = (
          <>
            <span class="sim-evrow-label">{o.label}</span>
            {hideEv ? (
              <span class="sim-evrow-ev sim-muted">EV hidden</span>
            ) : (
              <>
                <span class="sim-evrow-ev">
                  <b>{typographic(fmtCentsFraction(o.evCents))}</b>{' '}
                  <span class="sim-muted">({typographic(fmtAnteUnits(o.ev))} ante)</span>
                </span>
                <span class="sim-evrow-cost">{isBest ? 'Best' : `${fmtVsBest(cost)} vs best`}</span>
                <TierBadge tier={o.tier} />
              </>
            )}
          </>
        );
        const aria = hideEv
          ? o.label
          : `${o.label}, EV ${fmtCentsFraction(o.evCents)}, ${DECISION_TIER_LABEL[o.tier].toLowerCase()}`;
        return (
          <li
            key={key}
            role={onSelect ? 'presentation' : undefined}
            class={`sim-evrow${selected === key ? ' is-selected' : ''}`}
          >
            {onSelect ? (
              <button
                type="button"
                role="radio"
                aria-checked={selected === key}
                aria-label={aria}
                class="sim-evrow-btn"
                data-option={key}
                onClick={() => onSelect(key)}
              >
                {body}
              </button>
            ) : (
              <div class="sim-evrow-btn" data-option={key}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
