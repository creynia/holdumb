// I078 Watch in the Simulator: start, the live strip in the rack's place, the highlighted move,
// a locked table while it plays, and Stop.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { Simulator } from './Simulator';
import { DEFAULT_SIM_SETTINGS } from './types';
import { watchSummary } from './WatchBar';

const settings = { ...DEFAULT_SIM_SETTINGS, animationSpeed: 'instant' as const };
let dispose: (() => void) | null = null;
afterEach(() => {
  cleanup();
  dispose?.();
});

describe('Watch (I078)', () => {
  it('plays perfect moves on the felt, locks the table and stops on Stop', async () => {
    const evClient = createEvClient({ mode: 'inthread' });
    dispose = () => evClient.dispose();
    render(
      <Simulator
        settings={settings}
        evClient={evClient}
        scene={{
          id: 'sandbox',
          version: 1,
          bankroll: 50_000,
          bets: { ante: 1_000 },
          ui: { showSettings: true },
          deals: [{ player: ['As', 'Ad'] }, { player: ['Ks', 'Kd'] }],
        }}
      />,
    );
    const sim = screen.getByTestId('simulator');
    expect(document.querySelector('.sim-rack')).toBeTruthy();
    expect(screen.getByTestId('watch-hands')).toHaveProperty('value', '10');
    fireEvent.click(screen.getByTestId('watch-start'));
    await waitFor(() => expect(screen.getByTestId('watch-status')).toBeTruthy());
    // The strip takes the rack's place; Watch and New session wait.
    expect(document.querySelector('.sim-rack')).toBeNull();
    expect(screen.getByTestId('watch-start')).toHaveProperty('disabled', true);
    expect(screen.getByText(/New session/)).toHaveProperty('disabled', true);
    // Aces: perfect play is Bet 4x, announced and highlighted before it is played.
    await waitFor(() => expect(screen.getByTestId('watch-option').textContent).toBe('Bet 4x'));
    expect(sim.getAttribute('data-street')).toBe('preflop');
    const four = document.querySelector('[data-option="play-4"]')!;
    expect(four.classList.contains('is-hl')).toBe(true);
    expect(four).toHaveProperty('disabled', true);
    expect(screen.getByTestId('watch-status').textContent).toMatch(/hand 1 of 10/);
    // One live region only: the strip is not one (the toast's region announces each hand).
    expect(screen.getByTestId('watch-status').querySelector('[aria-live]')).toBeNull();
    await waitFor(() => expect(sim.getAttribute('data-hands')).toBe('1'), { timeout: 4000 });
    // The settled hand is announced once, through the toast inside the strip, with the moves.
    await waitFor(() =>
      expect(screen.getByTestId('watch-status').querySelector('.sim-sr')?.textContent).toMatch(
        /^Hand 1 of 10: Bet 4x\. /,
      ),
    );
    // The felt's card read-out is quiet while Watch runs: one active live region.
    expect(document.querySelectorAll('[aria-live]:not([aria-live="off"])')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('watch-stop'));
    await waitFor(() => expect(screen.queryByTestId('watch-status')).toBeNull());
    expect(screen.getByTestId('watch-summary').textContent).toBe('Stopped after 1 hand.');
    // The narrated toast is not moved back onto the table (it would be announced again).
    expect(document.querySelector('.sim-toasts')).toBeNull();
    expect(screen.getByTestId('watch-start')).toHaveProperty('disabled', false);
    // Stop really stops: no second hand is dealt afterwards.
    await new Promise((r) => setTimeout(r, 1500));
    expect(sim.getAttribute('data-hands')).toBe('1');
    expect(sim.getAttribute('data-street')).toBe('settled');
  }, 15_000);

  it('summarises how a run ended', () => {
    expect(watchSummary({ end: 'done', played: 30 })).toBe('Watched 30 hands of perfect play.');
    expect(watchSummary({ end: 'blocked', played: 4, message: 'Not enough chips.' })).toBe(
      'Stopped after 4 hands: Not enough chips.',
    );
    expect(watchSummary({ end: null, played: 0 })).toBeNull();
  });

  it('Pause holds the table and Resume goes on; unmount stops the run', async () => {
    const evClient = createEvClient({ mode: 'inthread' });
    dispose = () => evClient.dispose();
    const { unmount } = render(
      <Simulator
        settings={settings}
        evClient={evClient}
        scene={{
          id: 'sandbox',
          version: 1,
          bankroll: 50_000,
          bets: { ante: 1_000 },
          ui: { showSettings: true },
          deals: [{ player: ['As', 'Ad'] }, { player: ['Ks', 'Kd'] }, { player: ['Qs', 'Qd'] }],
        }}
      />,
    );
    const sim = screen.getByTestId('simulator');
    fireEvent.click(screen.getByTestId('watch-start'));
    await waitFor(() => expect(screen.getByTestId('watch-option').textContent).toBe('Bet 4x'));
    fireEvent.click(screen.getByTestId('watch-pause'));
    expect(screen.getByTestId('watch-pause').textContent).toBe('Resume');
    expect(screen.getByTestId('watch-status').textContent).toMatch(/paused/);
    await new Promise((r) => setTimeout(r, 1200));
    expect(sim.getAttribute('data-street')).toBe('preflop');
    expect(sim.getAttribute('data-hands')).toBe('0');
    fireEvent.click(screen.getByTestId('watch-pause'));
    await waitFor(() => expect(sim.getAttribute('data-hands')).toBe('1'), { timeout: 4000 });
    unmount();
    // Nothing runs after unmount: the driver would have dealt hand 2 within the result pause.
    await new Promise((r) => setTimeout(r, 1500));
    expect(sim.getAttribute('data-hands')).toBe('1');
  }, 20_000);
});
