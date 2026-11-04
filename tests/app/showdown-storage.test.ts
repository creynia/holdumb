import { describe, expect, it } from 'vitest';
import { emptyShowdown, sanitize } from '../../src/app/storage';

const withShowdown = (showdown: unknown) =>
  sanitize({ version: 1, lessons: {}, settings: {}, drill: { showdown } })!.drill.showdown;

describe('showdown stats sanitizing (I061)', () => {
  it('keeps good counts as they are', () => {
    const good = {
      winner: { answered: 4, correct: 3 },
      qualifies: { answered: 4, correct: 4 },
      blind: { answered: 4, correct: 1 },
      spots: 4,
      allRight: 1,
    };
    expect(withShowdown(good)).toEqual(good);
  });
  it('clamps allRight to spots, and each correct to its answered', () => {
    const s = withShowdown({
      winner: { answered: 2, correct: 99 },
      qualifies: { answered: 0, correct: 5 },
      blind: { answered: 3, correct: -4 },
      spots: 3,
      allRight: 99,
    });
    expect(s.allRight).toBe(3);
    expect(s.winner).toEqual({ answered: 2, correct: 2 });
    expect(s.qualifies).toEqual({ answered: 0, correct: 0 });
    expect(s.blind).toEqual({ answered: 3, correct: 0 });
  });
  it('falls back to empty for missing or junk data, and old saves without it load', () => {
    expect(withShowdown(undefined)).toEqual(emptyShowdown());
    expect(withShowdown('nope')).toEqual(emptyShowdown());
    expect(withShowdown({ spots: 'x', allRight: NaN })).toEqual(emptyShowdown());
  });
});
