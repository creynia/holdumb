import './sim.css';
import type { Cents } from '../engine';
import { formatMoney } from '../engine';
import { CHIP_DENOMS, chipClass, chipLabel } from './ChipStack';

export interface ChipRackProps {
  chips?: readonly Cents[];
  selected: Cents;
  onSelect: (c: Cents) => void;
  disabled?: boolean;
}

/** The chip rack (HTML, chips >= 48 px). Pick a chip, then tap a circle. */
export function ChipRack({ chips = CHIP_DENOMS, selected, onSelect, disabled }: ChipRackProps) {
  return (
    <div class="sim-rack" role="radiogroup" aria-label="Chip size">
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={selected === c}
          aria-label={formatMoney(c)}
          disabled={disabled}
          class={`sim-rack-chip ${chipClass(c)}${selected === c ? ' is-selected' : ''}`}
          onClick={() => onSelect(c)}
          data-chip={c}
        >
          <span class="sim-rack-face">{chipLabel(c)}</span>
        </button>
      ))}
    </div>
  );
}
