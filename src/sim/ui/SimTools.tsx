// Sandbox tools under the table: the practice-mode toggle and New session.
import { formatMoney } from '../engine';
import type { Cents } from '../engine';

export interface SimToolsProps {
  practice: boolean;
  onPractice: (on: boolean) => void;
  bankroll: Cents;
  onNewSession: () => void;
}

export function SimTools({ practice, onPractice, bankroll, onNewSession }: SimToolsProps) {
  return (
    <div class="sim-tools">
      <label>
        <input
          type="checkbox"
          checked={practice}
          onChange={(e) => onPractice(e.currentTarget.checked)}
          data-testid="practice-toggle"
        />
        Practice mode (hide EV until I confirm)
      </label>
      <button type="button" class="sim-btn sim-btn-secondary" onClick={onNewSession}>
        New session ({formatMoney(bankroll)})
      </button>
    </div>
  );
}
