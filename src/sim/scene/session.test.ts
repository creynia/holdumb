import { describe, expect, it } from 'vitest';
import { tripsEdge } from '../math/edges';
import { ZERO, add, div, eq, frac, neg, round, scale, sub } from '../math/fraction';
import { preflopPreview, riverPreview } from '../math/preview';
import type { Fraction } from '../math/types';
import { SimDriver } from './driver';
import type { PreviewFn } from './driver';

// Exact previews for preflop (table) and river (990 showdowns); the flop has none here.
const preview: PreviewFn = (req) =>
  req.street === 'river'
    ? Promise.resolve(riverPreview(req))
    : req.street === 'preflop'
      ? Promise.resolve(preflopPreview(req))
      : Promise.reject(new Error('no flop EV in this test'));
const noPreview: PreviewFn = () => Promise.reject(new Error('no ev'));

/** Qc 7d on Kd Jh 9s 5c 2d (19 dealer outs: bet 1x is best), Ante $10, Trips $5. */
const river = (pv: PreviewFn, trips = 500) =>
  new SimDriver({
    mode: 'sandbox',
    seed: 3,
    preview: pv,
    scene: {
      id: 'sandbox',
      version: 1,
      bets: { ante: 1000, trips },
      startAt: {
        street: 'river',
        deal: {
          player: ['Qc', '7d'],
          dealer: ['Td', 'Ts'],
          flop: ['Kd', 'Jh', '9s'],
          turn: '5c',
          river: '2d',
        },
      },
    },
  });

/**
 * At a settled hand the session's net is the bankroll change since the start (anchored to
 * startEquity: the opening Ante, Blind and Trips are already on the felt), and luck is that
 * change minus perfect plus mistakes, to the cent.
 */
const bankrollAddsUp = (d: SimDriver) => {
  expect(d.view.state.street).toBe('settled');
  const s = d.view.session;
  const change = d.view.state.bankroll - d.view.startEquity;
  expect(s.net).toBe(change);
  expect(s.perfectCents - s.mistakesRoundedCents + s.luckCents).toBe(change);
};

describe('session ledger (curriculum 8.5): exact expectations, rounded once', () => {
  it('a best river move: expected is the exact best EV, no mistakes, Trips expected = −edge × wager', async () => {
    const d = river(preview);
    const pv = await d.currentPreview();
    expect(pv?.street).toBe('river');
    const best = pv!.options[pv!.bestIndex]!;
    expect(best.label).toBe('Bet 1x');
    expect((await d.act({ type: 'play', multiple: 1 })).ok).toBe(true);
    const s = d.view.session;
    expect(s.hands).toBe(1);
    expect(s.scored).toBe(1);
    expect(s.decisions).toBe(1);
    expect(s.mistakes).toBe(0);
    expect(eq(s.expectedCents, best.evCents)).toBe(true);
    expect(eq(s.mistakeCents, ZERO)).toBe(true);
    expect(s.scoredAnteCents).toBe(1000);
    expect(s.wageredCents).toBe(1000 + 1000 + 1000 + 500);
    expect(s.tripsWageredCents).toBe(500);
    const tripsExpected = scale(neg(tripsEdge('trips-8-6-5').edge), 500);
    expect(eq(s.tripsExpectedCents, tripsExpected)).toBe(true);
    expect(s.tripsExpectedRoundedCents).toBe(round(tripsExpected));
    expect(s.perfectCents).toBe(round(add(best.evCents, tripsExpected)));
    expect(s.mistakesRoundedCents).toBe(0);
    expect(eq(s.edgePerAnte!, div(neg(best.evCents), frac(1000)))).toBe(true);
    bankrollAddsUp(d);
  });

  it('a fold here is a mistake: regret × Ante, exact, and the edge per Ante grows by it', async () => {
    const d = river(preview);
    const pv = await d.currentPreview();
    const best = pv!.options[pv!.bestIndex]!;
    const fold = pv!.options.find((o) => o.action.type === 'fold')!;
    expect(fold.tier).not.toBe('best');
    expect((await d.act({ type: 'fold' })).ok).toBe(true);
    const s = d.view.session;
    expect(s.mistakes).toBe(1);
    const regretCents: Fraction = scale(fold.regret, 1000);
    expect(eq(s.mistakeCents, regretCents)).toBe(true);
    expect(s.mistakesRoundedCents).toBe(round(regretCents));
    expect(eq(s.expectedCents, best.evCents)).toBe(true);
    // Your edge = −(expected − mistakes)/antes: the decision taken is worth best − regret.
    expect(eq(s.edgePerAnte!, div(neg(sub(best.evCents, regretCents)), frac(1000)))).toBe(true);
    bankrollAddsUp(d);
  });

  it('a hand without EV is left out of the split but its money counts as luck', async () => {
    const d = river(noPreview);
    expect(await d.currentPreview()).toBeNull();
    expect((await d.act({ type: 'play', multiple: 1 })).ok).toBe(true);
    const s = d.view.session;
    expect(s.hands).toBe(1);
    expect(s.scored).toBe(0);
    expect(s.scoredAnteCents).toBe(0);
    expect(s.edgePerAnte).toBeNull();
    expect(s.perfectCents).toBe(round(s.tripsExpectedCents));
    expect(s.tripsWageredCents).toBe(500);
    expect(s.wageredCents).toBe(3500);
    bankrollAddsUp(d);
  });

  it('sums over hands: the second hand (preflop decision, no Trips) keeps everything exact', async () => {
    const d = river(preview, 0);
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 1 });
    const after1 = d.view.session;
    expect(after1.tripsWageredCents).toBe(0);
    expect(eq(after1.tripsExpectedCents, ZERO)).toBe(true);
    // Next hand from the RNG: bet 4x preflop (scored on the table EV), then it plays out.
    expect((await d.act({ type: 'deal' })).ok).toBe(true);
    const pv = await d.currentPreview();
    expect(pv?.street).toBe('preflop');
    const best = pv!.options[pv!.bestIndex]!;
    const raise = pv!.options.find((o) => o.action.type === 'play' && o.action.multiple === 4)!;
    expect((await d.act({ type: 'play', multiple: 4 })).ok).toBe(true);
    const s = d.view.session;
    expect(s.hands).toBe(2);
    expect(s.scored).toBe(2);
    expect(s.scoredAnteCents).toBe(2000);
    expect(eq(s.expectedCents, add(after1.expectedCents, best.evCents))).toBe(true);
    expect(eq(s.mistakeCents, add(after1.mistakeCents, scale(raise.regret, 1000)))).toBe(true);
    const w = d.view.state.stats.wagered;
    expect(s.wageredCents).toBe(w.ante + w.blind + w.play + w.trips);
    bankrollAddsUp(d);
  });

  it('a hand whose later preview fails adds 0 to the mistake count and to mistakeCents', async () => {
    const d = river(preview, 0);
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 1 });
    const before = d.view.session;
    expect((await d.act({ type: 'deal' })).ok).toBe(true);
    const pv = await d.currentPreview();
    expect(pv?.street).toBe('preflop');
    // A worse-than-close preflop check: a mistake only if the hand ends scored.
    const worse = pv!.options.find(
      (o) => o.action.type === 'check' && (o.tier === 'costly' || o.tier === 'blunder'),
    );
    expect(worse, 'a worse-than-close preflop check').toBeDefined();
    expect((await d.act({ type: 'check' })).ok).toBe(true);
    // The flop has no preview in this test, so the decision there leaves the hand unscored.
    await d.act({ type: 'check' });
    // Finish the hand (fold ends it at once) and check the ledger once it has settled.
    for (let i = 0; i < 3 && !d.view.result; i++) await d.act({ type: 'fold' });
    expect(d.view.result).not.toBeNull();
    const after = d.view.session;
    expect(after.hands).toBe(before.hands + 1);
    expect(after.scored).toBe(before.scored);
    expect(after.mistakes).toBe(before.mistakes);
    expect(eq(after.mistakeCents, before.mistakeCents)).toBe(true);
    bankrollAddsUp(d);
  });
});
