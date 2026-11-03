// I056: decisions graded small or worse are remembered as Drill spot codes, newest first, distinct,
// capped at 20, and they persist with the sandbox snapshot.
import { describe, expect, it } from 'vitest';
import { preflopPreview, riverPreview } from '../math/preview';
import { SimDriver } from '../scene';
import type { PreviewFn, SceneConfig } from '../scene';
import { spotFromCode } from '../strategy';
import { decodeSnapshot, encodeSnapshot } from './persist';

const preview: PreviewFn = (req) =>
  req.street === 'river'
    ? Promise.resolve(riverPreview(req))
    : req.street === 'preflop'
      ? Promise.resolve(preflopPreview(req))
      : Promise.reject(new Error('no flop EV in this test'));

const driver = (
  scene: Partial<SceneConfig>,
  restore?: ConstructorParameters<typeof SimDriver>[0]['restore'],
) =>
  new SimDriver({
    mode: 'sandbox',
    seed: 3,
    preview,
    scene: { id: 'sandbox', version: 1, bets: { ante: 1000 }, ...scene },
    ...(restore ? { restore } : {}),
  });

const AA_PREFLOP: Partial<SceneConfig> = {
  startAt: {
    street: 'preflop',
    deal: {
      player: ['As', 'Ah'],
      dealer: ['7d', '2c'],
      flop: ['Kd', 'Jh', '9s'],
      turn: '5c',
      river: '3d',
    },
  },
};
const RIVER_19_OUTS: Partial<SceneConfig> = {
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
};

describe('table mistakes become Drill spots', () => {
  it('checking AA preflop (a blunder) records the preflop spot; the best move records nothing', async () => {
    const bad = driver(AA_PREFLOP);
    const pv = await bad.currentPreview();
    const threeX = pv!.options.find((o) => o.action.type === 'play' && o.action.multiple === 3)!;
    expect(threeX.tier).toBe('blunder');
    // Bet 3x settles the hand at once (a scored hand), so the spot is committed.
    await bad.act({ type: 'play', multiple: 3 });
    expect(bad.view.state.street).toBe('settled');
    expect(bad.view.session.mistakeSpots).toEqual(['p:AsAh.']);
    const spot = spotFromCode('p:AsAh.');
    expect(spot.street).toBe('preflop');
    expect(spot.category).toBe('pre-premium');

    const good = driver(AA_PREFLOP);
    await good.currentPreview();
    await good.act({ type: 'play', multiple: 4 });
    expect(good.view.session.mistakeSpots).toEqual([]);
  });
  it('a river mistake encodes the full board and replays exactly', async () => {
    const d = driver(RIVER_19_OUTS);
    await d.currentPreview();
    await d.act({ type: 'fold' }); // 19 outs: Bet 1x is best
    const [code] = d.view.session.mistakeSpots;
    expect(code).toBe('r:Qc7d.KdJh9s5c2d');
    const spot = spotFromCode(code!);
    expect(spot.board).toHaveLength(5);
    expect(spot.category).toBe('river-outs-edge');
  });
  it('persists with the snapshot and restores; older snapshots have none', async () => {
    const d = driver(RIVER_19_OUTS);
    await d.currentPreview();
    await d.act({ type: 'fold' });
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as Record<string, unknown>;
    expect(snap.mistakeSpots).toEqual(['r:Qc7d.KdJh9s5c2d']);
    const dec = decodeSnapshot(snap, 'trips-8-6-5');
    expect(dec?.restore.mistakeSpots).toEqual(['r:Qc7d.KdJh9s5c2d']);
    delete snap.mistakeSpots;
    expect(decodeSnapshot(snap, 'trips-8-6-5')?.restore.mistakeSpots).toEqual([]);
  });
  it('restores only codes that parse as real spots, canonical and without repeats', () => {
    const d = driver(RIVER_19_OUTS);
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as Record<string, unknown>;
    snap.mistakeSpots = [
      'p:AsAh.',
      'junk',
      7,
      'p:AsAh.',
      'f:2dJd.4h6d9d',
      'p:AsAh.&street=river', // injected query text
      'r:Qc7d.KdJh9s5c', // river with a four-card board
      'p:AsAs.', // duplicate card
      'p:AsAh.Kd', // preflop with a board
    ];
    expect(decodeSnapshot(snap, 'trips-8-6-5')?.restore.mistakeSpots).toEqual([
      'p:AsAh.',
      'f:2dJd.4h6d9d',
    ]);
  });
  it('re-emits a valid but non-canonical code in its canonical form (and drops its repeat)', () => {
    const d = driver(RIVER_19_OUTS);
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as Record<string, unknown>;
    // Spaces between cards parse, but the code a driver writes has none.
    snap.mistakeSpots = ['f:2d Jd.4h 6d 9d', 'p:As Ah.', 'f:2dJd.4h6d9d'];
    expect(decodeSnapshot(snap, 'trips-8-6-5')?.restore.mistakeSpots).toEqual([
      'f:2dJd.4h6d9d',
      'p:AsAh.',
    ]);
  });
  it('a hand with a mistake and then a failed preview adds no spots (it is unscored)', async () => {
    // AA: check preflop (blunder, EV known), then check the flop where the preview fails.
    const d = driver(AA_PREFLOP);
    await d.currentPreview();
    await d.act({ type: 'check' });
    expect(d.view.state.street).toBe('flop');
    await d.currentPreview(); // rejects: no flop EV here
    await d.act({ type: 'check' });
    await d.currentPreview();
    await d.act({ type: 'play', multiple: 1 });
    expect(d.view.state.street).toBe('settled');
    expect(d.view.session.scored).toBe(0);
    expect(d.view.session.mistakes).toBe(0);
    expect(d.view.session.mistakeSpots).toEqual([]);
  });
  it('a new session clears the list', async () => {
    const d = driver(RIVER_19_OUTS);
    await d.currentPreview();
    await d.act({ type: 'fold' });
    expect(d.view.session.mistakeSpots).toHaveLength(1);
    d.newSession(50_000);
    expect(d.view.session.mistakeSpots).toEqual([]);
    expect(encodeSnapshot(d).mistakeSpots).toEqual([]);
  });
  it('keeps at most 20 distinct spots, newest first, across hands', async () => {
    const R = '23456789TJQKA';
    const fake = (n: number): string[] =>
      Array.from(
        { length: n },
        (_, i) => `p:${R[i % 13]}${'cs'[Math.floor(i / 13)]}${R[(i + 5) % 13]}d.`,
      );
    // Settle one hand (a fold), then restore that settled table with 20 saved spots.
    const first = driver(RIVER_19_OUTS);
    await first.currentPreview();
    await first.act({ type: 'fold' });
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(first))) as Record<string, unknown>;
    // The next hand is dealt from the restored RNG; its worst option is always a mistake.
    const play = async (saved: string[]) => {
      snap.mistakeSpots = saved;
      const dec = decodeSnapshot(snap, 'trips-8-6-5')!;
      const d = driver({}, dec.restore);
      expect((await d.act({ type: 'deal' })).ok).toBe(true);
      const pv = (await d.currentPreview())!;
      const worst = pv.options
        .filter((o) => o.action.type === 'play') // a bet settles the hand at once
        .sort((x, y) => Number(y.regret.num * x.regret.den - x.regret.num * y.regret.den))[0]!;
      expect(['small', 'costly', 'blunder']).toContain(worst.tier);
      const hole = d.view.state.hand!.deal.player;
      expect((await d.act(worst.action as never)).ok).toBe(true);
      expect(d.view.state.street).toBe('settled');
      const spots = d.view.session.mistakeSpots;
      expect(spotFromCode(spots[0]!).hole).toEqual(hole);
      return spots;
    };
    const twenty = fake(20);
    const a = await play(twenty);
    expect(a).toHaveLength(20);
    const CODE = a[0]!;
    expect(a.slice(1)).toEqual(twenty.slice(0, 19));
    // the same spot again moves to the front without a repeat
    const b = await play([...twenty.slice(0, 19), CODE]);
    expect(b).toHaveLength(20);
    expect(b[0]).toBe(CODE);
    expect(b.filter((c) => c === CODE)).toHaveLength(1);
  });
});
