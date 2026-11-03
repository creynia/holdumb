import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimDriver } from '../scene';
import { BankrollPicker } from './BankrollPicker';
import { SessionPanel } from './SessionPanel';
import { SimTools } from './SimTools';
import { isRackRejection, parseBankrollDollars, rackShort } from './bankroll';
import { decodeSnapshot, encodeSnapshot } from './persist';

afterEach(cleanup);

const sandbox = (bankroll = 1_000) =>
  new SimDriver({
    mode: 'sandbox',
    seed: 3,
    scene: { id: 'sandbox', version: 1, bankroll, bets: { ante: 500 } },
    preview: () => Promise.reject(new Error('no ev')),
  });

describe('bankroll limits', () => {
  it('accepts whole dollars from $1 to $1,000,000 only', () => {
    expect(parseBankrollDollars('1')).toBe(100);
    expect(parseBankrollDollars('1000000')).toBe(100_000_000);
    expect(parseBankrollDollars('$2,500')).toBe(250_000);
    for (const bad of ['0', '1000001', '', ' ', '12.5', '-5', 'abc', '1e3'])
      expect(parseBankrollDollars(bad)).toBeNull();
  });
  it('knows when the rack cannot rebet', () => {
    expect(rackShort('settled', 1_999, 1_000, 0)).toBe(true);
    expect(rackShort('settled', 2_000, 1_000, 0)).toBe(false);
    expect(rackShort('settled', 2_999, 1_000, 1_000)).toBe(true);
    expect(rackShort('betting', 0, 1_000, 0)).toBe(false);
    expect(isRackRejection('Not enough in the rack for that bet.')).toBe(true);
    expect(isRackRejection('Place an Ante first.')).toBe(false);
  });
});

describe('top-up accounting', () => {
  it('adds to the rack, keeps stats, and Net ignores the added money', () => {
    const d = sandbox(1_000);
    expect(d.view.session.net).toBe(0);
    expect(d.topUp(5_000)).toBe(true);
    expect(d.view.state.bankroll).toBe(1_000 - 500 * 2 + 5_000);
    expect(d.view.session.topUpCents).toBe(5_000);
    expect(d.view.session.net).toBe(0);
    expect(d.view.startEquity).toBe(1_000);
    d.topUp(2_500);
    expect(d.view.session.topUpCents).toBe(7_500);
    expect(d.view.session.net).toBe(0);
  });
  it('rejects non-positive and fractional amounts; new session clears top-ups', () => {
    const d = sandbox();
    expect(d.topUp(0)).toBe(false);
    expect(d.topUp(-100)).toBe(false);
    expect(d.topUp(10.5)).toBe(false);
    expect(d.view.session.topUpCents).toBe(0);
    d.topUp(100);
    d.newSession(20_000);
    expect(d.view.session.topUpCents).toBe(0);
    expect(d.view.state.bankroll).toBeLessThanOrEqual(20_000);
  });
  it('survives the snapshot round trip', () => {
    const d = sandbox();
    d.topUp(5_000);
    const back = decodeSnapshot(encodeSnapshot(d), 'trips-8-6-5');
    expect(back?.restore.totals.topUpCents).toBe(5_000);
    const legacy = encodeSnapshot(d) as unknown as { totals: Record<string, number> };
    delete legacy.totals.topUpCents;
    expect(decodeSnapshot(legacy, 'trips-8-6-5')?.restore.totals.topUpCents).toBe(0);
  });
  it('shows the top-up in the session panel', () => {
    const d = sandbox();
    d.topUp(5_000);
    render(<SessionPanel session={d.view.session} defaultOpen />);
    expect(screen.getByTestId('session-topups').textContent).toContain('$50');
  });
});

describe('BankrollPicker', () => {
  it('offers the presets, and Start is off for an out-of-range custom amount', () => {
    const onConfirm = vi.fn();
    render(
      <BankrollPicker
        kind="new-session"
        initial={50_000}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    for (const n of [100, 250, 500, 1000, 5000])
      expect(document.querySelector(`[data-preset="${n}"]`)).toBeTruthy();
    fireEvent.click(document.querySelector('[data-preset="250"]')!);
    fireEvent.click(screen.getByTestId('bankroll-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(25_000);
    fireEvent.input(screen.getByTestId('bankroll-custom'), { target: { value: '1000001' } });
    const start = screen.getByTestId<HTMLButtonElement>('bankroll-confirm');
    expect(start.disabled).toBe(true);
    fireEvent.input(screen.getByTestId('bankroll-custom'), { target: { value: '1000000' } });
    expect(start.disabled).toBe(false);
  });
});

describe('SimTools', () => {
  it('starts a session at the chosen bankroll and reports it as the new default', () => {
    const d = sandbox();
    const saved = vi.fn();
    render(
      <SimTools
        d={d}
        practice={false}
        onPracticeChange={undefined}
        bankroll={50_000}
        onBankrollChange={saved}
      />,
    );
    fireEvent.click(screen.getByTestId('new-session'));
    fireEvent.click(document.querySelector('[data-preset="1000"]')!);
    fireEvent.click(screen.getByTestId('bankroll-confirm'));
    expect(saved).toHaveBeenCalledWith(100_000);
    expect(d.view.startEquity).toBe(100_000);
    expect(screen.getByTestId('new-session').textContent).toContain('$1,000');
  });
  it('shows Top up only when the rack is short', () => {
    const d = sandbox();
    const { rerender } = render(
      <SimTools d={d} practice={false} onPracticeChange={undefined} bankroll={50_000} />,
    );
    expect(screen.queryByTestId('top-up')).toBeNull();
    rerender(
      <SimTools d={d} practice={false} onPracticeChange={undefined} bankroll={50_000} short />,
    );
    fireEvent.click(screen.getByTestId('top-up'));
    fireEvent.click(document.querySelector('[data-preset="100"]')!);
    fireEvent.click(screen.getByTestId('bankroll-confirm'));
    expect(d.view.session.topUpCents).toBe(10_000);
  });
});
