import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { AutoPlayPanel, alwaysMaxNote, shownNet } from './AutoPlayPanel';
import { strategyMetrics } from '../strategy/metrics';
import { fracToNumber } from '../strategy/fraction';
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

describe('shown net figures add up to the cent', () => {
  it('Expected + Luck equals Actual, including half-cent splits', () => {
    const pairs: Array<[number, number]> = [
      [1234.5, 2000.4],
      [-0.5, 0.5],
      [999.5, 1000.49],
      [-2500.5, -2499.5],
      [3.5, -3.5],
    ];
    for (const [exact, sim] of pairs) {
      const shown = shownNet(exact, sim);
      expect(shown.expected + shown.luck).toBe(shown.actual);
    }
    expect(shownNet(1234.5, 2000.4)).toEqual({ expected: 1235, actual: 2000, luck: 765 });
  });
});

describe('always bet 4x versus never fold', () => {
  const spec = (id: 'never-fold' | 'always-max') => ({ id, ante: 1000, trips: 0 });
  const rules = { tripsPaytable: 'trips-8-6-5' } as never;

  it('the note names the same loss per hand and the two elements of risk', () => {
    const note = alwaysMaxNote(spec('always-max'), rules, 30);
    expect(note).toContain('Same loss per hand as Never fold (40.70% of the Ante)');
    expect(note).toContain('a lower element of risk (6.78% vs 13.57%)');
    expect(note).not.toMatch(/you will lose/i);
  });

  it('the element of risk is exactly half, from fractions', () => {
    const never = strategyMetrics(spec('never-fold'), rules, 30).elementOfRisk;
    const always = strategyMetrics(spec('always-max'), rules, 30).elementOfRisk;
    // always = never / 2  <=>  always * 2 = never, cross-multiplied to stay exact
    expect(always.num * 2n * never.den).toBe(never.num * always.den);
  });

  it('the per-hour line is identical and pins to -$122.11 at $10 x 30 hands', () => {
    const a = strategyMetrics(spec('never-fold'), rules, 30).evPerHourCents;
    const b = strategyMetrics(spec('always-max'), rules, 30).evPerHourCents;
    expect(a.num * b.den).toBe(b.num * a.den);
    expect(Math.round(fracToNumber(b))).toBe(-12211);
  });
});
