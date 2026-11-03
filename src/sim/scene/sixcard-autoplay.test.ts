// I062 in auto-play: the simulate job settles the Six Card Bonus at each deal through the same
// engine step as the table, so a seeded auto-play run equals the same hands played by hand at the
// table, hand for hand and to the cent; with the bet off nothing changes.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, equity, visibleView } from '../engine/game';
import { applySixCard } from '../engine/sixcard';
import type { SixCardSetting } from '../engine/sixcard';
import { preflopPreview } from '../math/preview';
import { SimDriver } from './driver';
import type { PreviewFn } from './driver';
import { STRATEGIES } from '../strategy/presets';
import { simulateJob } from '../strategy/simulate';
import type { SimulateRequest } from '../strategy/types';
// Registers the Six Card rules with the driver and the in-thread simulate job, as the UI does.
import './sixcard';

const run = (req: SimulateRequest) => {
  const g = simulateJob(req);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
  }
};
const SIX: SixCardSetting = { bet: 500, paytable: 'six-card-1000-200-100' };

describe('auto-play without Six Card is unchanged (I062)', () => {
  it('a seeded run equals the series pinned before the change', () => {
    const r = run({
      strategy: { id: 'expert', ante: 1000, trips: 500 },
      hands: 300,
      sessions: 1,
      seed: 7,
      bankroll: 50_000,
    });
    const s = r.series[0]!;
    let hash = 0;
    for (const v of s.equity!) hash = (Math.imul(hash, 31) + v) | 0;
    // Recorded on this branch with simulate.ts as it was before the Six Card change.
    expect({
      hash,
      final: s.finals[0],
      outcomes: s.outcomes,
      cats: Array.from(s.byCategory),
      bonus: s.blindBonusHits,
      trips: s.tripsHits,
      played: s.handsPlayed,
      e300: s.expected[300],
    }).toEqual({
      hash: -1923359956,
      final: 70500,
      outcomes: { win: 143, lose: 93, tie: 9, fold: 55 },
      cats: [46, 136, 68, 12, 18, 12, 8, 0, 0, 0],
      bonus: 35,
      trips: 50,
      played: 300,
      e300: 40329.748999999996,
    });
    expect(s.sixCard).toBeUndefined();
  });
});

describe('auto-play with Six Card equals the same hands at the table (I062)', () => {
  const preview: PreviewFn = (req) =>
    req.street === 'preflop'
      ? Promise.resolve(preflopPreview(req))
      : Promise.reject(new Error('preflop only'));

  it('hand for hand: equity after every hand and the Six Card ledger, to the cent', async () => {
    const seed = 2024;
    const hands = 120;
    const bankroll = 200_000;
    const r = run({
      strategy: { id: 'expert', ante: 1000, trips: 0 },
      hands,
      sessions: 1,
      seed,
      bankroll,
      rules: { tripsPaytable: 'trips-8-6-5' },
      sixCard: SIX,
    });
    const s = r.series[0]!;

    const d = new SimDriver({
      mode: 'sandbox',
      seed,
      paytable: 'trips-8-6-5',
      preview,
      scene: { id: 'sandbox', version: 1, bankroll, bets: { ante: 1000 }, seed },
    });
    expect(d.setSixCard(SIX)).toBe(true);
    const strat = STRATEGIES.expert;
    for (let h = 1; h <= hands; h++) {
      expect((await d.act({ type: 'deal' })).ok).toBe(true);
      while (['preflop', 'flop', 'river'].includes(d.view.state.street)) {
        const a = strat.decide(visibleView(d.view.state));
        expect((await d.act(a)).ok).toBe(true);
      }
      expect(equity(d.view.state), `equity after hand ${h}`).toBe(s.equity![h]);
    }
    const t = d.view.session;
    expect(s.sixCard).toBeDefined();
    expect(s.sixCard!.taken).toBe(hands);
    expect(s.sixCard!.skipped).toBe(0);
    expect(s.sixCard!.wageredCents).toBe(t.sixCardWageredCents);
    expect(s.sixCard!.profitCents).toBe(t.sixCardCents);
    expect(s.sixCard!.wageredCents).toBe(hands * SIX.bet);
    // The bet is really in play: it paid at least once and lost at least once in 120 hands.
    expect(s.sixCard!.hits).toBeGreaterThan(0);
    expect(s.sixCard!.hits).toBeLessThan(hands);
  });

  it('the side bet changes only the money, never the cards or the main-game choices', () => {
    const base = {
      strategy: { id: 'expert' as const, ante: 1000, trips: 0 },
      hands: 200,
      sessions: 1,
      seed: 99,
      bankroll: 500_000,
    };
    const off = run(base).series[0]!;
    const on = run({ ...base, sixCard: SIX }).series[0]!;
    expect(on.outcomes).toEqual(off.outcomes);
    expect(Array.from(on.byCategory)).toEqual(Array.from(off.byCategory));
    expect(on.finals[0]! - off.finals[0]!).toBe(on.sixCard!.profitCents);
  });
});

describe('the Six Card skip rule (keep a 4x Play bet on the rack)', () => {
  // After the deal the rack holds bankroll − Ante − Blind; the bet is taken only while
  // rack − bet ≥ 4 × Ante. With a $10 Ante and a $5 bet the boundary is a $65.00 bankroll.
  const dealt = (bankroll: number) => {
    const r = applyAction(createGame({ bankroll, seed: 3, bets: { ante: 1000 } }), {
      type: 'deal',
    });
    if (!r.ok) throw new Error(r.error.message);
    return r.state;
  };

  it('is taken at exactly 4x left and skipped one cent below', () => {
    expect(applySixCard(dealt(6_500), SIX).outcome?.kind).toBe('settled');
    const skip = applySixCard(dealt(6_499), SIX);
    expect(skip.outcome?.kind).toBe('skipped');
    expect(skip.state.bankroll).toBe(6_499 - 2_000);
  });

  it('auto-play counts a skipped bet and leaves the money alone', () => {
    const r = run({
      strategy: { id: 'expert', ante: 1000, trips: 0 },
      hands: 1,
      sessions: 1,
      seed: 5,
      bankroll: 6_400, // plays (≥ 6 Antes) but cannot keep a 4x bet after a $5 Six Card
      sixCard: SIX,
    });
    const s = r.series[0]!;
    expect(s.sixCard).toEqual({ taken: 0, skipped: 1, wageredCents: 0, profitCents: 0, hits: 0 });
    const off = run({
      strategy: { id: 'expert', ante: 1000, trips: 0 },
      hands: 1,
      sessions: 1,
      seed: 5,
      bankroll: 6_400,
    }).series[0]!;
    expect(s.finals[0]).toBe(off.finals[0]);
  });
});
