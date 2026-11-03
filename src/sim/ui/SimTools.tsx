// Sandbox tools under the table: the practice-mode toggle, New session and Watch (I078).
import type { ComponentChildren } from 'preact';
import { formatMoney } from '../engine';
import type { Cents } from '../engine';
import type { SimDriver } from '../scene';
import type { SimulatorProps } from './types';

export interface SimToolsProps {
  d: SimDriver;
  practice: boolean;
  /** The app's handler (settings are the source of truth); without it the table keeps its own. */
  onPracticeChange: SimulatorProps['onPracticeChange'];
  bankroll: Cents;
  /** The table is playing itself (I078): New session waits. */
  busy?: boolean;
  children?: ComponentChildren;
}

export function SimTools({
  d,
  practice,
  onPracticeChange,
  bankroll,
  busy,
  children,
}: SimToolsProps) {
  return (
    <div class="sim-tools">
      <label>
        <input
          type="checkbox"
          checked={practice}
          onChange={(e) =>
            onPracticeChange
              ? onPracticeChange(e.currentTarget.checked)
              : d.setPractice(e.currentTarget.checked)
          }
          data-testid="practice-toggle"
        />
        Practice mode (hide EV until I confirm)
      </label>
      <button
        type="button"
        class="sim-btn sim-btn-secondary"
        disabled={busy}
        onClick={() => d.newSession(bankroll)}
      >
        New session ({formatMoney(bankroll)})
      </button>
      {children}
    </div>
  );
}
