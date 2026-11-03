import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT } from '../engine';
import { toRatio } from '../math/fraction';
import { preflopPreview, riverPreview } from '../math/preview';
import { SimDriver } from './driver';
import type { PreviewFn } from './driver';

const preview: PreviewFn = (req) =>
  req.street === 'river'
    ? Promise.resolve(riverPreview(req))
    : req.street === 'preflop'
      ? Promise.resolve(preflopPreview(req))
      : Promise.reject(new Error('no flop EV in this test'));
const noPreview: PreviewFn = () => Promise.reject(new Error('no ev'));

const river = (pv: PreviewFn) =>
  new SimDriver({
    mode: 'sandbox',
    seed: 3,
    preview: pv,
    scene: {
      id: 'sandbox',
      version: 1,
      bets: { ante: 1000, trips: 500 },
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

describe('hand history (simulator.md 3.7): the driver records every settled hand', () => {
  it('a scored river hand: the choice, its tier code and the exact regret, newest first', async () => {
    const d = river(preview);
    const pv = await d.currentPreview();
    const fold = pv!.options.find((o) => o.action.type === 'fold')!;
    expect(d.view.history).toEqual([]);
    expect((await d.act({ type: 'fold' })).ok).toBe(true);
    const [r] = d.view.history;
    expect(r).toEqual({
      n: 1,
      p: 'Qc7d',
      d: 'TdTs',
      b: 'KdJh9s5c2d',
      w: [1000, 500],
      a: [['r', 'fold', 'm', toRatio(fold.regret)]],
      net: d.view.result!.net,
    });
    // The next hand comes from the RNG: bet 4x on the table EV, which settles at once.
    expect((await d.act({ type: 'deal' })).ok).toBe(true);
    const pv2 = await d.currentPreview();
    const raise = pv2!.options.find((o) => o.action.type === 'play' && o.action.multiple === 4)!;
    expect((await d.act({ type: 'play', multiple: 4 })).ok).toBe(true);
    const h = d.view.history;
    expect(h.map((x) => x.n)).toEqual([2, 1]);
    expect(h[0]!.a).toEqual([['p', '4x', expect.any(String), toRatio(raise.regret)]]);
    expect(h[0]!.p).toHaveLength(4);
    expect(h[0]!.b).toHaveLength(10);
  });

  it('a decision without a preview is recorded without a tier', async () => {
    const d = river(noPreview);
    expect(await d.currentPreview()).toBeNull();
    expect((await d.act({ type: 'play', multiple: 1 })).ok).toBe(true);
    expect(d.view.history[0]!.a).toEqual([['r', '1x']]);
  });

  it('keeps at most HISTORY_LIMIT hands, restores them, and New session clears them', async () => {
    const d = river(noPreview);
    await d.act({ type: 'play', multiple: 1 });
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) {
      expect((await d.act({ type: 'deal' })).ok).toBe(true);
      expect((await d.act({ type: 'play', multiple: 4 })).ok).toBe(true);
    }
    const h = d.view.history;
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(h[0]!.n).toBe(HISTORY_LIMIT + 4);
    const snap = d.snapshotData();
    const d2 = new SimDriver({
      mode: 'sandbox',
      seed: 9,
      preview: noPreview,
      restore: {
        state: snap.state,
        startEquity: snap.startEquity,
        totals: snap.totals,
        history: snap.history,
      },
    });
    expect(d2.view.history).toEqual(h);
    d2.newSession(50_000);
    expect(d2.view.history).toEqual([]);
  });

  it('a hand reloaded mid-way keeps its notes in line with its decisions', async () => {
    const d = new SimDriver({
      mode: 'sandbox',
      seed: 5,
      preview,
      scene: {
        id: 'sandbox',
        version: 1,
        bets: { ante: 1000, trips: 0 },
        startAt: {
          street: 'preflop',
          deal: {
            player: ['6d', '6c'],
            dealer: ['Ah', 'Kh'],
            flop: ['2s', '9c', 'Jd'],
            turn: '3h',
            river: '8s',
          },
        },
      },
    });
    expect(await d.currentPreview()).not.toBeNull();
    expect((await d.act({ type: 'check' })).ok).toBe(true); // scored, then the page reloads
    const snap = d.snapshotData();
    const d2 = new SimDriver({
      mode: 'sandbox',
      seed: 9,
      preview,
      restore: { state: snap.state, startEquity: snap.startEquity, totals: snap.totals },
    });
    expect(d2.view.state.street).toBe('flop');
    expect(await d2.currentPreview()).toBeNull(); // no flop EV here
    expect((await d2.act({ type: 'check' })).ok).toBe(true);
    const pv = await d2.currentPreview();
    const fold = pv!.options.find((o) => o.action.type === 'fold')!;
    expect((await d2.act({ type: 'fold' })).ok).toBe(true);
    expect(d2.view.history[0]!.a).toEqual([
      ['p', 'check'],
      ['f', 'check'],
      ['r', 'fold', expect.any(String), toRatio(fold.regret)],
    ]);
  });

  it('auto-play adds nothing: its hands never pass through the driver', async () => {
    const d = river(noPreview);
    await d.act({ type: 'play', multiple: 1 });
    d.autoPlayCompleted(300, 'basic');
    expect(d.view.history).toHaveLength(1);
  });
});
