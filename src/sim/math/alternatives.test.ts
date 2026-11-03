import { describe, expect, it } from 'vitest';
import { cardCode, parseCards } from '../engine/cards';
import { handValueOf } from '../engine/evaluator';
import { seedRng, shuffle } from '../engine/rng';
import type { Card } from '../engine/types';
import { RIVER_UNSEEN, groupOuts, riverFacts } from './alternatives';

const hb = (h: string, b: string): [[Card, Card], Card[]] => [
  parseCards(h) as [Card, Card],
  parseCards(b),
];

/** Every k-subset of `cards`. */
// (outCards order: highest rank first; inside a rank clubs, diamonds, hearts, spades.)
function subsets(cards: readonly Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (cards.length < k) return [];
  const [first, ...rest] = cards as [Card, ...Card[]];
  return [...subsets(rest, k - 1).map((s) => [first, ...s]), ...subsets(rest, k)];
}
/** Best five of a hand, as a maximum over explicit five-card subsets (independent of the 7-card path). */
const bestFive = (cards: readonly Card[]): number =>
  Math.max(...subsets(cards, 5).map((five) => handValueOf(five)));

/** decisions.md section 3 "Dealer outs", recounted by brute force over the 45 unseen cards. */
function recountOuts(hole: readonly [Card, Card], board: readonly Card[]): Card[] {
  const mine = bestFive([...hole, ...board]);
  const seen = new Set<Card>([...hole, ...board]);
  const outs: Card[] = [];
  for (let c = 0; c < 52; c++) {
    if (!seen.has(c) && bestFive([...board, c]) > mine) outs.push(c);
  }
  return outs;
}

describe('riverFacts dealer outs (decisions.md section 3, curriculum lesson 12)', () => {
  it.each([
    ['Qc 7d', 'Kd Jh 9s 5c 2d', 19, 'play'],
    ['Jc 9d', '8s 8h 5c 3d 2s', 23, 'fold'],
    ['8c 6d', 'Kh Qs 4d 3c 2h', 31, 'fold'],
    ['Jd 8c', 'Kh Qs 4d 3c 2h', 19, 'play'],
    ['2c 4h', 'Qc Qh Kh Qs 9d', 19, 'play'],
  ])('%s on %s has %i outs: %s', (h, b, outs, basic) => {
    const f = riverFacts(...hb(h, b));
    expect(f.outs).toBe(outs);
    expect(f.outCards).toHaveLength(outs);
    expect(f.hidden).toBe(false);
    expect(f.basicAction).toBe(basic);
    expect(new Set(f.outCards).size).toBe(outs);
  });

  it('lists the outs highest rank first, equal ranks together, in all 45 unseen cards', () => {
    const [hole, board] = hb('Qc 7d', 'Kd Jh 9s 5c 2d');
    const f = riverFacts(hole, board);
    expect(f.outCards.map(cardCode)).toEqual([
      ...['Ac', 'Ad', 'Ah', 'As'],
      ...['Kc', 'Kh', 'Ks'],
      ...['Jc', 'Jd', 'Js'],
      ...['9c', '9d', '9h'],
      ...['5d', '5h', '5s'],
      ...['2c', '2h', '2s'],
    ]);
    const seen = new Set([...hole, ...board]);
    expect(f.outCards.some((c) => seen.has(c))).toBe(false);
    expect(RIVER_UNSEEN).toBe(52 - seen.size);
  });

  it('a hidden pair can still have outs, and the board can play with none', () => {
    let f = riverFacts(...hb('Td 4c', 'Ts Kh 7d 3s 2c'));
    expect(f.hidden).toBe(true);
    expect(f.outCards.map(cardCode)).toEqual(['Kc', 'Kd', 'Ks']);
    f = riverFacts(...hb('4c 3d', 'As Ks Qs Jd Th'));
    expect(f.boardPlays).toBe(true);
    expect(f.outs).toBe(0);
    expect(f.outCards).toEqual([]);
  });

  it('matches a brute-force recount over five-card subsets on 400 random deals', () => {
    let r = seedRng(57);
    let deck: Card[];
    for (let i = 0; i < 400; i++) {
      [deck, r] = shuffle(
        r,
        Array.from({ length: 52 }, (_, k) => k),
      );
      const hole: [Card, Card] = [deck[0]!, deck[1]!];
      const board = deck.slice(2, 7);
      const f = riverFacts(hole, board);
      const brute = recountOuts(hole, board);
      expect([...f.outCards].sort((a, b) => a - b)).toEqual(brute);
      expect(f.outs).toBe(brute.length);
    }
  });
});

describe('groupOuts', () => {
  it('groups by rank, highest first, and knows when every unseen card of a rank is an out', () => {
    const [hole, board] = hb('Jc 9d', '8s 8h 5c 3d 2s');
    const f = riverFacts(hole, board);
    const g = groupOuts(f.outCards, hole, board);
    expect(g.map((x) => [x.rank, x.cards.length, x.all])).toEqual([
      [12, 4, true],
      [11, 4, true],
      [10, 4, true],
      [6, 2, true], // the last two eights
      [3, 3, true],
      [1, 3, true],
      [0, 3, true],
    ]);
    expect(g.reduce((n, x) => n + x.cards.length, 0)).toBe(23);
  });

  it('marks a rank partial when only some of its unseen cards beat you (a flush out)', () => {
    const [hole, board] = hb('6d 5s', 'Kh 6h 8h 7c Qh');
    const f = riverFacts(hole, board);
    expect(f.hidden).toBe(true);
    expect(f.outs).toBe(20);
    const g = groupOuts(f.outCards, hole, board);
    const ace = g.find((x) => x.rank === 12)!;
    expect(ace.all).toBe(false);
    expect(ace.cards.map(cardCode)).toEqual(['Ah']);
    const kings = g.find((x) => x.rank === 11)!;
    expect(kings.all).toBe(true);
    expect(kings.cards).toHaveLength(3);
  });

  it('is empty with no outs', () => {
    const [hole, board] = hb('4c 3d', 'As Ks Qs Jd Th');
    expect(groupOuts([], hole, board)).toEqual([]);
  });
});
