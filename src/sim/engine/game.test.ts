import { describe, expect, it } from 'vitest';
import { cardCode, parseCards } from './cards';
import {
  applyAction,
  createGame,
  equity,
  legalActions,
  replay,
  startHand,
  visibleView,
} from './game';
import { resolveRules } from './rules';
import { applyLogged, replayLog } from './log';
import { validateAction } from './validate';
import type { Action, GameEvent, GameState, LogEntry, ValidationCode } from './types';

const A = (s: GameState, a: Action): { state: GameState; events: GameEvent[] } => {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error.message}`);
  return r;
};
const code = (s: GameState, a: Action): ValidationCode | 'ok' => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.code;
};
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
const types = (e: GameEvent[]): string[] => e.map((x) => x.type);

// A hand where the player has a pair of aces over a dealer 9-high board.
const FORCED = {
  player: ['Ah', 'Ad'] as const,
  dealer: ['9s', '8d'] as const,
  flop: ['2c', '5h', 'Jd'] as const,
  turn: '7s',
  river: 'Kc',
};

function fresh(extra = {}): GameState {
  return createGame({ seed: 7, bets: { ante: 1000, trips: 500 }, forcedDeals: [FORCED], ...extra });
}

describe('validateAction: one test per code', () => {
  const s = fresh();
  it('wrong-street', () => {
    expect(code(s, { type: 'check' })).toBe('wrong-street');
    expect(code(s, { type: 'fold' })).toBe('wrong-street');
    expect(code(s, { type: 'clear' })).toBe('wrong-street');
    expect(code(s, { type: 'play', multiple: 4 })).toBe('wrong-street');
    const pre = A(s, { type: 'deal' }).state;
    expect(code(pre, { type: 'deal' })).toBe('wrong-street');
    expect(code(pre, { type: 'set-bet', wager: 'ante', amount: 1000 })).toBe('wrong-street');
    expect(code(pre, { type: 'fold' })).toBe('wrong-street');
    const river = A(A(pre, { type: 'check' }).state, { type: 'check' }).state;
    expect(code(river, { type: 'check' })).toBe('wrong-street');
    expect(code(river, { type: 'fold' })).toBe('ok');
  });
  it('bad-amount', () => {
    expect(code(s, { type: 'set-bet', wager: 'ante', amount: 1050 })).toBe('bad-amount');
    expect(code(s, { type: 'set-bet', wager: 'ante', amount: 0 })).toBe('bad-amount');
    expect(code(s, { type: 'set-bet', wager: 'trips', amount: -100 })).toBe('bad-amount');
    expect(code(s, { type: 'set-bet', wager: 'ante', amount: 10.5 })).toBe('bad-amount');
    expect(code(s, { type: 'set-bet', wager: 'trips', amount: 0 })).toBe('ok');
  });
  it('below-min / above-max', () => {
    expect(code(s, { type: 'set-bet', wager: 'ante', amount: 400 })).toBe('below-min');
    expect(code(s, { type: 'set-bet', wager: 'ante', amount: 60_000 })).toBe('above-max');
    expect(code(s, { type: 'set-bet', wager: 'trips', amount: 20_000 })).toBe('above-max');
    const s2 = createGame({ bets: { ante: 1000 } });
    expect(code(s2, { type: 'set-bet', wager: 'trips', amount: 100 })).toBe('ok');
  });
  it('needs-ante', () => {
    const e = createGame();
    expect(code(e, { type: 'set-bet', wager: 'trips', amount: 100 })).toBe('needs-ante');
    expect(code(e, { type: 'deal' })).toBe('needs-ante');
  });
  it('insufficient-funds', () => {
    const poor = createGame({ bankroll: 2500, bets: { ante: 1000 } });
    expect(code(poor, { type: 'set-bet', wager: 'ante', amount: 1500 })).toBe('insufficient-funds');
    expect(code(poor, { type: 'set-bet', wager: 'trips', amount: 600 })).toBe('insufficient-funds');
    expect(code(poor, { type: 'set-bet', wager: 'trips', amount: 500 })).toBe('ok');
    const pre = A(poor, { type: 'deal' }).state; // rack = 500
    expect(code(pre, { type: 'play', multiple: 4 })).toBe('insufficient-funds');
    expect(code(pre, { type: 'check' })).toBe('ok');
  });
  it('bad-multiple', () => {
    const pre = A(s, { type: 'deal' }).state;
    expect(code(pre, { type: 'play', multiple: 2 })).toBe('bad-multiple');
    expect(code(pre, { type: 'play', multiple: 1 })).toBe('bad-multiple');
    expect(code(pre, { type: 'play', multiple: 3 })).toBe('ok');
    const flop = A(pre, { type: 'check' }).state;
    expect(code(flop, { type: 'play', multiple: 4 })).toBe('bad-multiple');
    expect(code(flop, { type: 'play', multiple: 2 })).toBe('ok');
    const river = A(flop, { type: 'check' }).state;
    expect(code(river, { type: 'play', multiple: 2 })).toBe('bad-multiple');
  });
  it('warning cant-afford-max-raise', () => {
    const poor = createGame({ bankroll: 3000, bets: { ante: 1000 } }); // rack 1000 < 4 x 1000
    const v = validateAction(poor, { type: 'deal' });
    expect(v.ok && v.warnings.map((w) => w.code)).toEqual(['cant-afford-max-raise']);
    const rich = validateAction(s, { type: 'deal' });
    expect(rich.ok && rich.warnings).toEqual([]);
  });
  it('settled: deal re-bets and checks funds', () => {
    const done = A(A(s, { type: 'deal' }).state, { type: 'play', multiple: 4 }).state;
    expect(done.street).toBe('settled');
    expect(code(done, { type: 'clear' })).toBe('ok');
    const broke: GameState = { ...done, bankroll: 2000 };
    expect(code(broke, { type: 'deal' })).toBe('insufficient-funds');
    expect(code(broke, { type: 'set-bet', wager: 'ante', amount: 1000 })).toBe(
      'insufficient-funds',
    );
  });
});

describe('flow: one full hand per path, with event order', () => {
  it('4x preflop ends the hand in one action', () => {
    const s0 = fresh();
    const d = A(s0, { type: 'deal' });
    expect(types(d.events)).toEqual(['hand-started', 'player-dealt', 'dealer-dealt']);
    expect(JSON.stringify(d.events)).not.toContain('9s'); // no dealer cards pre-reveal
    expect(d.events[1]).toMatchObject({ type: 'player-dealt' });
    const r = A(d.state, { type: 'play', multiple: 4 });
    expect(types(r.events)).toEqual([
      'played',
      'board-dealt',
      'board-dealt',
      'dealer-revealed',
      'showdown',
      'wager-settled',
      'wager-settled',
      'wager-settled',
      'wager-settled',
      'hand-settled',
    ]);
    expect(r.state.street).toBe('settled');
    const res = r.state.hand!.result!;
    expect(res.outcome).toBe('win');
    // pair of aces beats dealer 9-high: ante 0 (not qualified), blind push, play +4000, trips -500
    expect(res.net).toBe(0 + 0 + 4000 - 500);
    expect(res.dealerQualifies).toBe(false);
    expect(res.ifPlayed).toBeUndefined();
    expect(r.state.bankroll).toBe(50_000 + 3500);
  });
  it('check, 2x on the flop', () => {
    const d = A(fresh(), { type: 'deal' }).state;
    const c = A(d, { type: 'check' });
    expect(types(c.events)).toEqual(['checked', 'board-dealt']);
    expect(c.state.street).toBe('flop');
    expect(visibleView(c.state).board.map(cardCode)).toEqual(['2c', '5h', 'Jd']);
    const r = A(c.state, { type: 'play', multiple: 2 });
    expect(types(r.events).slice(0, 3)).toEqual(['played', 'board-dealt', 'dealer-revealed']);
    expect(r.state.hand!.play).toEqual({ multiple: 2, street: 'flop' });
  });
  it('check, check, 1x at the river', () => {
    let s = A(fresh(), { type: 'deal' }).state;
    s = A(s, { type: 'check' }).state;
    const c = A(s, { type: 'check' });
    expect(types(c.events)).toEqual(['checked', 'board-dealt']);
    expect(visibleView(c.state).board).toHaveLength(5);
    const r = A(c.state, { type: 'play', multiple: 1 });
    expect(types(r.events)[0]).toBe('played');
    expect(types(r.events)).not.toContain('board-dealt');
    expect(r.state.hand!.decisions.map((x) => x.street)).toEqual(['preflop', 'flop', 'river']);
  });
  it('fold reveals the dealer (D7) and still settles Trips', () => {
    let s = A(fresh(), { type: 'deal' }).state;
    s = A(A(s, { type: 'check' }).state, { type: 'check' }).state;
    const f = A(s, { type: 'fold' });
    expect(types(f.events)).toEqual([
      'folded',
      'dealer-revealed',
      'wager-settled',
      'wager-settled',
      'wager-settled',
      'hand-settled',
    ]);
    const res = f.state.hand!.result!;
    expect(res.outcome).toBe('fold');
    expect(res.ifPlayed).toMatchObject({ outcome: 'win' });
    expect(res.net).toBe(-2000 - 500);
    expect(f.state.stats.folds).toBe(1);
    expect(f.state.hand!.folded).toBe(true);
  });
  it('visibleView hides the dealer and unseen board', () => {
    const d = A(fresh(), { type: 'deal' }).state;
    const v = visibleView(d);
    expect(v.hole!.map(cardCode)).toEqual(['Ah', 'Ad']);
    expect(v.board).toEqual([]);
    expect(v.played).toBe(false);
    expect(JSON.stringify(v)).not.toContain('dealer');
    expect(visibleView(createGame()).hole).toBeNull();
  });
  it('legalActions', () => {
    const s = fresh();
    expect(legalActions(s)).toEqual([{ type: 'deal' }]);
    const d = A(s, { type: 'deal' }).state;
    expect(legalActions(d)).toEqual([
      { type: 'check' },
      { type: 'play', multiple: 4 },
      { type: 'play', multiple: 3 },
    ]);
    const r = A(A(d, { type: 'check' }).state, { type: 'check' }).state;
    expect(legalActions(r)).toEqual([{ type: 'play', multiple: 1 }, { type: 'fold' }]);
  });
});

describe('money', () => {
  it('conserves money: equity before + net = equity after, every hand', () => {
    let s = createGame({ seed: 99, bankroll: 5_000_000, bets: { ante: 1000, trips: 300 } });
    let prevEq = equity(s);
    const paths: Action[][] = [
      [{ type: 'play', multiple: 4 }],
      [{ type: 'play', multiple: 3 }],
      [{ type: 'check' }, { type: 'play', multiple: 2 }],
      [{ type: 'check' }, { type: 'check' }, { type: 'play', multiple: 1 }],
      [{ type: 'check' }, { type: 'check' }, { type: 'fold' }],
    ];
    for (let i = 0; i < 100; i++) {
      s = A(s, { type: 'deal' }).state;
      expect(equity(s)).toBe(prevEq);
      for (const a of paths[i % 5]!) {
        s = A(s, a).state;
        if (s.street !== 'settled') expect(equity(s)).toBe(prevEq);
      }
      expect(s.street).toBe('settled');
      expect(equity(s)).toBe(prevEq + s.hand!.result!.net);
      prevEq = equity(s);
    }
    const sum = Object.values(s.stats.net).reduce((a, b) => a + b, 0);
    expect(5_000_000 + sum).toBe(equity(s));
    expect(s.stats.hands).toBe(100);
    expect(s.stats.wins + s.stats.losses + s.stats.ties + s.stats.folds).toBe(100);
  });
  it('set-bet moves chips between rack and felt; clear keeps the rack', () => {
    let s = createGame({ bankroll: 10_000 });
    s = A(s, { type: 'set-bet', wager: 'ante', amount: 1000 }).state;
    expect(s.bankroll).toBe(8000);
    expect(s.bets).toMatchObject({ ante: 1000, blind: 1000 });
    s = A(s, { type: 'set-bet', wager: 'trips', amount: 500 }).state;
    expect(s.bankroll).toBe(7500);
    s = A(s, { type: 'set-bet', wager: 'ante', amount: 500 }).state;
    expect(s.bankroll).toBe(8500);
    expect(equity(s)).toBe(10_000);
    s = A(s, { type: 'set-bet', wager: 'trips', amount: 0 }).state;
    expect(s.bankroll).toBe(9000);
  });
  it('settled → set-bet → deal re-bets from the rack; clear zeroes the bets', () => {
    let s = fresh();
    s = A(A(s, { type: 'deal' }).state, { type: 'play', multiple: 4 }).state;
    const bank = s.bankroll;
    s = A(s, { type: 'set-bet', wager: 'ante', amount: 2000 }).state;
    expect(s.bankroll).toBe(bank);
    expect(s.street).toBe('settled');
    const d = A(s, { type: 'deal' }).state;
    expect(d.bankroll).toBe(bank - 4000 - 500);
    expect(equity(d)).toBe(bank);
    const c = A(s, { type: 'clear' });
    expect(c.state.bets).toEqual({ ante: 0, blind: 0, play: 0, trips: 0 });
    expect(c.state.hand).toBeNull();
    expect(c.events).toEqual([{ type: 'cleared' }]);
  });
});

describe('createGame', () => {
  it('startAt flop / river / preflop positions the hand', () => {
    const f = createGame({
      startAt: { street: 'flop', deal: { player: ['Ah', '7c'], flop: ['7d', 'Ks', '2c'] } },
    });
    expect(f.street).toBe('flop');
    expect(visibleView(f).board).toHaveLength(3);
    expect(f.bets.ante).toBe(1000);
    expect(f.bankroll).toBe(50_000 - 2000);
    const r = createGame({
      startAt: {
        street: 'river',
        deal: { player: ['Td', '4c'], flop: ['Kh', '7d', '3s'], turn: 'Ts', river: '2c' },
      },
    });
    expect(r.street).toBe('river');
    expect(r.hand!.decisions).toHaveLength(0);
    const p = createGame({ startAt: { street: 'preflop', deal: { player: ['Ac', '3d'] } } });
    expect(p.street).toBe('preflop');
    const played = createGame({
      startAt: {
        street: 'flop',
        deal: { player: ['Ah', '7c'], flop: ['7d', 'Ks', '2c'] },
        play: 2,
      },
    });
    expect(played.street).toBe('settled');
  });
  it('throws on invalid options', () => {
    expect(() =>
      createGame({ startAt: { street: 'flop', deal: { player: ['Ah', '7c'] } } }),
    ).toThrow();
    expect(() => createGame({ bets: { ante: 50 } })).toThrow();
    expect(() => createGame({ bets: { trips: 100 } })).toThrow();
    expect(() => createGame({ forcedDeals: [{ player: ['As', 'As'] }] })).toThrow();
    expect(() => createGame({ bankroll: 500, bets: { ante: 1000 } })).toThrow();
  });
  it('forced deals are consumed FIFO then the RNG takes over', () => {
    const s = createGame({
      seed: 3,
      bets: { ante: 1000 },
      forcedDeals: [{ player: ['As', 'Ks'] }, { player: ['2c', '2d'] }],
    });
    const h1 = A(s, { type: 'deal' }).state;
    expect(h1.forcedDeals).toHaveLength(1);
    expect(h1.hand!.deal.player.map(cardCode)).toEqual(['As', 'Ks']);
    const h1s = A(A(h1, { type: 'play', multiple: 4 }).state, { type: 'deal' }).state;
    expect(h1s.hand!.deal.player.map(cardCode)).toEqual(['2c', '2d']);
    expect(h1s.hand!.deal.forced).toBe(true);
    const h3 = A(A(h1s, { type: 'play', multiple: 4 }).state, { type: 'deal' }).state;
    expect(h3.hand!.deal.forced).toBe(false);
    expect(h3.forcedDeals).toHaveLength(0);
  });
});

describe('replay and log', () => {
  it('replays to an identical state and log', () => {
    const initial = createGame({ seed: 5, bankroll: 5_000_000, bets: { ante: 1000, trips: 500 } });
    const actions: Action[] = [];
    let s = initial;
    let log: readonly LogEntry[] = [];
    for (let i = 0; i < 30; i++) {
      for (const a of [
        { type: 'deal' },
        { type: 'check' },
        { type: 'check' },
        { type: 'fold' },
      ] as Action[]) {
        const l = applyLogged(s, log, a);
        if (!l.result.ok) throw new Error('bad');
        s = l.result.state;
        log = l.log;
        actions.push(a);
      }
    }
    expect(replay(initial, actions)).toEqual(s);
    expect(replayLog(initial, log)).toEqual(s);
    expect(log).toHaveLength(120);
    expect(log[119]!.seq).toBe(120);
    const bad = applyLogged(s, log, { type: 'check' });
    expect(bad.result.ok).toBe(false);
    expect(bad.log).toBe(log);
    expect(() => replay(initial, [{ type: 'check' }])).toThrow(/invalid/);
  });
  it('never mutates deep-frozen inputs', () => {
    let s = deepFreeze(fresh());
    for (const a of [
      { type: 'deal' },
      { type: 'check' },
      { type: 'check' },
      { type: 'play', multiple: 1 },
      { type: 'set-bet', wager: 'trips', amount: 100 },
      { type: 'deal' },
      { type: 'play', multiple: 3 },
      { type: 'clear' },
    ] as Action[]) {
      s = deepFreeze(A(s, a).state);
    }
    expect(s.street).toBe('betting');
  });
  it('failed actions return the same state', () => {
    const s = fresh();
    const r = applyAction(s, { type: 'check' });
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
  });
  it('same seed gives the same hands', () => {
    const a = A(createGame({ seed: 123, bets: { ante: 1000 } }), { type: 'deal' }).state;
    const b = A(createGame({ seed: 123, bets: { ante: 1000 } }), { type: 'deal' }).state;
    expect(a).toEqual(b);
    expect(parseCards('As').length).toBe(1);
  });
});

describe('startHand (mid-session)', () => {
  it('keeps stats and the RNG stream, and records no fake decisions', () => {
    let s = createGame({ seed: 4, bankroll: 5_000_000, bets: { ante: 1000 } });
    s = A(A(s, { type: 'deal' }).state, { type: 'play', multiple: 4 }).state;
    const stats = s.stats;
    const r = startHand(s, {
      street: 'river',
      deal: { player: ['Td', '4c'], flop: ['Kh', '7d', '3s'], turn: 'Ts', river: '2c' },
    });
    if (!r.ok) throw new Error('startHand');
    expect(r.state.stats).toEqual(stats);
    expect(r.state.rng).not.toEqual(s.rng); // dealHand advanced the same stream
    expect(r.state.handCount).toBe(2);
    expect(r.state.street).toBe('river');
    expect(r.state.hand!.decisions).toEqual([]);
    expect(r.state.hand!.boardShown).toBe(5);
    expect(equity(r.state)).toBe(equity(s));
    expect(types(r.events)).toEqual([
      'hand-started',
      'player-dealt',
      'dealer-dealt',
      'board-dealt',
      'board-dealt',
    ]);
  });
  it('with play: emits hand-settled and records only the play decision', () => {
    const s = createGame({ seed: 4, bets: { ante: 1000 } });
    const r = startHand(s, {
      street: 'flop',
      deal: { player: ['Ah', '7c'], flop: ['7d', 'Ks', '2c'] },
      play: 2,
    });
    if (!r.ok) throw new Error('startHand');
    expect(types(r.events)).toContain('hand-settled');
    expect(r.state.street).toBe('settled');
    expect(r.state.hand!.decisions).toEqual([
      { street: 'flop', action: { type: 'play', multiple: 2 } },
    ]);
    expect(r.state.stats.hands).toBe(1);
  });
  it('fails cleanly when the deal is not affordable or incomplete', () => {
    const s = createGame({ bankroll: 1000 });
    const r = startHand(s, { street: 'preflop', deal: { player: ['Ah', '7c'] } });
    expect(r.ok).toBe(false);
    expect(() => startHand(s, { street: 'flop', deal: { player: ['Ah', '7c'] } })).toThrow();
  });
});

describe('resolveRules', () => {
  it('rejects an odd or non-positive betUnit and keeps the default ante floor', () => {
    expect(() => resolveRules({ betUnit: 101 })).toThrow(/even/);
    expect(() => resolveRules({ betUnit: 0 })).toThrow();
    expect(resolveRules({ betUnit: 200 }).betUnit).toBe(200);
    const g = createGame({
      rules: { anteMin: 2500 },
      startAt: { street: 'preflop', deal: { player: ['Ac', '3d'] } },
    });
    expect(g.bets.ante).toBe(2500);
  });
});
