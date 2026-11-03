import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { simulateJob } from '../strategy/simulate';
import type { SimulateRequest } from '../strategy/types';
import { BankrollChart, niceTicks } from './BankrollChart';
import { OutcomeHistogram } from './OutcomeHistogram';

function run(sessions: number) {
  const req: SimulateRequest = {
    strategy: { id: 'basic', ante: 1000, trips: 500 },
    hands: 60,
    sessions,
    seed: 1,
    bankroll: 100_000,
  };
  const g = simulateJob(req);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value.series;
  }
}

afterEach(cleanup);
describe('charts', () => {
  it('draws a line for one session and a band + survival for many', () => {
    const one = render(<BankrollChart series={run(1)} bankroll={100_000} hands={60} />);
    expect(one.queryByTestId('band')).toBeNull();
    one.unmount();
    render(<BankrollChart series={run(20)} bankroll={100_000} hands={60} />);
    expect(screen.getByTestId('band')).toBeTruthy();
    expect(screen.getByTestId('survival')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Basic');
  });
  it('histogram sums to the hands played', () => {
    const s = run(1)[0]!;
    render(<OutcomeHistogram series={s} />);
    expect(screen.getByTestId('outcome-histogram').textContent).toContain('Win');
  });
});

describe('compare legend', () => {
  it('names every series in text', () => {
    const a = run(1)[0]!;
    const b = { ...a, strategy: { ...a.strategy, id: 'expert' as const } };
    render(<BankrollChart series={[a, b]} bankroll={100_000} hands={60} />);
    const legend = screen.getByTestId('legend').textContent;
    expect(legend).toContain('Basic');
    expect(legend).toContain('Expert');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Expert');
  });
  describe('niceTicks', () => {
    const round = (v: number): boolean => {
      if (v === 0) return true;
      const m = Math.abs(v) / 10 ** Math.floor(Math.log10(Math.abs(v)));
      return [1, 2, 5].some((k) => Math.abs(m - k) < 1e-9) || Number.isInteger(v / 10);
    };
    for (const [lo, hi, start] of [
      [360, 645, 500],
      [-1771, 3640, 1000],
      [0, 100000, 0],
    ] as const) {
      it(`(${lo}..${hi}) is round, has start, <= 5`, () => {
        const t = niceTicks(lo, hi, start);
        expect(t.length).toBeLessThanOrEqual(5);
        expect(t.length).toBeGreaterThanOrEqual(3);
        expect(t).toContain(start);
        for (const v of t) {
          expect(v).toBeGreaterThanOrEqual(lo);
          expect(v).toBeLessThanOrEqual(hi);
          expect(Number.isInteger(v)).toBe(true);
          if (v !== start) expect(round(v)).toBe(true);
        }
        if (lo < 0 && hi > 0) expect(t).toContain(0);
      });
    }
  });
  it('draws the $0 line iff the range crosses zero', () => {
    const mk = (equity: number[]) =>
      [
        {
          strategy: { id: 'basic', ante: 1000, trips: 0 },
          equity: Float64Array.from(equity),
          expected: Float64Array.from(equity.map(() => 100_000)),
        },
      ] as unknown as Parameters<typeof BankrollChart>[0]['series'];
    const a = render(
      <BankrollChart series={mk([100_000, -50_000])} bankroll={100_000} hands={2} />,
    );
    expect(a.queryByTestId('zero-line')).toBeTruthy();
    a.unmount();
    const b = render(<BankrollChart series={mk([100_000, 50_000])} bankroll={100_000} hands={2} />);
    expect(b.queryByTestId('zero-line')).toBeNull();
    b.unmount();
    const c = render(<BankrollChart series={mk([100_000, 0])} bankroll={100_000} hands={2} />);
    expect(c.queryByTestId('zero-line')).toBeNull();
  });
});
