// Sandbox tools under the table: New session, Top up (I083) and the Watch controls (I078, passed
// as children). Show EV and Confirm live in the table's options row (I090).
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { formatMoney } from '../engine';
import type { Cents } from '../engine';
import type { SimDriver } from '../scene';
import { BankrollPicker } from './BankrollPicker';
import { DEFAULT_TOP_UP_CENTS } from './bankroll';

export interface SimToolsProps {
  d: SimDriver;
  /** The default bankroll: what New session offers first. */
  bankroll: Cents;
  /** Remembers a chosen starting bankroll as the new default (app settings). */
  onBankrollChange?: (cents: Cents) => void;
  /** The rack cannot cover the next bet: offer Top up. */
  short?: boolean;
  /** The table is playing itself (I078): New session waits. */
  busy?: boolean;
  children?: ComponentChildren;
}

export function SimTools({ d, bankroll, onBankrollChange, short, busy, children }: SimToolsProps) {
  const [panel, setPanel] = useState<'new' | 'top-up' | null>(null);
  const [chosen, setChosen] = useState<Cents | null>(null);
  const base = chosen ?? bankroll;
  const toggle = (p: 'new' | 'top-up') => setPanel((cur) => (cur === p ? null : p));
  return (
    <div class="sim-tools">
      <button
        type="button"
        class="sim-btn sim-btn-secondary"
        disabled={busy}
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
            disabled={busy}
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
      {children}
    </div>
  );
}
