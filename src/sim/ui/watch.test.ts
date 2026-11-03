// I078 Watch: the perfect-play loop against a fake driver (flow, stops, limits) and against the
// real SimDriver with exact previews (the moves it makes are the exact best ones).
import { afterAll, describe, expect, it } from 'vitest';
import type { Action, Street } from '../engine';
import type { DecisionOption, DecisionPreview } from '../math';
import { SimDriver } from '../scene';
import type { SceneConfig } from '../scene';
import { createEvClient } from '../worker/client';
import { runWatch, sleep, watchHands, watchPace, WATCH_MAX_HANDS } from './watch';
import type { WatchDriver, WatchProgress } from './watch';

const one = { num: 1n, den: 1n };
function option(action: DecisionOption['action']): DecisionOption {
  return {
    action,
    label: '',
    ev: one,
    evCents: one,
    regret: { num: 0n, den: 1n },
    tier: 'best',
  } as unknown as DecisionOption;
}
function preview(actions: DecisionOption['action'][], bestIndex: number, exact = true) {
  return { options: actions.map(option), bestIndex, exact } as unknown as DecisionPreview;
}

/** Every hand: deal → preflop; the first decision settles it. */
class FakeDriver implements WatchDriver {
  street: Street = 'betting';
  actions: Action[] = [];
  pv: DecisionPreview | null = preview([{ type: 'play', multiple: 4 }, { type: 'check' }], 0);
  dealsLeft = Infinity;
  get view() {
    return { state: { street: this.street } };
  }
  act(a: Action) {
    this.actions.push(a);
    if (a.type === 'deal') {
      if (this.dealsLeft-- <= 0)
        return Promise.resolve({ ok: false as const, message: 'Not enough chips.' });
      this.street = 'preflop';
    } else this.street = 'settled';
    return Promise.resolve({ ok: true as const });
  }
  currentPreview() {
    return Promise.resolve(this.pv);
  }
}

const now = () => Promise.resolve();
const run = (d: WatchDriver, hands: number, extra: Partial<Parameters<typeof runWatch>[1]> = {}) =>
  runWatch(d, {
    hands,
    pace: { thinkMs: 0, resultMs: 0 },
    signal: new AbortController().signal,
    sleep: now,
    ...extra,
  });

describe('runWatch (fake driver)', () => {
  it('deals, plays the preview best option and counts hands', async () => {
    const d = new FakeDriver();
    // The best option is the second one: the loop must follow bestIndex, not the first option.
    d.pv = preview([{ type: 'play', multiple: 4 }, { type: 'check' }], 1);
    const seen: WatchProgress[] = [];
    const r = await run(d, 3, { onProgress: (p) => seen.push(p) });
    expect(r).toEqual({ played: 3, end: 'done' });
    expect(d.actions).toEqual([
      { type: 'deal' },
      { type: 'check' },
      { type: 'deal' },
      { type: 'check' },
      { type: 'deal' },
      { type: 'check' },
    ]);
    // The option is announced (and highlighted) before it is played.
    expect(seen.slice(0, 3)).toEqual([
      { hand: 1, played: 0, option: null },
      { hand: 1, played: 0, option: 'check' },
      { hand: 1, played: 1, option: null },
    ]);
  });

  it('never plays more than 30 hands', async () => {
    const d = new FakeDriver();
    const r = await run(d, 500);
    expect(r.played).toBe(WATCH_MAX_HANDS);
    expect(d.actions.filter((a) => a.type === 'deal')).toHaveLength(30);
    expect(watchHands(0)).toBe(1);
    expect(watchHands(12.7)).toBe(12);
    expect(watchHands(Number.NaN)).toBe(1);
  });

  it('finishes a hand already on the table as hand 1', async () => {
    const d = new FakeDriver();
    d.street = 'preflop';
    const r = await run(d, 2);
    expect(r).toEqual({ played: 2, end: 'done' });
    expect(d.actions.map((a) => a.type)).toEqual(['play', 'deal', 'play']);
  });

  it('stops when a deal is refused, with the reason', async () => {
    const d = new FakeDriver();
    d.dealsLeft = 2;
    const r = await run(d, 10);
    expect(r).toEqual({ played: 2, end: 'blocked', message: 'Not enough chips.' });
  });

  it('never guesses: no exact EV stops the run', async () => {
    const d = new FakeDriver();
    d.pv = null;
    expect(await run(d, 5)).toEqual({ played: 0, end: 'no-ev' });
    const e = new FakeDriver();
    e.pv = preview([{ type: 'play', multiple: 4 }], 0, false);
    expect(await run(e, 5)).toEqual({ played: 0, end: 'no-ev' });
    expect(e.actions).toEqual([{ type: 'deal' }]);
  });

  it('Stop during the pause plays nothing more', async () => {
    const d = new FakeDriver();
    const ac = new AbortController();
    const r = await run(d, 30, {
      signal: ac.signal,
      onProgress: (p) => {
        if (p.option) ac.abort();
      },
      sleep: (ms, s) => sleep(ms, s),
      pace: { thinkMs: 10_000, resultMs: 0 },
    });
    expect(r).toEqual({ played: 0, end: 'stopped' });
    expect(d.actions).toEqual([{ type: 'deal' }]);
  });

  it('waits for the animation, then the think pause, before each move', async () => {
    const d = new FakeDriver();
    const waits: number[] = [];
    await run(d, 2, {
      pace: { thinkMs: 900, resultMs: 1800 },
      animMs: () => 300,
      sleep: (ms) => (waits.push(ms), Promise.resolve()),
    });
    // hand 1: anim, think; between hands: anim + result; hand 2: anim, think (no wait after the last).
    expect(waits).toEqual([300, 900, 2100, 300, 900]);
  });

  it('keeps a readable pace even with reduced motion', () => {
    expect(watchPace('normal')).toEqual({ thinkMs: 900, resultMs: 1800 });
    expect(watchPace('instant').thinkMs).toBeGreaterThanOrEqual(500);
  });
});

describe('runWatch (real driver, exact previews)', () => {
  const ev = createEvClient({ mode: 'inthread' });
  afterAll(() => ev.dispose());
  const driver = (scene: SceneConfig) =>
    new SimDriver({
      scene,
      mode: 'sandbox',
      seed: 1,
      preview: (req, o) => ev.run('preview', req, o),
    });

  it('bets 4x with aces and kings preflop (perfect preflop)', async () => {
    const d = driver({
      id: 'sandbox',
      version: 1,
      bankroll: 50_000,
      bets: { ante: 1_000 },
      deals: [
        {
          player: ['As', 'Ad'],
          dealer: ['2c', '7d'],
          flop: ['3h', '8s', '9c'],
          turn: 'Jd',
          river: '4s',
        },
        {
          player: ['Ks', 'Kd'],
          dealer: ['2d', '7h'],
          flop: ['3c', '8h', '9s'],
          turn: 'Jc',
          river: '4h',
        },
      ],
    });
    const moves: Action[] = [];
    const real = d.act.bind(d);
    d.act = (a) => (moves.push(a), real(a));
    const r = await run(d, 2);
    expect(r).toEqual({ played: 2, end: 'done' });
    expect(moves).toEqual([
      { type: 'deal' },
      { type: 'play', multiple: 4 },
      { type: 'deal' },
      { type: 'play', multiple: 4 },
    ]);
    // Both hands win the 4x Play plus Ante and Blind (dealer 7-high does not qualify: Ante pushes).
    expect(d.view.state.street).toBe('settled');
    expect(d.view.session.hands).toBe(2);
    expect(d.view.session.mistakes).toBe(0);
  });

  it('folds a river where the board plays and 27 cards beat it', async () => {
    const d = driver({
      id: 'sandbox',
      version: 1,
      bankroll: 50_000,
      bets: { ante: 1_000 },
      startAt: {
        street: 'river',
        deal: {
          player: ['3c', '4d'],
          dealer: ['Td', 'Ts'],
          flop: ['Ah', 'Ks', 'Qd'],
          turn: '9c',
          river: '7h',
        },
      },
    });
    const r = await run(d, 1);
    expect(r).toEqual({ played: 1, end: 'done' });
    expect(d.view.result?.outcome).toBe('fold');
    // Fold loses exactly the Ante and the Blind.
    expect(d.view.result?.net).toBe(-2_000);
  });
});
