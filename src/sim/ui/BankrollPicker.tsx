// Inline amount chooser for New session and Top up: presets, a custom whole-dollar field, a confirm button.
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMoney } from '../engine';
import type { Cents } from '../engine';
import {
  BANKROLL_MAX_DOLLARS,
  BANKROLL_MIN_DOLLARS,
  BANKROLL_PRESETS_DOLLARS,
  parseBankrollDollars,
} from './bankroll';

export interface BankrollPickerProps {
  /** Heading and button wording. */
  kind: 'new-session' | 'top-up';
  /** Amount shown first (cents). */
  initial: Cents;
  onConfirm: (cents: Cents) => void;
  onCancel: () => void;
}

export function BankrollPicker({ kind, initial, onConfirm, onCancel }: BankrollPickerProps) {
  const [text, setText] = useState(String(Math.round(initial / 100)));
  const value = parseBankrollDollars(text);
  const topUp = kind === 'top-up';
  const form = useRef<HTMLFormElement>(null);
  // Opened from a button that may sit near the bottom: bring the chooser into view and focus it.
  useEffect(() => {
    const el = form.current;
    el?.scrollIntoView?.({ block: 'nearest' });
    el?.querySelector<HTMLButtonElement>('[data-preset]')?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      ref={form}
      class="sim-bankroll-picker"
      data-testid="bankroll-picker"
      aria-label={topUp ? 'Top up the rack' : 'New session bankroll'}
      onSubmit={(e) => {
        e.preventDefault();
        if (value !== null) onConfirm(value);
      }}
    >
      <p class="sim-bankroll-title">{topUp ? 'Add to the rack' : 'Starting bankroll'}</p>
      <div class="sim-bankroll-presets" role="group" aria-label="Preset amounts">
        {BANKROLL_PRESETS_DOLLARS.map((n) => (
          <button
            key={n}
            type="button"
            class="sim-btn sim-btn-secondary"
            aria-pressed={value === n * 100}
            data-preset={n}
            onClick={() => setText(String(n))}
          >
            {formatMoney(n * 100)}
          </button>
        ))}
      </div>
      <label class="sim-bankroll-custom">
        Custom ($)
        <input
          type="text"
          inputMode="numeric"
          value={text}
          data-testid="bankroll-custom"
          aria-invalid={value === null}
          aria-describedby="bankroll-limits"
          onInput={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <p id="bankroll-limits" class={`sim-muted${value === null ? ' sim-bankroll-bad' : ''}`}>
        Whole dollars, {formatMoney(BANKROLL_MIN_DOLLARS * 100)} to{' '}
        {formatMoney(BANKROLL_MAX_DOLLARS * 100)}.
        {topUp ? '' : ' It becomes your default bankroll.'}
      </p>
      <div class="sim-bankroll-actions">
        <button
          type="submit"
          class="sim-btn"
          disabled={value === null}
          data-testid="bankroll-confirm"
        >
          {topUp ? 'Add' : 'Start'}
          {value !== null ? ` ${formatMoney(value)}` : ''}
        </button>
        <button type="button" class="sim-btn sim-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
