import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { Simulator } from './Simulator';
import { DEFAULT_SIM_SETTINGS } from './types';
import type { SceneConfig } from '../scene';

const settings = { ...DEFAULT_SIM_SETTINGS, animationSpeed: 'instant' as const };
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)));

afterEach(cleanup);

function mount(scene?: SceneConfig, extra: Partial<Parameters<typeof Simulator>[0]> = {}) {
  const evClient = createEvClient({ mode: 'inthread' });
  const out = render(
    <Simulator settings={settings} evClient={evClient} scene={scene} {...extra} />,
  );
  return { evClient, ...out };
}

describe('Simulator container', () => {
  it('sandbox: bets are preset, Deal shows the preflop decision with EV before confirming', async () => {
    const { evClient } = mount({ id: 'sandbox', version: 1, seed: 7, bankroll: 50_000 });
    expect(screen.getByTestId('bankroll').textContent).toBe('$480');
    fireEvent.click(screen.getByText('Deal'));
    await waitFor(() => expect(document.querySelector('[data-option="play-4"]')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
    );
    fireEvent.click(document.querySelector('[data-option="play-4"]')!);
    await flush();
    expect(screen.getByTestId('ev-sheet').textContent).toMatch(/exact/);
    fireEvent.click(screen.getByTestId('confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
    );
    evClient.dispose();
  });
  it('a preset flop hand shows both options with one best badge', async () => {
    const { evClient } = mount({
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'flop',
        deal: { player: ['Ah', '7c'], flop: ['7d', 'Ks', '2c'], dealer: ['9d', '9s'] },
      },
    });
    await waitFor(
      () => expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
      {
        timeout: 8000,
      },
    );
    expect(document.querySelectorAll('.is-best').length).toBe(1);
    evClient.dispose();
  });
  it('a worse option shows the better alternative in the sheet', async () => {
    const { evClient } = mount({
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'river',
        deal: {
          player: ['3c', '4d'],
          flop: ['Ah', 'Ks', 'Qd'],
          turn: '9c',
          river: '7h',
          dealer: ['Td', 'Ts'],
        },
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
    );
    fireEvent.click(document.querySelector('[data-option="play-1"]')!);
    await waitFor(() => expect(screen.getByTestId('alternative')).toBeTruthy());
    evClient.dispose();
  });
  it('a scene step refuses the wrong move with its hint and no retry button', async () => {
    const scene: SceneConfig = {
      id: 'x',
      version: 1,
      showEV: false,
      steps: [
        {
          id: 'a',
          text: 'Bet **4x**.',
          hint: 'Use the Bet 4x button.',
          startAt: { street: 'preflop', deal: { player: ['As', 'Ad'] } },
          allowedActions: ['check', 'play'],
          expect: [{ type: 'play', option: 'play-4' }],
          completeWhen: { street: 'settled' },
        },
      ],
    };
    const { evClient } = mount(scene);
    await flush();
    fireEvent.click(document.querySelector('[data-option="check"]')!);
    await waitFor(() =>
      expect(screen.getByTestId('step-hint').textContent).toMatch(/Bet 4x button/),
    );
    expect(screen.queryByText(/try again/i)).toBeNull();
    fireEvent.click(document.querySelector('[data-option="play-4"]')!);
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
    );
    evClient.dispose();
  });
});
