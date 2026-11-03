// I062 × I078: a session with the Six Card Bonus on that plays its own hands and watched hands.
// The Six Card bet settles at the deal into its own ledger on every hand, watched or not, and a
// watched hand's main-game result goes to `watchedCents` only, so the two ledgers stay disjoint
// and the session still adds up to the cent: net = watched + perfect − mistakes + luck.
import { describe, expect, it } from 'vitest';
import { equity, visibleView } from '../engine/game';
import { frac, round } from '../math/fraction';
import { preflopPreview } from '../math/preview';
import { STRATEGIES } from '../strategy/presets';
import { SimDriver } from './driver';
import type { PreviewFn } from './driver';
// Registers the Six Card rules with the driver, as the (lazy) Six Card UI does.
import './sixcard';

const preview: PreviewFn = (req) =>
  req.street === 'preflop'
    ? Promise.resolve(preflopPreview(req))
    : Promise.reject(new Error('preflop only'));

describe('Six Card with watched hands (I062 + I078)', () => {
  it('keeps the Six Card and watched ledgers disjoint and the session exact to the cent', async () => {
    const bankroll = 100_000;
    const d = new SimDriver({
      mode: 'sandbox',
      seed: 31,
      preview,
      scene: { id: 'sandbox', version: 1, bankroll, bets: { ante: 1000 }, seed: 31 },
    });
    expect(d.setSixCard({ bet: 500, paytable: 'six-card-1000-200-100' })).toBe(true);
    const start = equity(d.view.state);
    const strat = STRATEGIES.expert;
    let sixProfit = 0;
    let ownNet = 0;
    let watchedNet = 0;
    const play = async (watched: boolean) => {
      d.setWatching(watched);
      expect((await d.act({ type: 'deal' })).ok).toBe(true);
      const six = d.view.sixCard.last;
      expect(six?.kind).toBe('settled');
      if (six?.kind === 'settled') sixProfit += six.result.profit;
      while (['preflop', 'flop', 'river'].includes(d.view.state.street)) {
        await d.currentPreview();
        expect((await d.act(strat.decide(visibleView(d.view.state)))).ok).toBe(true);
      }
      const net = d.view.state.hand!.result!.net;
      if (watched) watchedNet += net;
      else ownNet += net;
    };
    for (let i = 0; i < 3; i++) await play(false);
    for (let i = 0; i < 3; i++) await play(true);
    for (let i = 0; i < 2; i++) await play(false);
    d.setWatching(false);

    const s = d.view.session;
    // Independent totals from the hands themselves.
    expect(s.hands).toBe(8);
    expect(s.watchedHands).toBe(3);
    expect(s.watchedCents).toBe(watchedNet);
    // Six Card is in its own ledger on all 8 hands, the watched ones included.
    expect(s.sixCardWageredCents).toBe(8 * 500);
    expect(s.sixCardCents).toBe(sixProfit);
    expect(s.sixCardExpectedCents).toEqual(frac(-8n * 500n * 12816n, 149695n));
    expect(s.sixCardExpectedRoundedCents).toBe(round(frac(-8n * 500n * 12816n, 149695n)));
    // The session net is every hand's result plus every Six Card result, to the cent.
    expect(s.net).toBe(equity(d.view.state) - start);
    expect(s.net).toBe(ownNet + watchedNet + sixProfit);
    // The split adds up exactly.
    expect(s.net).toBe(s.watchedCents + s.perfectCents - s.mistakesRoundedCents + s.luckCents);
  });
});
