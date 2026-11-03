// I062 Six Card Bonus at the table: it settles with the deal into the bankroll, the ledger carries
// its wager, result and exact expectation (so luck still adds up to the cent), it never leaves
// less than a 4x bet on the rack, and it does not touch the game's RNG stream.
import { describe, expect, it } from 'vitest';
import { equity } from '../engine';
import { settleSixCard } from '../engine/sixcard';
import { add, frac, neg, round, scale } from '../math/fraction';
import { preflopPreview } from '../math/preview';
import { SimDriver } from './driver';
import type { PreviewFn } from './driver';
import { validSixCardBet } from './sixcard';

const preview: PreviewFn = (req) =>
  req.street === 'preflop'
    ? Promise.resolve(preflopPreview(req))
    : Promise.reject(new Error('preflop only in this test'));

const driver = (bankroll = 50_000, ante = 1_000) =>
  new SimDriver({
    mode: 'sandbox',
    seed: 11,
    preview,
    scene: { id: 'sandbox', version: 1, bankroll, bets: { ante } },
  });

describe('Six Card Bonus in the driver (I062)', () => {
  it('validates the bet: whole dollars from $1 to $25', () => {
    expect([100, 500, 2_500].every(validSixCardBet)).toBe(true);
    expect([0, 50, 150, 2_600, -100, 1.5].some(validSixCardBet)).toBe(false);
    const d = driver();
    expect(d.setSixCard({ bet: 3_000, paytable: 'six-card-1000-200-100' })).toBe(false);
    expect(d.view.sixCard.setting).toBeNull();
  });

  it('settles at the deal: bankroll, last result and the exact ledger', async () => {
    const d = driver();
    expect(d.setSixCard({ bet: 500, paytable: 'six-card-1000-200-100' })).toBe(true);
    await d.act({ type: 'deal' });
    const st = d.view.state;
    const hand = st.hand!;
    // Independent: the same settlement from the deal, the game seed and the hand number.
    const want = settleSixCard(hand.deal, st.seed, hand.n, 500, 'six-card-1000-200-100');
    const last = d.view.sixCard.last;
    expect(last).toEqual({ kind: 'settled', result: want });
    // $500 rack − $10 Ante − $10 Blind + the Six Card profit (−$5, or bet × pays).
    expect(st.bankroll).toBe(50_000 - 2_000 + want.profit);
    const s = d.view.session;
    expect(s.sixCardWageredCents).toBe(500);
    expect(s.sixCardCents).toBe(want.profit);
    // −edge × wager = −500 × 12816/149695 cents (≈ −42.81¢), exact.
    expect(s.sixCardExpectedCents).toEqual(frac(-500n * 12816n, 149695n));
    expect(s.sixCardExpectedRoundedCents).toBe(-43);
    // Total wagered: the engine counts the main bets at settlement; Six Card is in from the deal.
    expect(s.wageredCents).toBe(500);
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 4 });
    expect(d.view.session.wageredCents).toBe(1_000 + 1_000 + 4_000 + 500);
    // The hand's own result does not include the side bet; the session net does.
    expect(d.view.session.net).toBe(d.view.state.hand!.result!.net + want.profit);
  });

  it('keeps "perfect play expects" exact and the luck split adding up to the cent', async () => {
    const d = driver();
    d.setSixCard({ bet: 2_500, paytable: 'six-card-1000-200-50' });
    for (let i = 0; i < 6; i++) {
      await d.act({ type: 'deal' });
      await d.currentPreview();
      await d.act({ type: 'play', multiple: 4 });
    }
    const s = d.view.session;
    expect(s.hands).toBe(6);
    expect(s.sixCardWageredCents).toBe(6 * 2_500);
    const six = scale(neg(frac(70366n, 363545n)), 6 * 2_500);
    expect(s.sixCardExpectedCents).toEqual(six);
    expect(s.perfectCents).toBe(round(add(add(s.expectedCents, s.tripsExpectedCents), six)));
    expect(s.net - s.perfectCents + s.mistakesRoundedCents).toBe(s.luckCents);
    expect(s.net).toBe(equity(d.view.state) - 50_000);
  });

  it('is skipped (no money moves) when it would leave less than a 4x bet', async () => {
    // $60 rack, $10 Ante: after Ante + Blind $40 is left, exactly 4 × $10, so a $1 bet is skipped.
    const d = driver(6_000, 1_000);
    d.setSixCard({ bet: 100, paytable: 'six-card-1000-200-100' });
    await d.act({ type: 'deal' });
    expect(d.view.sixCard.last).toEqual({
      kind: 'skipped',
      bet: 100,
      reason: 'Six Card skipped: keep enough for a 4x bet.',
    });
    expect(d.view.state.bankroll).toBe(4_000);
    expect(d.view.session.sixCardWageredCents).toBe(0);
    await d.act({ type: 'play', multiple: 4 });
    expect(d.view.state.street).toBe('settled');
  });

  it('is taken when exactly a 4x bet is left after it', async () => {
    // $61 rack: after Ante + Blind $41 is left; a $1 Six Card bet leaves exactly 4 × $10.
    const d = driver(6_100, 1_000);
    d.setSixCard({ bet: 100, paytable: 'six-card-1000-200-100' });
    await d.act({ type: 'deal' });
    const last = d.view.sixCard.last;
    expect(last?.kind).toBe('settled');
    expect(d.view.state.bankroll).toBe(4_100 + (last?.kind === 'settled' ? last.result.profit : 0));
    expect(d.view.session.sixCardWageredCents).toBe(100);
  });

  it('does not change the cards the game deals', async () => {
    const a = driver();
    const b = driver();
    b.setSixCard({ bet: 500, paytable: 'six-card-1000-200-100' });
    for (let i = 0; i < 3; i++) {
      await a.act({ type: 'deal' });
      await b.act({ type: 'deal' });
      expect(b.view.state.hand!.deal).toEqual(a.view.state.hand!.deal);
      await a.act({ type: 'play', multiple: 4 });
      await b.act({ type: 'play', multiple: 4 });
    }
  });

  it('off again: the next deal takes no Six Card bet', async () => {
    const d = driver();
    d.setSixCard({ bet: 500, paytable: 'six-card-1000-200-100' });
    d.setSixCard(null);
    await d.act({ type: 'deal' });
    expect(d.view.sixCard.last).toBeNull();
    expect(d.view.state.bankroll).toBe(48_000);
  });
});
