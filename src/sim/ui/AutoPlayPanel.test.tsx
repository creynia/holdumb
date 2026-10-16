import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { AutoPlayPanel } from './AutoPlayPanel';
import { DEFAULT_SIM_SETTINGS } from './types';

afterEach(cleanup);
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

describe('AutoPlayPanel layout', () => {
  it('keeps its grid and controls shrinkable (no overflow at 390 px)', () => {
    const evClient = createEvClient({ mode: 'inthread' });
    const { container } = render(
      <AutoPlayPanel evClient={evClient} settings={DEFAULT_SIM_SETTINGS} />,
    );
    const grid = container.querySelector('section > div') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    for (const el of container.querySelectorAll<HTMLElement>('input[type=number], select')) {
      expect(el.style.width).toBe('100%');
      expect(el.style.minWidth).toBe('0px');
      expect(el.style.boxSizing).toBe('border-box');
    }
    evClient.dispose();
  });
  it('honours scene hand and session options', () => {
    const evClient = createEvClient({ mode: 'inthread' });
    render(
      <AutoPlayPanel
        evClient={evClient}
        settings={DEFAULT_SIM_SETTINGS}
        handOptions={[30]}
        sessionOptions={[100]}
      />,
    );
    expect(screen.getAllByRole('option').filter((o) => o.textContent === '30')).toHaveLength(1);
    expect(screen.queryByText('3,000')).toBeNull();
    evClient.dispose();
  });
});
