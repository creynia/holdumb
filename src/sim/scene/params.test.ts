import { describe, expect, it } from 'vitest';
import { parsePlayParams } from './params';

const q = (s: string) => parsePlayParams(new URLSearchParams(s));

describe('parsePlayParams', () => {
  it('maps the documented presets', () => {
    const p = q(
      'seed=7&hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&strategy=basic&speed=instant',
    );
    expect(p.seed).toBe(7);
    expect(p.strategy).toBe('basic');
    expect(p.speed).toBe('instant');
    expect(p.startAt).toEqual({
      street: 'flop',
      deal: { player: ['Ah', 'Tc'], dealer: ['9d', '9s'], flop: ['7d', 'Ks', '2c'] },
    });
  });
  it('infers the street from the board and keeps later cards as future cards', () => {
    expect(q('hole=AsKd').startAt?.street).toBe('preflop');
    expect(q('hole=AsKd&board=2c3c4c5d6d').startAt?.street).toBe('river');
    const f = q('hole=AsKd&board=2c3c4c5d6d&street=flop').startAt!;
    expect(f.street).toBe('flop');
    expect(f.deal.turn).toBe('5d');
  });
  it('ignores malformed or inconsistent presets without throwing', () => {
    expect(q('hole=AsAs').startAt).toBeUndefined();
    expect(q('hole=AsKd&board=2c3c').startAt).toBeUndefined();
    expect(q('hole=AsKd&board=2c3c4c&street=river').startAt).toBeUndefined();
    expect(q('hole=AsKd&dealer=As9d').startAt).toBeUndefined();
    expect(q('hole=zz&seed=abc&strategy=nope&speed=warp')).toEqual({});
  });
});
