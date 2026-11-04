import { describe, expect, it } from 'vitest';
import { compareHands, evaluate7 } from '../engine';
import { DEFAULT_RULES, settleHand } from '../engine';
import { seedRng } from '../engine/rng';
import {
  SHOWDOWN_KINDS,
  gradeShowdown,
  nextShowdownSpot,
  showdownCode,
  showdownFromCode,
  showdownKindOf,
  showdownTruth,
} from './showdown';

function spots(n: number, seed: number, teaching = false) {
  let r = seedRng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [s, next] = nextShowdownSpot(r, { teaching });
    r = next;
    out.push(s);
  }
  return out;
}

describe('showdown drill (I061)', () => {
  it('50 seeded spots: the answers match the engine settleHand and the evaluator', () => {
    for (const spot of spots(50, 61, true)) {
      const t = showdownTruth(spot);
      const bets = { ante: 1000, blind: 1000, trips: 0 };
      const deal = { player: spot.hole, dealer: spot.dealer, board: spot.board, forced: false };
      const r = settleHand(deal, bets, { multiple: 1 }, false, DEFAULT_RULES);
      const p = evaluate7([...spot.hole, ...spot.board]);
      const d = evaluate7([...spot.dealer, ...spot.board]);
      const cmp = compareHands(p, d);
      expect(t.winner).toBe(cmp > 0 ? 'you' : cmp < 0 ? 'dealer' : 'tie');
      expect(t.qualifies).toBe(d.category !== 'high-card');
      expect(t.qualifies).toBe(r.dealerQualifies);
      const blind = r.wagers.find((w) => w.wager === 'blind')!;
      expect(t.blind).toBe(blind.profit > 0 ? 'pays' : blind.profit < 0 ? 'loses' : 'pushes');
      // The Blind pays exactly when you win with a straight or better.
      const straightUp = [
        'straight',
        'flush',
        'full-house',
        'quads',
        'straight-flush',
        'royal-flush',
      ];
      expect(t.blind === 'pays').toBe(cmp > 0 && straightUp.includes(p.category));
    }
  });
  it('is seeded: the same seed gives the same deals, another seed different ones', () => {
    expect(spots(10, 5).map((s) => s.code)).toEqual(spots(10, 5).map((s) => s.code));
    expect(spots(10, 5).map((s) => s.code)).not.toEqual(spots(10, 6).map((s) => s.code));
  });
  it('a spot code round-trips and rejects junk and duplicates', () => {
    const s = showdownFromCode('s:AhKd.QsJc9h2d3c.7s7d');
    expect(showdownCode(s)).toBe('s:AhKd.QsJc9h2d3c.7s7d');
    expect(s.hole).toHaveLength(2);
    expect(s.board).toHaveLength(5);
    expect(() => showdownFromCode('s:AhKd.QsJc9h2d.7s7d')).toThrow();
    expect(() => showdownFromCode('s:AhKd.QsJc9h2dAh.7s7d')).toThrow();
    expect(() => showdownFromCode('nonsense')).toThrow();
    for (const sp of spots(20, 9)) expect(showdownFromCode(sp.code).code).toBe(sp.code);
  });
  it('pinned answers: kicker win, board plays, dealer not qualifying, Blind under a straight', () => {
    // Pair of kings, ace kicker beats pair of kings, queen kicker.
    let t = showdownTruth(showdownFromCode('s:KdAc.Ks7h4c2d9s.KhQc'));
    expect([t.winner, t.qualifies, t.blind]).toEqual(['you', true, 'pushes']);
    // Both play the board (a straight on it): tie, Blind pushes.
    t = showdownTruth(showdownFromCode('s:2c3c.9h8d7s6c5h.Jd2d'));
    expect([t.winner, t.qualifies, t.blind]).toEqual(['tie', true, 'pushes']);
    // Dealer holds king high only: does not qualify; you win with a pair.
    t = showdownTruth(showdownFromCode('s:7c7d.Kh9s4c2d3h.Ad6s'));
    expect(t.qualifies).toBe(false);
    expect(t.winner).toBe('you');
    // A straight wins and the Blind pays.
    t = showdownTruth(showdownFromCode('s:9c8d.7h6s5c2d3h.AdKs'));
    expect([t.winner, t.blind]).toEqual(['you', 'pays']);
    // Losing: the Blind loses.
    t = showdownTruth(showdownFromCode('s:2c3d.AhAs9c7d4h.KdQs'));
    expect([t.winner, t.blind]).toEqual(['dealer', 'loses']);
  });
  it('grades each question on its own', () => {
    const s = showdownFromCode('s:KdAc.Ks7h4c2d9s.KhQc');
    expect(gradeShowdown(s, { winner: 'you', qualifies: true, blind: 'pushes' })).toEqual({
      winner: true,
      qualifies: true,
      blind: true,
      all: true,
    });
    expect(gradeShowdown(s, { winner: 'tie', qualifies: true, blind: 'pays' })).toMatchObject({
      winner: false,
      qualifies: true,
      blind: false,
      all: false,
    });
    expect(gradeShowdown(s, {}).all).toBe(false);
  });
  it('every teaching kind can be asked for, and about half the teaching spots are one', () => {
    for (const kind of SHOWDOWN_KINDS) {
      let r = seedRng(77);
      for (let i = 0; i < 6; i++) {
        const [s, next] = nextShowdownSpot(r, { kind });
        r = next;
        expect(showdownKindOf(s, kind), kind).toBe(true);
      }
    }
    const sample = spots(400, 123, true);
    const teaching = sample.filter((s) => SHOWDOWN_KINDS.some((k) => showdownKindOf(s, k))).length;
    // Half are drawn as a kind; plain random deals add a few more by chance (not-qualified is common).
    expect(teaching / sample.length).toBeGreaterThan(0.45);
    expect(teaching / sample.length).toBeLessThan(0.85);
  });
  describe('each teaching-kind predicate', () => {
    const is = (code: string, kind: (typeof SHOWDOWN_KINDS)[number]) =>
      showdownKindOf(showdownFromCode(code), kind);
    it('kicker: same category decided below the pair, not a tie, not a different category', () => {
      expect(is('s:KdAc.Ks7h4c2d9s.KhQc', 'kicker')).toBe(true); // pair of kings, ace vs queen kicker
      expect(is('s:7c7d.Kh9s4c2d3h.Ad6s', 'kicker')).toBe(false); // pair against ace high
      expect(is('s:2c3c.9h8d7s6c5h.Jd2d', 'kicker')).toBe(false); // a tie
      expect(is('s:9c8d.7h6s5c2d3h.AdKs', 'kicker')).toBe(false); // straight against ace high
    });
    it('board-plays: both hands are the same five board cards', () => {
      expect(is('s:2c3c.9h8d7s6c5h.Jd2d', 'board-plays')).toBe(true);
      expect(is('s:KdAc.Ks7h4c2d9s.KhQc', 'board-plays')).toBe(false); // you win on a kicker
      expect(is('s:9c8d.7h6s5c2d3h.AdKs', 'board-plays')).toBe(false); // your hole cards play
    });
    it('not-qualified: the dealer has nothing better than high card', () => {
      expect(is('s:7c7d.Kh9s4c2d3h.Ad6s', 'not-qualified')).toBe(true);
      expect(is('s:KdAc.Ks7h4c2d9s.KhQc', 'not-qualified')).toBe(false);
      expect(is('s:2c3c.9h8d7s6c5h.Jd2d', 'not-qualified')).toBe(false); // the dealer plays a straight
    });
    it('blind-straight: a win with a straight or better, and nothing weaker', () => {
      expect(is('s:9c8d.7h6s5c2d3h.AdKs', 'blind-straight')).toBe(true);
      expect(is('s:KdAc.Ks7h4c2d9s.KhQc', 'blind-straight')).toBe(false); // wins, but with a pair
      expect(is('s:7c7d.Kh9s4c2d3h.Ad6s', 'blind-straight')).toBe(false); // wins with a pair
      expect(is('s:9c8d.7h6s5c2d3h.9s8s', 'blind-straight')).toBe(false); // the same straight: a tie
      expect(is('s:2c3d.AhAs9c7d4h.KdQs', 'blind-straight')).toBe(false); // loses
    });
  });
});
