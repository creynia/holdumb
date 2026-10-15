import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import {
  categoryOf,
  compareHands,
  describeHand,
  evalMasks,
  evaluate5,
  evaluate7,
  evaluateN,
  handValueOf,
} from './evaluator';
import { seedRng, nextU32 } from './rng';
import { HAND_CATEGORIES } from './types';
import { oracleCategory, oracleKey5, oracleKeyBest } from './__tests__/oracle';

const FIVE_COUNTS: Record<string, number> = {
  'royal-flush': 4,
  'straight-flush': 36,
  quads: 624,
  'full-house': 3744,
  flush: 5108,
  straight: 10200,
  trips: 54912,
  'two-pair': 123552,
  pair: 1098240,
  'high-card': 1302540,
};
const SEVEN_COUNTS: Record<string, number> = {
  'royal-flush': 4324,
  'straight-flush': 37260,
  quads: 224848,
  'full-house': 3473184,
  flush: 4047644,
  straight: 6180020,
  trips: 6461620,
  'two-pair': 31433400,
  pair: 58627800,
  'high-card': 23294460,
};

const v = (s: string): number => handValueOf(parseCards(s));
const cat = (s: string): string => evaluateN(parseCards(s)).category;

describe('evaluator: exhaustive 5-card', () => {
  it('matches every category count, 7,462 distinct values and the textbook oracle order', () => {
    const counts = new Array<number>(10).fill(0);
    const byKey = new Map<number, number>();
    let total = 0;
    const h = [0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 48; h[0]++)
      for (h[1] = h[0] + 1; h[1] < 49; h[1]++)
        for (h[2] = h[1] + 1; h[2] < 50; h[2]++)
          for (h[3] = h[2] + 1; h[3] < 51; h[3]++)
            for (h[4] = h[3] + 1; h[4] < 52; h[4]++) {
              total++;
              const value = handValueOf(h);
              const key = oracleKey5(h);
              counts[value >>> 20]!++;
              const prev = byKey.get(key);
              if (prev === undefined) byKey.set(key, value);
              else if (prev !== value) throw new Error(`oracle class ${key} split`);
            }
    expect(total).toBe(2_598_960);
    HAND_CATEGORIES.forEach((c, i) => expect(counts[i], c).toBe(FIVE_COUNTS[c]));
    expect(byKey.size).toBe(7462);
    // Order-isomorphism: sorted by the oracle key, our values strictly increase.
    const keys = [...byKey.keys()].sort((a, b) => a - b);
    for (let i = 1; i < keys.length; i++) {
      expect(byKey.get(keys[i]!)!).toBeGreaterThan(byKey.get(keys[i - 1]!)!);
    }
    // Distinct values are distinct (no two oracle classes share a value).
    expect(new Set(byKey.values()).size).toBe(7462);
  });
});

describe('evaluator: exhaustive 7-card', () => {
  // ~4 s: always on in CI (the core oracle); no env flag needed.
  it(
    'matches every category count and 4,824 distinct values over all 133,784,560 hands',
    { timeout: 180_000 },
    () => {
      const counts = new Array<number>(10).fill(0);
      const seen = new Uint8Array(10 << 20);
      const sm = [0, 0, 0, 0];
      let total = 0;
      for (let a = 0; a < 46; a++) {
        sm[a & 3]! |= 1 << (a >> 2);
        for (let b = a + 1; b < 47; b++) {
          const bb = 1 << (b >> 2);
          sm[b & 3]! |= bb;
          for (let c = b + 1; c < 48; c++) {
            const cb = 1 << (c >> 2);
            sm[c & 3]! |= cb;
            for (let d = c + 1; d < 49; d++) {
              const db = 1 << (d >> 2);
              sm[d & 3]! |= db;
              for (let e = d + 1; e < 50; e++) {
                const eb = 1 << (e >> 2);
                sm[e & 3]! |= eb;
                for (let f = e + 1; f < 51; f++) {
                  const fb = 1 << (f >> 2);
                  sm[f & 3]! |= fb;
                  const s0 = sm[0]!;
                  const s1 = sm[1]!;
                  const s2 = sm[2]!;
                  const s3 = sm[3]!;
                  for (let g = f + 1; g < 52; g++) {
                    const gb = 1 << (g >> 2);
                    let val: number;
                    switch (g & 3) {
                      case 0:
                        val = evalMasks(s0 | gb, s1, s2, s3);
                        break;
                      case 1:
                        val = evalMasks(s0, s1 | gb, s2, s3);
                        break;
                      case 2:
                        val = evalMasks(s0, s1, s2 | gb, s3);
                        break;
                      default:
                        val = evalMasks(s0, s1, s2, s3 | gb);
                    }
                    counts[val >>> 20]!++;
                    seen[val] = 1;
                    total++;
                  }
                  sm[f & 3]! &= ~fb;
                }
                sm[e & 3]! &= ~eb;
              }
              sm[d & 3]! &= ~db;
            }
            sm[c & 3]! &= ~cb;
          }
          sm[b & 3]! &= ~bb;
        }
        sm[a & 3]! &= ~(1 << (a >> 2));
      }
      expect(total).toBe(133_784_560);
      HAND_CATEGORIES.forEach((c, i) => expect(counts[i], c).toBe(SEVEN_COUNTS[c]));
      let distinct = 0;
      for (let i = 0; i < seen.length; i++) distinct += seen[i]!;
      expect(distinct).toBe(4824);
    },
  );
});

describe('evaluator: sampled 7-card vs oracle', () => {
  // 100,000 hands by default; HOLDUMB_SLOW=1 runs 1,000,000.
  const SAMPLES = process.env.HOLDUMB_SLOW === '1' ? 1_000_000 : 20_000;
  it(
    `agrees with the best-of-21 oracle on ${SAMPLES} seeded hands, and best5 is valid`,
    { timeout: 600_000 },
    () => {
      let rng = seedRng(12345);
      const byKey = new Map<number, number>();
      for (let i = 0; i < SAMPLES; i++) {
        // partial Fisher-Yates for 7 cards
        const deck = Array.from({ length: 52 }, (_, j) => j);
        const hand: number[] = [];
        for (let j = 0; j < 7; j++) {
          const [u, next] = nextU32(rng);
          rng = next;
          const k = j + (u % (52 - j));
          [deck[j], deck[k]] = [deck[k]!, deck[j]!];
          hand.push(deck[j]!);
        }
        const ev = evaluate7(hand);
        const key = oracleKeyBest(hand);
        expect(HAND_CATEGORIES.indexOf(ev.category)).toBe(oracleCategory(key));
        const prev = byKey.get(key);
        if (prev === undefined) byKey.set(key, ev.value);
        else expect(prev).toBe(ev.value);
        // best5: five distinct cards from the hand that evaluate to the same value
        expect(ev.best5).toHaveLength(5);
        expect(new Set(ev.best5).size).toBe(5);
        for (const c of ev.best5) expect(hand).toContain(c);
        expect(handValueOf(ev.best5)).toBe(ev.value);
      }
      const keys = [...byKey.keys()].sort((a, b) => a - b);
      for (let i = 1; i < keys.length; i++) {
        expect(byKey.get(keys[i]!)!).toBeGreaterThan(byKey.get(keys[i - 1]!)!);
      }
    },
  );
});

describe('evaluator: edge cases', () => {
  it('wheel is a straight and a straight flush with top 5', () => {
    const w = evaluateN(parseCards('As 2d 3c 4h 5s'));
    expect(w.category).toBe('straight');
    expect(w.value & 0xf0000).toBe(3 << 16);
    expect(w.best5).toEqual(parseCards('5s 4h 3c 2d As'));
    expect(cat('As 2s 3s 4s 5s')).toBe('straight-flush');
    expect(cat('As Ks Qs Js Ts')).toBe('royal-flush');
  });
  it('6-high beats the wheel; a straight flush beats quads', () => {
    expect(v('2s 3d 4c 5h 6s')).toBeGreaterThan(v('As 2d 3c 4h 5s'));
    expect(v('9s 8s 7s 6s 5s')).toBeGreaterThan(v('Ac Ad Ah As Kc'));
  });
  it('flush beats straight when both exist in seven cards', () => {
    expect(cat('2h 5h 8h Jh Kh 4d 6c')).toBe('flush');
    expect(cat('4h 5h 6h 7h Kh 8d 2c')).toBe('flush');
    expect(cat('4h 5h 6h 7d 8c Kh 2h')).toBe('flush');
    expect(cat('4s 5h 6h 7d 8c Kh 2h')).toBe('straight');
  });
  it('a seven-card straight flush is found among a longer run', () => {
    const h = evaluateN(parseCards('3h 4h 5h 6h 7h 8h 9h'));
    expect(h.category).toBe('straight-flush');
    expect((h.value >>> 16) & 15).toBe(7); // nine high
    expect(cat('Ah Kh Qh Jh Th 9h 8h')).toBe('royal-flush');
  });
  it('two trips make a full house; three pairs play as two pair with the best kicker', () => {
    const fh = evaluateN(parseCards('Ks Kd Kc 7h 7d 7c 2s'));
    expect(fh.category).toBe('full-house');
    expect(describeHand(fh)).toBe('Full house, kings full of sevens');
    const tp = evaluateN(parseCards('As Ad Kc Kh 7d 7c 9s'));
    expect(tp.category).toBe('two-pair');
    expect(v('As Ad Kc Kh 7d 7c 9s')).toBe(v('As Ad Kc Kh 9s'));
    expect(v('As Ad Kc Kh 7d 7c 2s')).toBe(v('As Ad Kc Kh 7s'));
  });
  it('quads plus a pair or trips keep the best kicker', () => {
    expect(v('9s 9d 9c 9h 2s 2d 2c')).toBe(v('9s 9d 9c 9h 2s'));
    expect(v('9s 9d 9c 9h As 2d 2c')).toBe(v('9s 9d 9c 9h As'));
  });
  it('the board plays and kickers beyond the fifth card are ignored', () => {
    expect(v('As Ks Qd Jc 9h 2c 3d')).toBe(v('As Ks Qd Jc 9h'));
    expect(v('As Kd Qc Jh 9s 3c 2d')).toBe(v('As Kd Qc Jh 9s 2c 4d'));
    // board is a royal: any two hole cards tie
    expect(v('Ts Js Qs Ks As 2c 3d')).toBe(v('Ts Js Qs Ks As 9d 8d'));
  });
  it('a pair beats high card, trips beat two pair (ordering by category)', () => {
    expect(v('2s 2d 5c 7h 9s')).toBeGreaterThan(v('As Kd Qc Jh 9s'));
    expect(v('2s 2d 2c 7h 9s')).toBeGreaterThan(v('As Ad Kc Kh 9s'));
  });
  it('API helpers', () => {
    expect(() => evaluateN(parseCards('As Kd Qc Jh'))).toThrow();
    expect(() => evaluate5(parseCards('As Kd Qc Jh 9s 2c'))).toThrow();
    expect(categoryOf(v('As Ad Kc Kh 9s'))).toBe('two-pair');
    expect(compareHands({ value: 1 }, { value: 2 })).toBe(-1);
    expect(describeHand(evaluateN(parseCards('Ts Js Qs Ks As')))).toBe('Royal flush');
    expect(describeHand(evaluateN(parseCards('2s 2d 5c 7h 9s')))).toBe('Pair of twos');
    expect(describeHand(evaluateN(parseCards('As Kd Qc Jh 9s')))).toBe('Ace high');
    expect(describeHand(evaluateN(parseCards('As Ad Ac Kh 9s')))).toBe('Three of a kind, aces');
    expect(describeHand(evaluateN(parseCards('As Ad Kc Kh 9s')))).toBe('Two pair, aces and kings');
  });
  it('evalMasks equals handValueOf', () => {
    const cards = parseCards('As Kd Qc Jh 9s 2c 4d');
    const m = [0, 0, 0, 0];
    for (const c of cards) m[c & 3]! |= 1 << (c >> 2);
    expect(evalMasks(m[0]!, m[1]!, m[2]!, m[3]!)).toBe(handValueOf(cards));
  });
});
