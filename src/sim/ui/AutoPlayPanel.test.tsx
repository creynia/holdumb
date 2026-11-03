import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { AutoPlayPanel, alwaysMaxNote, shownNet } from './AutoPlayPanel';
import { strategyMetrics } from '../strategy/metrics';
import { fracToNumber } from '../strategy/fraction';
import { DEFAULT_SIM_SETTINGS } from './types';
// The Six Card rules load with the (lazy) Six Card UI; the in-thread client needs them registered.
import '../scene/sixcard';

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
  const costText = () => screen.getByTestId('auto-play-cost').textContent ?? '';

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
    expect(rows).toEqual([
      ['Expert', '2.27%', '-$6.81', '+$0.26'],
      ['Basic', '2.38%', '-$7.14', '+$0.59'],
    ]);
    evClient.dispose();
  });
});

describe('always bet 4x versus never fold', () => {
  const spec = (id: 'never-fold' | 'always-max') => ({ id, ante: 1000, trips: 0 });
  const rules = { tripsPaytable: 'trips-8-6-5' } as never;

  it('the note names the same loss per hand and the two elements of risk', () => {
    const note = alwaysMaxNote(spec('always-max'), rules, 30);
    expect(note).toContain('Same expected loss per hand as Never fold (40.70% of the Ante)');
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

describe('strategy note under the select', () => {
  it('shows for always bet 4x and not for the other strategies', () => {
    const evClient = createEvClient({ mode: 'inthread' });
    render(
      <AutoPlayPanel evClient={evClient} settings={DEFAULT_SIM_SETTINGS} onEvent={() => {}} />,
    );
    const select = screen.getByRole('combobox', { name: 'Strategy' });
    expect(screen.queryByTestId('strategy-note')).toBeNull();
    fireEvent.change(select, { target: { value: 'always-max' } });
    expect(screen.getByTestId('strategy-note').textContent).toContain(
      'Same expected loss per hand',
    );
    fireEvent.change(select, { target: { value: 'never-fold' } });
    expect(screen.queryByTestId('strategy-note')).toBeNull();
    evClient.dispose();
  });
});

describe('AutoPlayPanel with the Six Card Bonus on (I062)', () => {
  it("sends the table's Six Card setting and counts it in the summary and the exact figure", async () => {
    const inner = createEvClient({ mode: 'inthread' });
    const sent: unknown[] = [];
    const evClient: typeof inner = {
      ...inner,
      run: ((kind: string, req: unknown, o: unknown) => {
        if (kind === 'simulate') sent.push(req);
        return (inner.run as (k: string, r: unknown, o: unknown) => Promise<unknown>)(kind, req, o);
      }) as typeof inner.run,
    };
    render(
      <AutoPlayPanel
        evClient={evClient}
        settings={DEFAULT_SIM_SETTINGS}
        sixCard={{ bet: 500, paytable: 'six-card-1000-200-100' }}
      />,
    );
    fireEvent.click(screen.getByText('Run'));
    await waitFor(() => expect(screen.getByTestId('auto-play-result')).toBeTruthy(), {
      timeout: 10_000,
    });
    expect(sent).toHaveLength(1);
    expect((sent[0] as { sixCard?: unknown }).sixCard).toEqual({
      bet: 500,
      paytable: 'six-card-1000-200-100',
    });
    // 30 hands at $5 with a $500 rack and a $10 Ante: every bet is taken.
    const line = screen.getByTestId('auto-play-six-card').textContent;
    expect(line).toMatch(/^Six Card: 30 bets, \$150 wagered, net [+−-]?\$[\d,.]+, \d+ paid$/);
    // Expected (exact) = main game + −edge × wagered: 30 × perHand − 150 × 12816/149695 × 100¢.
    const main = strategyMetrics(
      { id: 'expert', ante: 1000, trips: 0 },
      { tripsPaytable: DEFAULT_SIM_SETTINGS.paytable },
      DEFAULT_SIM_SETTINGS.handsPerHour,
    );
    const perHand = fracToNumber(main.evPerHourCents) / DEFAULT_SIM_SETTINGS.handsPerHour;
    const want = Math.round(30 * perHand - (15_000 * 12816) / 149695);
    const shown = screen.getByText(/Expected result \(exact\):/).textContent;
    const cents = Math.round(Number(shown.replace(/[^\d.]/g, '')) * 100);
    expect(shown).toMatch(/[-−]\$/);
    expect(cents).toBe(-want);
    inner.dispose();
  });

  it('with no Six Card setting the request carries no sixCard and no line shows', async () => {
    const inner = createEvClient({ mode: 'inthread' });
    const sent: unknown[] = [];
    const evClient: typeof inner = {
      ...inner,
      run: ((kind: string, req: unknown, o: unknown) => {
        if (kind === 'simulate') sent.push(req);
        return (inner.run as (k: string, r: unknown, o: unknown) => Promise<unknown>)(kind, req, o);
      }) as typeof inner.run,
    };
    render(<AutoPlayPanel evClient={evClient} settings={DEFAULT_SIM_SETTINGS} sixCard={null} />);
    fireEvent.click(screen.getByText('Run'));
    await waitFor(() => expect(screen.getByTestId('auto-play-result')).toBeTruthy(), {
      timeout: 10_000,
    });
    expect('sixCard' in (sent[0] as object)).toBe(false);
    expect(screen.queryByTestId('auto-play-six-card')).toBeNull();
    inner.dispose();
  });
});
