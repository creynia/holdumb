import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { AutoPlayPanel, shownNet } from './AutoPlayPanel';
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

describe('AutoPlayPanel cost vs perfect and compare table (I022)', () => {
  const setup = (settings = DEFAULT_SIM_SETTINGS) => {
    const evClient = createEvClient({ mode: 'inthread' });
    const r = render(<AutoPlayPanel evClient={evClient} settings={settings} />);
    return { evClient, ...r };
  };
  const pick = (id: string) =>
    fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: id } });
  const costText = () => screen.getByTestId('auto-play-cost').textContent!;

  it('matches decisions section 4 at $10 and 30 hands an hour', () => {
    const { evClient } = setup();
    expect(costText()).toContain('Costs $0.26 an hour more than perfect play');
    pick('basic');
    expect(costText()).toContain('Costs $0.59 an hour more than perfect play');
    pick('simple');
    expect(costText()).toContain('Costs $1.57 an hour more than perfect play');
    evClient.dispose();
  });

  it('shows the element of risk with a glossary link', () => {
    const { evClient } = setup();
    pick('basic');
    const link = screen.getByRole('link', { name: 'Element of risk' });
    expect(link.getAttribute('href')).toBe('#/glossary?term=element-of-risk');
    expect(costText()).toMatch(/Element of risk \d\.\d\d%\./);
    evClient.dispose();
  });

  it('follows the ante and the hands per hour', () => {
    const { evClient } = setup({ ...DEFAULT_SIM_SETTINGS, handsPerHour: 60 });
    pick('basic');
    expect(costText()).toContain('$1.18 an hour'); // 2 x $0.59
    fireEvent.input(screen.getByLabelText('Ante ($)'), { target: { value: '5' } });
    expect(costText()).toContain('$0.59 an hour'); // half the ante, twice the hands
    evClient.dispose();
  });

  it('Compare lists every strategy exactly, lowest edge first', () => {
    const { evClient } = setup();
    expect(screen.queryByTestId('auto-play-compare')).toBeNull();
    pick('basic');
    fireEvent.click(screen.getByLabelText('Compare (same cards)'));
    const rows = [...screen.getByTestId('auto-play-compare').querySelectorAll('tbody tr')].map(
      (tr) => [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual(
      [
        ['Expert', '2.27%', '-$6.81', '+$0.26'],
        ['Basic', '2.38%', '-$7.14', '+$0.59'],
      ].map((r) => [r[0], r[1], expect.any(String), r[3]]),
    );
    evClient.dispose();
  });
});
