import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { AutoPlayPanel } from './AutoPlayPanel';
import { DEFAULT_SIM_SETTINGS } from './types';

describe('AutoPlayPanel', () => {
  it('runs one hour and shows exact and simulated figures', async () => {
    const evClient = createEvClient({ mode: 'inthread' });
    let done = 0;
    render(
      <AutoPlayPanel
        evClient={evClient}
        settings={DEFAULT_SIM_SETTINGS}
        onEvent={(e) => {
          if (e.type === 'auto-play-completed') done++;
        }}
      />,
    );
    expect(screen.getByText(/per hour at/).textContent).toContain('house edge');
    fireEvent.click(screen.getByText('Run'));
    await waitFor(() => expect(screen.getByTestId('auto-play-result')).toBeTruthy(), {
      timeout: 10_000,
    });
    expect(screen.getByText(/Luck:/)).toBeTruthy();
    expect(done).toBe(1);
    evClient.dispose();
  });
});
