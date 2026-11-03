// I063: the lesson 20 progressive calculator: exact edge, tier, cost per hour and break-even as the
// meter moves; the block parser's limits.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressiveBlock, progressiveLine } from '../../src/app/components/ProgressiveBlock';
import { parseProgressive } from '../../src/content/compile';

afterEach(cleanup);

describe('progressive calculator (I063)', () => {
  it('reads the exact figures of lesson 20 at $25k, $50k and $100k', () => {
    expect(progressiveLine(25_000)).toMatchObject({
      edge: 'House edge 39.6%',
      hour: '$1 a hand costs about $11.89 an hour',
    });
    expect(progressiveLine(50_000).hour).toBe('$1 a hand costs about $9.70 an hour');
    expect(progressiveLine(100_000)).toMatchObject({
      edge: 'House edge 17.7%',
      hour: '$1 a hand costs about $5.31 an hour',
    });
    expect(progressiveLine(160_000).vs).toBe('$530.53 below break-even');
  });

  it('crosses break-even between $160,530 and $160,531 (and says so near zero)', () => {
    expect(progressiveLine(161_000)).toMatchObject({
      // (161,000 − 3,050,080/19) × 19/6,497,400 = 0.137…%
      edge: 'Player edge 0.14%',
      vs: '$469.47 above break-even',
    });
    expect(progressiveLine(200_000).hour).toBe('$1 a hand earns about $3.46 an hour on average');
  });

  it('the slider moves the meter and every line with it', () => {
    render(<ProgressiveBlock block={{ meter: 50_000 }} />);
    expect(screen.getByTestId('progressive-meter').textContent).toBe('$50,000');
    expect(screen.getByTestId('progressive-edge').textContent).toMatch(
      /^House edge 32\.3% Avoid · \$1 a hand costs about \$9\.70 an hour\.$/,
    );
    expect(screen.getByTestId('progressive-vs').textContent).toMatch(/\$160,530\.53/);
    const slider = screen.getByTestId<HTMLInputElement>('progressive-slider');
    expect(slider.getAttribute('aria-valuetext')).toBe('$50,000: House edge 32.3%');
    fireEvent.input(slider, { target: { value: '200000' } });
    expect(screen.getByTestId('progressive-meter').textContent).toBe('$200,000');
    expect(screen.getByTestId('progressive-edge').textContent).toMatch(
      /^Player edge 11\.5% Free bet/,
    );
    expect(screen.getByTestId('progressive-vs').textContent).toMatch(
      /\$39,469\.47 above break-even/,
    );
  });

  it('parses the block: default $50,000, whole thousands from $10,000 to $300,000', () => {
    expect(parseProgressive('')).toEqual({ meter: 50_000 });
    expect(parseProgressive('meter: 120000')).toEqual({ meter: 120_000 });
    for (const bad of ['meter: 5000', 'meter: 300001', 'meter: 120500', 'meter: "50000"', '- 1'])
      expect(() => parseProgressive(bad)).toThrow(/progressive/);
  });
});
