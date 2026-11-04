// I059: the skill-versus-luck ledger of one finished hand, in exact cents.
import { describe, expect, it } from 'vitest';
import { tripsEdge } from '../math/edges';
import { add, eq, frac, neg, round, scale } from '../math/fraction';
import { preflopPreview, riverPreview } from '../math/preview';
import { SimDriver } from './driver';
import './sixcard';
import type { PreviewFn } from './driver';

const preview: PreviewFn = (req) =>
  req.street === 'river'
    ? Promise.resolve(riverPreview(req))
    : req.street === 'preflop'
      ? Promise.resolve(preflopPreview(req))
      : Promise.reject(new Error('no flop EV in this test'));

/** Qc 7d on Kd Jh 9s 5c 2d (19 dealer outs: Bet 1x is best), Ante $10, Trips $5. */
const river = (trips = 500) =>
  new SimDriver({
    mode: 'sandbox',
    seed: 3,
    preview,
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

describe('hand verdict (I059)', () => {
  it('a best move: every decision fine; expected is the exact best EV plus Trips, net is the bankroll change', async () => {
    const d = river();
    const pv = (await d.currentPreview())!;
    const best = pv.options[pv.bestIndex]!;
    expect(d.verdict()).toBeNull(); // nothing yet
    await d.act({ type: 'play', multiple: 1 });
    const v = d.verdict()!;
    expect(v.decisions).toHaveLength(1);
    expect(v.decisions[0]!.tier).toBe('best');
    const tripsExp = scale(neg(tripsEdge('trips-8-6-5').edge), 500);
    expect(eq(v.expectedCents, add(best.evCents, tripsExp))).toBe(true);
    expect(v.netCents).toBe(d.view.session.net);
    // matches the session panel's perfect-play expectation for this single hand
    expect(round(v.expectedCents)).toBe(d.view.session.perfectCents);
  });
  it('a mistake: expected is the line taken (best less the regret), and the costliest decision is named', async () => {
    const d = river(0);
    const pv = (await d.currentPreview())!;
    const best = pv.options[pv.bestIndex]!;
    const fold = pv.options.find((o) => o.action.type === 'fold')!;
    await d.act({ type: 'fold' });
    const v = d.verdict()!;
    const cost = scale(fold.regret, 1000);
    expect(v.decisions).toEqual([
      { street: 'river', label: 'Fold', tier: fold.tier, costCents: cost },
    ]);
    expect(eq(v.expectedCents, add(best.evCents, neg(cost)))).toBe(true);
    // the session panel: perfect − mistakes, rounded once, to the cent
    const s = d.view.session;
    expect(round(v.expectedCents)).toBe(round(add(s.expectedCents, neg(s.mistakeCents))));
  });
  it('a hand without EV has no verdict', async () => {
    const d = new SimDriver({
      mode: 'sandbox',
      seed: 3,
      preview: () => Promise.reject(new Error('no ev')),
      scene: {
        id: 'sandbox',
        version: 1,
        bets: { ante: 1000 },
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
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 1 });
    expect(d.verdict()).toBeNull();
  });
  it('Six Card is in both sides: its exact expectation and its profit', async () => {
    const d = new SimDriver({
      mode: 'sandbox',
      seed: 11,
      preview,
      scene: { id: 'sandbox', version: 1, bankroll: 50_000, bets: { ante: 1000 } },
    });
    expect(d.setSixCard({ bet: 500, paytable: 'six-card-1000-200-100' })).toBe(true);
    await d.act({ type: 'deal' });
    const pv = (await d.currentPreview())!;
    const best = pv.options[pv.bestIndex]!;
    // Bet 4x settles the hand at once, so the preflop-only preview scores it whatever the deal.
    const fourX = pv.options.find((o) => o.action.type === 'play' && o.action.multiple === 4)!;
    await d.act(fourX.action);
    const v = d.verdict()!;
    const six = frac(-500n * 12816n, 149695n);
    const line = add(best.evCents, neg(scale(fourX.regret, 1000)));
    expect(eq(v.expectedCents, add(line, six))).toBe(true);
    expect(v.netCents).toBe(d.view.session.net); // includes the Six Card profit
    expect(v.decisions).toHaveLength(1);
  });
  it('clears on the next deal and on a new session', async () => {
    const d = river(0);
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 1 });
    expect(d.verdict()).not.toBeNull();
    await d.act({ type: 'deal' });
    expect(d.verdict()).toBeNull();
    d.newSession(50_000);
    expect(d.verdict()).toBeNull();
  });
  it('a watched hand has no verdict', async () => {
    const d = river(0);
    d.setWatching(true);
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 1 });
    expect(d.verdict()).toBeNull();
  });
});
