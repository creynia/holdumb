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
    const check = pv!.options.find((o) => o.action.type === 'check')!;
    expect(check.tier).toBe('blunder');
    await bad.act({ type: 'check' });
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
    snap.mistakeSpots = ['p:AsAh.', 'junk', 7, 'p:AsAh.', 'f:2dJd.4h6d9d'];
    expect(decodeSnapshot(snap, 'trips-8-6-5')?.restore.mistakeSpots).toEqual([
      'p:AsAh.',
      'f:2dJd.4h6d9d',
    ]);
  });
  it('keeps at most 20 distinct spots, newest first', async () => {
    const R = '23456789TJQKA';
    const fake = (n: number): string[] =>
      Array.from(
        { length: n },
        (_, i) => `p:${R[i % 13]}${'cs'[Math.floor(i / 13)]}${R[(i + 5) % 13]}d.`,
      );
    const mid = driver(RIVER_19_OUTS);
    await mid.currentPreview();
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(mid))) as Record<string, unknown>;
    const CODE = 'r:Qc7d.KdJh9s5c2d';
    const play = async (saved: string[]) => {
      snap.mistakeSpots = saved;
      const dec = decodeSnapshot(snap, 'trips-8-6-5')!;
      const d = driver({}, dec.restore);
      await d.currentPreview();
      await d.act({ type: 'fold' });
      return d.view.session.mistakeSpots;
    };
    const twenty = fake(20);
    const a = await play(twenty);
    expect(a).toHaveLength(20);
    expect(a[0]).toBe(CODE);
    expect(a.slice(1)).toEqual(twenty.slice(0, 19));
    // the same spot again moves to the front without a repeat
    const withCode = [...twenty.slice(0, 19), CODE];
    const b = await play(withCode);
    expect(b).toHaveLength(20);
    expect(b[0]).toBe(CODE);
    expect(b.filter((c) => c === CODE)).toHaveLength(1);
  });
});
