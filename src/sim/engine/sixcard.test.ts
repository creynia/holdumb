// I062 Six Card Bonus: the 6-card counts and both edges re-derived independently (rank/suit counting
// over all C(52,6), not the app's evaluator), the evaluator checked against that classifier, and
// the bonus-card draw and settlement.
import { describe, expect, it } from 'vitest';
import { SIX_CARD_COUNTS, SIX_CARD_TOTAL, sixCardEdge } from '../math/sixcardEdge';
import { frac } from '../math/fraction';
import { parseCard } from './cards';
import { evaluateN } from './evaluator';
import { seedRng } from './rng';
import { dealHand } from './deck';
import { SIX_CARD_PAYTABLES, bonusCards, settleSixCard, sixCardPay } from './sixcard';
import type { HandCategory } from './types';

type Cat =
  | 'royal-flush'
  | 'straight-flush'
  | 'quads'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'trips'
  | 'other';

/** Top rank (0..12) of a 5-run in a 13-bit rank mask, 3 for the wheel, -1 if none. */
function runTop(mask: number): number {
  for (let top = 12; top >= 4; top--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!(mask & (1 << (top - k)))) ok = false;
    if (ok) return top;
  }
  return (mask & 0b1000000001111) === 0b1000000001111 ? 3 : -1;
}

/** Independent best-5-of-6 classifier (card = rank * 4 + suit, as the engine). */
function classify6(cards: readonly number[]): Cat {
  const rc = new Array<number>(13).fill(0);
  const sm = [0, 0, 0, 0];
  for (const c of cards) {
    rc[c >> 2]! += 1;
    sm[c & 3]! |= 1 << (c >> 2);
  }
  let sf = -1;
  let flush = false;
  for (const m of sm) {
    let n = 0;
    for (let r = 0; r < 13; r++) if (m & (1 << r)) n++;
    if (n >= 5) {
      flush = true;
      sf = Math.max(sf, runTop(m));
    }
  }
  if (sf === 12) return 'royal-flush';
  if (sf >= 0) return 'straight-flush';
  const q = rc.filter((n) => n === 4).length;
  const t = rc.filter((n) => n === 3).length;
  const p = rc.filter((n) => n === 2).length;
  if (q) return 'quads';
  if (t >= 2 || (t && p)) return 'full-house';
  if (flush) return 'flush';
  let mask = 0;
  rc.forEach((n, r) => (mask |= n ? 1 << r : 0));
  if (runTop(mask) >= 0) return 'straight';
  return t ? 'trips' : 'other';
}

describe('Six Card Bonus maths (I062, D5a)', () => {
  it('re-derives every 6-card count and both exact edges by exhaustive enumeration', () => {
    const counts: Record<Cat, number> = {
      'royal-flush': 0,
      'straight-flush': 0,
      quads: 0,
      'full-house': 0,
      flush: 0,
      straight: 0,
      trips: 0,
      other: 0,
    };
    const h = [0, 0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 52; h[0]++)
      for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
        for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
          for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
            for (h[4] = h[3] + 1; h[4] < 52; h[4]++)
              for (h[5] = h[4] + 1; h[5] < 52; h[5]++) counts[classify6(h)]++;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(BigInt(total)).toBe(SIX_CARD_TOTAL);
    for (const [cat, n] of Object.entries(SIX_CARD_COUNTS))
      expect([cat, BigInt(counts[cat as Cat])]).toEqual([cat, n]);

    // EV per $1 = Σ count × (pays + 1) / C(52,6) − 1, from the independent counts.
    const ev = (pays: Partial<Record<HandCategory, number>>) => {
      let ret = 0n;
      for (const [cat, to1] of Object.entries(pays))
        ret += BigInt(counts[cat as Cat]) * BigInt(to1 + 1);
      return frac(ret - BigInt(total), BigInt(total));
    };
    expect(ev(SIX_CARD_PAYTABLES['six-card-1000-200-100'].pays)).toEqual(frac(-12816n, 149695n));
    expect(ev(SIX_CARD_PAYTABLES['six-card-1000-200-50'].pays)).toEqual(frac(-70366n, 363545n));
    // The app's edge (from the pinned counts) is the same fraction: 8.561% and 19.356%.
    expect(sixCardEdge('six-card-1000-200-100').edge).toEqual(frac(12816n, 149695n));
    expect(sixCardEdge('six-card-1000-200-50').edge).toEqual(frac(70366n, 363545n));
    expect(sixCardEdge('six-card-1000-200-100').tier).toBe('poor');
    expect(sixCardEdge('six-card-1000-200-50').tier).toBe('avoid');
  }, 60_000);

  it("the app's evaluator agrees with the independent classifier on 6 cards", () => {
    let r = seedRng(62);
    for (let i = 0; i < 20_000; i++) {
      const [deal, next] = dealHand(r);
      r = next;
      const six = [...deal.player, ...deal.dealer, deal.board[0], deal.board[1]];
      const want = classify6(six);
      const got = evaluateN(six).category;
      expect(want === 'other' ? ['high-card', 'pair', 'two-pair'] : [want]).toContain(got);
    }
    const royal = ['As', 'Ks', 'Qs', 'Js', 'Ts', '2d'].map(parseCard);
    expect(evaluateN(royal).category).toBe('royal-flush');
  });
});

describe('Six Card Bonus settlement', () => {
  const [deal] = dealHand(seedRng(9));
  it('draws four distinct bonus cards from the 43 the deal left unseen, the same every time', () => {
    const b = bonusCards(deal, 123, 1);
    const used = new Set([...deal.player, ...deal.dealer, ...deal.board]);
    expect(new Set(b).size).toBe(4);
    for (const c of b) expect(used.has(c)).toBe(false);
    expect(bonusCards(deal, 123, 1)).toEqual(b);
    expect(bonusCards(deal, 123, 2)).not.toEqual(b);
    expect(bonusCards(deal, 124, 1)).not.toEqual(b);
  });

  it('pays "to 1" on trips or better and loses below', () => {
    const t = SIX_CARD_PAYTABLES['six-card-1000-200-100'];
    expect(sixCardPay(t, 'trips', 500)).toBe(3_500);
    expect(sixCardPay(t, 'royal-flush', 100)).toBe(100_000);
    expect(sixCardPay(SIX_CARD_PAYTABLES['six-card-1000-200-50'], 'quads', 500)).toBe(25_000);
    expect(sixCardPay(t, 'two-pair', 500)).toBe(-500);
    expect(sixCardPay(t, 'high-card', 2_500)).toBe(-2_500);
  });

  it('settles on the hole cards plus the bonus cards', () => {
    const r = settleSixCard(deal, 123, 1, 500);
    expect(r.bonus).toEqual(bonusCards(deal, 123, 1));
    expect(r.hand.category).toBe(evaluateN([...deal.player, ...r.bonus]).category);
    expect(r.profit).toBe(sixCardPay(SIX_CARD_PAYTABLES[r.paytable], r.hand.category, 500));
  });
});
