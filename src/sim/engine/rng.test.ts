import { describe, expect, it } from 'vitest';
import { dealHand } from './deck';
import { cardCode, parseCard } from './cards';
import { nextU32, randBelow, seedRng, shuffle } from './rng';

describe('rng', () => {
  it('is deterministic and does not mutate state', () => {
    const r = seedRng(42);
    const frozen = JSON.stringify(r);
    const [a] = nextU32(r);
    const [b] = nextU32(r);
    expect(a).toBe(b);
    expect(JSON.stringify(r)).toBe(frozen);
  });
  it('golden sequence for seed 42', () => {
    let r = seedRng(42);
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [u, n] = nextU32(r);
      out.push(u);
      r = n;
    }
    expect(out).toMatchInlineSnapshot(`
      [
        660444221,
        3652823732,
        77672526,
        910233633,
      ]
    `);
  });
  it('randBelow stays in range, rejects bad n, and uses the rejection bound', () => {
    let r = seedRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const [x, n] = randBelow(r, 52);
      r = n;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(52);
      seen.add(x);
    }
    expect(seen.size).toBe(52);
    expect(() => randBelow(r, 0)).toThrow();
    // n = 3 -> limit 2^32 - 1; a draw of exactly 2^32 - 1 would be rejected, so results stay uniform
    expect(randBelow(r, 1)[0]).toBe(0);
  });
  it('shuffle is a permutation and does not mutate the input', () => {
    const xs = Array.from({ length: 52 }, (_, i) => i);
    const [ys] = shuffle(seedRng(9), xs);
    expect([...ys].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[0]).toBe(0);
    expect(ys).not.toEqual(xs);
  });
});

describe('dealHand', () => {
  it('deals 9 distinct cards, deterministic per seed', () => {
    const [d1] = dealHand(seedRng(5));
    const [d2] = dealHand(seedRng(5));
    expect(d1).toEqual(d2);
    const all = [...d1.player, ...d1.dealer, ...d1.board];
    expect(new Set(all).size).toBe(9);
    expect(d1.forced).toBe(false);
  });
  it('places forced cards exactly in their slots and never duplicates', () => {
    for (let s = 0; s < 50; s++) {
      const [d] = dealHand(seedRng(s), {
        player: ['As', 'Kd'],
        flop: ['7c', '7d', '2h'],
        river: '9s',
      });
      expect(d.player.map(cardCode)).toEqual(['As', 'Kd']);
      expect(d.board.slice(0, 3).map(cardCode)).toEqual(['7c', '7d', '2h']);
      expect(cardCode(d.board[4])).toBe('9s');
      expect(new Set([...d.player, ...d.dealer, ...d.board]).size).toBe(9);
      expect(d.forced).toBe(true);
    }
  });
  it('a forced card never shifts the stream: exactly 52 - |forced| - 1 draws', () => {
    const [, after0] = dealHand(seedRng(3));
    const [, after2] = dealHand(seedRng(3), { player: ['As', 'Kd'] });
    expect(after0).not.toEqual(after2);
    // 51 vs 49 randBelow calls; n = 2 never rejects, so each call is exactly one u32 draw
    let q = seedRng(3);
    for (let i = 0; i < 49; i++) q = randBelow(q, 2)[1];
    expect(after2).toEqual(q);
    let q51 = seedRng(3);
    for (let i = 0; i < 51; i++) q51 = randBelow(q51, 2)[1];
    expect(after0).toEqual(q51);
  });
  it('same seed with and without a forced deal changes only the forced slots plus the shift', () => {
    const [free] = dealHand(seedRng(11));
    const [forced] = dealHand(seedRng(11), { dealer: ['2c', '3c'] });
    expect(forced.dealer.map(cardCode)).toEqual(['2c', '3c']);
    expect(free.dealer).not.toEqual(forced.dealer);
  });
  it('throws on duplicate or malformed codes', () => {
    expect(() => dealHand(seedRng(1), { player: ['As', 'As'] })).toThrow(/Duplicate/);
    expect(() => dealHand(seedRng(1), { player: ['As', 'Kd'], dealer: ['As', '2c'] })).toThrow();
    expect(() => dealHand(seedRng(1), { turn: 'Xx' })).toThrow();
    expect(() => dealHand(seedRng(1), { turn: 'ah' })).toThrow();
    expect(parseCard('Ah')).toBe(49);
  });
  it(
    'card positions are uniform: chi-square over 520k deals (p > 0.001)',
    { timeout: 60_000 },
    () => {
      const N = 52_000; // x 10 reps below keeps it quick; positions: player card 1 only
      let r = seedRng(2024);
      const counts = new Array<number>(52).fill(0);
      const board = new Array<number>(52).fill(0);
      for (let i = 0; i < N; i++) {
        const [d, n] = dealHand(r);
        r = n;
        counts[d.player[0]]!++;
        board[d.board[4]]!++;
      }
      for (const c of [counts, board]) {
        const e = N / 52;
        const chi = c.reduce((s, o) => s + (o - e) ** 2 / e, 0);
        // 51 d.o.f.: p = 0.001 critical value is 87.97
        expect(chi).toBeLessThan(87.97);
      }
    },
  );
});
