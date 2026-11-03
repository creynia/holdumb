// Sandbox tools under the table: the practice-mode toggle, New session and Top up (I083).
import { useState } from 'preact/hooks';
import { formatMoney } from '../engine';
import type { Cents } from '../engine';
import type { SimDriver } from '../scene';
import { BankrollPicker } from './BankrollPicker';
import { DEFAULT_TOP_UP_CENTS } from './bankroll';
import type { SimulatorProps } from './types';

export interface SimToolsProps {
  d: SimDriver;
  practice: boolean;
  /** The app's handler (settings are the source of truth); without it the table keeps its own. */
  onPracticeChange: SimulatorProps['onPracticeChange'];
  /** The default bankroll: what New session offers first. */
  bankroll: Cents;
  /** Remembers a chosen starting bankroll as the new default (app settings). */
  onBankrollChange?: (cents: Cents) => void;
  /** The rack cannot cover the next bet: offer Top up. */
  short?: boolean;
}

export function SimTools({
  d,
  practice,
  onPracticeChange,
  bankroll,
  onBankrollChange,
  short,
}: SimToolsProps) {
  const [panel, setPanel] = useState<'new' | 'top-up' | null>(null);
  const [chosen, setChosen] = useState<Cents | null>(null);
  const base = chosen ?? bankroll;
  const toggle = (p: 'new' | 'top-up') => setPanel((cur) => (cur === p ? null : p));
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
        aria-expanded={panel === 'new'}
        data-testid="new-session"
        onClick={() => toggle('new')}
      >
        New session ({formatMoney(base)})
      </button>
      {short ? (
        <div class="sim-bankroll-short" data-testid="rack-short">
          <p>Not enough in the rack for the next bet.</p>
          <button
            type="button"
            class="sim-btn"
            aria-expanded={panel === 'top-up'}
            data-testid="top-up"
            onClick={() => toggle('top-up')}
          >
            Top up
          </button>
        </div>
      ) : null}
      {panel === 'new' ? (
        <BankrollPicker
          kind="new-session"
          initial={base}
          onCancel={() => setPanel(null)}
          onConfirm={(c) => {
            d.newSession(c);
            setChosen(c);
            onBankrollChange?.(c);
            setPanel(null);
          }}
        />
      ) : null}
      {panel === 'top-up' ? (
        <BankrollPicker
          kind="top-up"
          initial={DEFAULT_TOP_UP_CENTS}
          onCancel={() => setPanel(null)}
          onConfirm={(c) => {
            d.topUp(c);
            setPanel(null);
          }}
        />
      ) : null}
    </div>
  );
}
