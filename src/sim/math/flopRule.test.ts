import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine';
import { basicFlopRule } from './alternatives';

const rule = (hole: string, flop: string) => {
  const c = parseCards(`${hole} ${flop}`);
  return basicFlopRule([c[0]!, c[1]!], c.slice(2));
};

describe('basicFlopRule (curriculum 9.1 pinned spots)', () => {
  it('9s 7d on 9h Kc 2s: rule (b), a hidden pair of nines, bet 2x', () => {
    expect(rule('9s 7d', '9h Kc 2s')).toEqual({
      rule: 'b',
      raise: true,
      pocketPair: false,
      pairRank: '9',
    });
  });
  it('Qc 5d on Qs 5h 9d: rule (a), two pair', () => {
    expect(rule('Qc 5d', 'Qs 5h 9d')).toEqual({ rule: 'a', raise: true, made: 'two-pair' });
  });
  it('Th 4h on Jh 8h 2c: rule (c), four to a flush with a ten', () => {
    expect(rule('Th 4h', 'Jh 8h 2c')).toEqual({ rule: 'c', raise: true });
  });
  it('9h 4h on Jh 8h 2c: no rule, the flush draw has no ten or better', () => {
    expect(rule('9h 4h', 'Jh 8h 2c')).toEqual({ rule: null, raise: false, reason: 'flush-draw' });
  });
  it('2c 2d on 9s 7h 5c: no rule, pocket deuces never count as a hidden pair', () => {
    expect(rule('2c 2d', '9s 7h 5c')).toEqual({
      rule: null,
      raise: false,
      reason: 'pocket-deuces',
    });
  });
  it('2c 2d on 9s 9h 5c: two pair on a paired board is rule (a) (perfect play checks: a rare exception)', () => {
    // curriculum 9.2: "the basic card's rule (a) says 2x on a paired board"
    expect(rule('2c 2d', '9s 9h 5c')).toEqual({ rule: 'a', raise: true, made: 'two-pair' });
  });
  it('a pocket pair is "pocket", a set of deuces is rule (a) or (b) by the card order', () => {
    expect(rule('Kc Kd', '9s 7h 5c')).toEqual({
      rule: 'b',
      raise: true,
      pocketPair: true,
      pairRank: 'K',
    });
    expect(rule('2c 2d', '2s 7h 5c').rule).toBe('a'); // trips beat the flop's own category
  });
  it('no pair and no draw: nothing; the only pair on the board: board-pair', () => {
    expect(rule('Kc 3d', '8s 5h 2c').reason).toBe('nothing');
    expect(rule('9c 8d', 'Ks Kd 4c').reason).toBe('board-pair');
    expect(rule('9c 8d', 'Ts 7h 2c').reason).toBe('straight-draw');
  });
});
