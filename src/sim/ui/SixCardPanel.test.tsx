// I062 Six Card Bonus panel in the sandbox: off by default, the exact edge and hourly cost, the
// bonus cards after a deal, the session line, and the ledger surviving a snapshot.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { frac } from '../math/fraction';
import { EMPTY_TOTALS } from '../scene';
import { createEvClient } from '../worker/client';
import { decodeTotals, encodeTotals } from './persist';
import { Simulator } from './Simulator';
import { sixCardPerHour } from './SixCardPanel';
import { DEFAULT_SIM_SETTINGS } from './types';

const settings = { ...DEFAULT_SIM_SETTINGS, animationSpeed: 'instant' as const };
let dispose: (() => void) | null = null;
afterEach(() => {
  cleanup();
  dispose?.();
});

describe('Six Card Bonus panel (I062)', () => {
  it('prices the bet exactly per hour (30 hands, D10)', () => {
    // 500¢ × 30 × 12816/149695 = 1284.21…¢ and × 70366/363545 = 2903.33…¢.
    expect(sixCardPerHour('six-card-1000-200-100', 500)).toBe(1284);
    expect(sixCardPerHour('six-card-1000-200-50', 500)).toBe(2903);
    expect(sixCardPerHour('six-card-1000-200-100', 100)).toBe(257);
  });

  it('is off by default; on, it shows the edge, settles at the deal and adds a session line', async () => {
    const evClient = createEvClient({ mode: 'inthread' });
    dispose = () => evClient.dispose();
    render(
      <Simulator
        settings={settings}
        evClient={evClient}
        scene={{
          id: 'sandbox',
          version: 1,
          seed: 5,
          bankroll: 50_000,
          bets: { ante: 1_000 },
          ui: { showSettings: true },
        }}
      />,
    );
    const toggle = screen.getByTestId<HTMLInputElement>('six-card-toggle');
    expect(toggle.checked).toBe(false);
    expect(screen.queryByTestId('six-card-edge')).toBeNull();
    fireEvent.click(toggle);
    const edge = screen.getByTestId('six-card-edge');
    expect(edge.textContent).toMatch(/House edge 8\.56% \(exact\)/);
    expect(edge.textContent).toMatch(/Poor bet/);
    expect(edge.textContent).toMatch(/\$5 a hand costs about \$12\.84 an hour/);
    fireEvent.change(screen.getByTestId('six-card-paytable'), {
      target: { value: 'six-card-1000-200-50' },
    });
    expect(screen.getByTestId('six-card-edge').textContent).toMatch(/19\.36%.*Sucker bet/);
    expect(screen.getByTestId('six-card-edge').textContent).toMatch(/\$29\.03 an hour/);

    fireEvent.click(screen.getByText('Deal'));
    await waitFor(() => expect(screen.getByTestId('six-card-last')).toBeTruthy());
    const last = screen.getByTestId('six-card-last');
    expect(last.querySelectorAll('.sim-inline-card')).toHaveLength(4);
    expect(last.textContent).toMatch(/best five: .+ · (\+\$\d|−\$5$)/);
    fireEvent.click(screen.getByTestId('session-toggle'));
    expect(screen.getByTestId('session-six-card').textContent).toMatch(
      /^wagered \$5 · expected −\$0\.97 · actual/,
    );
  });

  it('the Six Card ledger survives a sandbox snapshot exactly', () => {
    const t = {
      ...EMPTY_TOTALS,
      sixCardCents: 3_500,
      sixCardWageredCents: 1_000,
      sixCardExpectedCents: frac(-1_000n * 12816n, 149695n),
    };
    const back = decodeTotals(
      JSON.parse(JSON.stringify(encodeTotals(t))) as Record<string, unknown>,
    );
    expect(back.sixCardCents).toBe(3_500);
    expect(back.sixCardWageredCents).toBe(1_000);
    expect(back.sixCardExpectedCents).toEqual(frac(-1_000n * 12816n, 149695n));
  });
});
