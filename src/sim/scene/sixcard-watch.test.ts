// I062 × I078: a session with the Six Card Bonus on that plays its own hands and watched hands.
// The Six Card bet settles at the deal into its own ledger on every hand, watched or not, and a
// watched hand's main-game result goes to `watchedCents` only, so the two ledgers stay disjoint
// and the session still adds up to the cent: net = watched + perfect − mistakes + luck.
import { describe, expect, it } from 'vitest';
import { equity, visibleView } from '../engine/game';
import { ZERO, add, frac, round, scale } from '../math/fraction';
import type { Fraction } from '../math/types';
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
    const watchedNs: number[] = [];
    // Independently of the driver's ledger: a hand is scored when every decision had a preview;
    // then it expects its first decision's best EV and costs the chosen options' regret x Ante.
    let expected: Fraction = ZERO;
    let mistakes: Fraction = ZERO;
    const play = async (watched: boolean) => {
      let scored = true;
      let base: Fraction | null = null;
      let regret: Fraction = ZERO;
      d.setWatching(watched);
      expect((await d.act({ type: 'deal' })).ok).toBe(true);
      const six = d.view.sixCard.last;
      expect(six?.kind).toBe('settled');
      if (six?.kind === 'settled') sixProfit += six.result.profit;
      while (['preflop', 'flop', 'river'].includes(d.view.state.street)) {
        const pv = await d.currentPreview().catch(() => null);
        const a = strat.decide(visibleView(d.view.state));
        const opt = pv?.options.find(
          (o) =>
            o.action.type === a.type &&
            (a.type !== 'play' || (o.action.type === 'play' && o.action.multiple === a.multiple)),
        );
        if (!pv || !opt) scored = false;
        else {
          base ??= pv.options[pv.bestIndex]!.evCents;
          regret = add(regret, scale(opt.regret, 1000));
        }
        expect((await d.act(a)).ok).toBe(true);
      }
      if (!watched && scored && base) {
        expected = add(expected, base);
        mistakes = add(mistakes, regret);
      }
      const net = d.view.state.hand!.result!.net;
      if (watched) watchedNs.push(d.view.state.hand!.n);
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
    // Perfect play expects the scored own hands' EV plus the Six Card expectation (no Trips bet
    // here), rounded once; luck is then what is left of your own and Six Card results.
    expect(s.scored).toBeGreaterThan(0);
    const sixExpected = frac(-8n * 500n * 12816n, 149695n);
    const perfect = round(add(expected, sixExpected));
    expect(s.perfectCents).toBe(perfect);
    expect(s.mistakesRoundedCents).toBe(round(mistakes));
    expect(s.luckCents).toBe(ownNet + sixProfit - perfect + round(mistakes));
    // I055 history: every settled hand is recorded, watched ones too, but a watched hand carries
    // no tier or regret notes (Watch's moves are not yours to grade).
    const history = d.view.history;
    expect(history.map((r) => r.n).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(watchedNs).toHaveLength(3);
    for (const r of history) {
      const noted = r.a.some((e) => e.length > 2);
      if (watchedNs.includes(r.n)) expect(noted, `watched hand ${r.n} has notes`).toBe(false);
    }
    expect(history.some((r) => !watchedNs.includes(r.n) && r.a.some((e) => e.length > 2))).toBe(
      true,
    );
    // The split adds up exactly.
    expect(s.net).toBe(s.watchedCents + s.perfectCents - s.mistakesRoundedCents + s.luckCents);
  });
});
