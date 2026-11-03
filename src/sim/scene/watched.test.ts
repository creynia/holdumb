// I078 AC2: hands the table plays itself (Watch) stay out of the learner's record: no decisions,
// mistakes, expected value, Trips or luck. They get their own count and result, and the session
// split still adds up to the cent: net = watched + perfect − mistakes + luck.
import { describe, expect, it } from 'vitest';
import { equity } from '../engine';
import { preflopPreview } from '../math/preview';
import { SimDriver } from './driver';
import type { PreviewFn } from './driver';

const preview: PreviewFn = (req) =>
  req.street === 'preflop'
    ? Promise.resolve(preflopPreview(req))
    : Promise.reject(new Error('preflop only in this test'));

const driver = () =>
  new SimDriver({
    mode: 'sandbox',
    seed: 4,
    preview,
    scene: {
      id: 'sandbox',
      version: 1,
      bankroll: 50_000,
      bets: { ante: 1_000, trips: 500 },
      deals: [
        { player: ['As', 'Ad'] },
        { player: ['2c', '7d'] },
        { player: ['Ks', 'Kd'] },
        { player: ['Qs', 'Qd'] },
      ],
    },
  });

const play4 = async (d: SimDriver) => {
  await d.act({ type: 'deal' });
  await d.currentPreview();
  await d.act({ type: 'play', multiple: 4 });
};

describe('watched hands (I078 AC2)', () => {
  it('stay out of decisions, mistakes, EV, Trips and luck, with their own line', async () => {
    const d = driver();
    // Two hands of your own: the second (2-7 offsuit, bet 4x) is a mistake.
    await play4(d);
    await play4(d);
    const mine = d.view.session;
    expect(mine.decisions).toBe(2);
    expect(mine.mistakes).toBe(1);
    // Two watched hands.
    d.setWatching(true);
    await play4(d);
    await play4(d);
    d.setWatching(false);
    const s = d.view.session;
    expect(s.hands).toBe(4);
    expect(s.watchedHands).toBe(2);
    expect(s.decisions).toBe(mine.decisions);
    expect(s.mistakes).toBe(mine.mistakes);
    expect(s.scored).toBe(mine.scored);
    expect(s.expectedCents).toEqual(mine.expectedCents);
    expect(s.tripsWageredCents).toBe(mine.tripsWageredCents);
    expect(s.perfectCents).toBe(mine.perfectCents);
    // Total wagered is your action only: the watched hands' bets (two 4x hands with $5 Trips:
    // 2 × ($10 + $10 + $40 + $5)) are counted apart.
    expect(s.watchedWageredCents).toBe(2 * (1_000 + 1_000 + 4_000 + 500));
    expect(s.wageredCents).toBe(mine.wageredCents);
    expect(s.luckCents).toBe(mine.luckCents);
    // Their whole result is the watched line, and the split adds up to the cent.
    expect(s.watchedCents).toBe(s.net - mine.net);
    expect(s.net).toBe(equity(d.view.state) - 50_000);
    expect(s.net).toBe(s.watchedCents + s.perfectCents - s.mistakesRoundedCents + s.luckCents);
  });

  it('a hand already on the table when Watch starts is watched; Stop does not unmark it', async () => {
    const d = driver();
    await d.act({ type: 'deal' });
    d.setWatching(true);
    d.setWatching(false);
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 4 });
    expect(d.view.session.watchedHands).toBe(1);
    expect(d.view.session.decisions).toBe(0);
    // The next hand is yours again.
    await play4(d);
    expect(d.view.session.watchedHands).toBe(1);
    expect(d.view.session.decisions).toBe(1);
  });
});

describe('Watch taken mid-hand (I097)', () => {
  it("backs the hand's decisions out of the count when Watch takes it", async () => {
    const d = driver();
    await d.act({ type: 'deal' });
    await d.currentPreview();
    // A scored preflop decision (a check leaves the flop to play), then Watch starts on the flop.
    await d.act({ type: 'check' });
    expect(d.view.session.decisions).toBe(1);
    expect(d.view.state.street).toBe('flop');
    d.setWatching(true);
    // Play the rest of the hand: checks, then a fold on the river.
    while (d.view.state.street !== 'settled') {
      const street = d.view.state.street;
      await d.currentPreview();
      await d.act(street === 'river' ? { type: 'fold' } : { type: 'check' });
    }
    const s = d.view.session;
    expect(s.hands).toBe(1);
    expect(s.watchedHands).toBe(1);
    expect(s.decisions).toBe(0);
    expect(s.mistakes).toBe(0);
    expect(s.scored).toBe(0);
  });
  it('counts your own decisions again once Watch is off', async () => {
    const d = driver();
    d.setWatching(true);
    await play4(d);
    d.setWatching(false);
    expect(d.view.session.decisions).toBe(0);
    await play4(d);
    expect(d.view.session.decisions).toBe(1);
    expect(d.view.session.mistakes).toBe(1);
  });
});
