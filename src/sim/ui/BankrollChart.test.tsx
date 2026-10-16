import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { simulateJob } from '../strategy/simulate';
import type { SimulateRequest } from '../strategy/types';
import { BankrollChart } from './BankrollChart';
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

describe('charts', () => {
  it('draws a line for one session and a band + survival for many', () => {
    const one = render(<BankrollChart series={run(1)} bankroll={100_000} hands={60} />);
    expect(one.queryByTestId('band')).toBeNull();
    one.unmount();
    render(<BankrollChart series={run(20)} bankroll={100_000} hands={60} />);
    expect(screen.getByTestId('band')).toBeTruthy();
    expect(screen.getByTestId('survival')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('basic');
  });
  it('histogram sums to the hands played', () => {
    const s = run(1)[0]!;
    render(<OutcomeHistogram series={s} />);
    expect(screen.getByTestId('outcome-histogram').textContent).toContain('Win');
  });
});
