import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import { applyAction, createGame } from './game';
import {
  HISTORY_LIMIT,
  HISTORY_RECORD_BYTES,
  choiceOf,
  handRecord,
  pushRecord,
  recordPlay,
  recordResult,
} from './log';
import type { HandRecord } from './log';
import { DEFAULT_RULES } from './rules';
import type { Card, HandState } from './types';

/** Plays a forced hand to the end with the given decisions and returns its settled state. */
function settle(
  deal: { player: string; dealer: string; board: string },
  decisions: readonly ('check' | 'fold' | 1 | 2 | 3 | 4)[],
  bets = { ante: 1000, trips: 500 },
) {
  const b = parseCards(deal.board);
  const c = (i: number) => b[i]!;
  const [p1, p2] = parseCards(deal.player) as [Card, Card];
  const [d1, d2] = parseCards(deal.dealer) as [Card, Card];
  const code = (x: Card) => `${'23456789TJQKA'.charAt(x >> 2)}${'shdc'.charAt(x & 3)}` as const;
  let state = createGame({
    seed: 1,
    bets,
    forcedDeals: [
      {
        player: [code(p1), code(p2)],
        dealer: [code(d1), code(d2)],
        flop: [code(c(0)), code(c(1)), code(c(2))],
        turn: code(c(3)),
        river: code(c(4)),
      },
    ],
  });
  let r = applyAction(state, { type: 'deal' });
  if (!r.ok) throw new Error(r.error.message);
  state = r.state;
  for (const d of decisions) {
    r = applyAction(
      state,
      d === 'check'
        ? { type: 'check' }
        : d === 'fold'
          ? { type: 'fold' }
          : { type: 'play', multiple: d },
    );
    if (!r.ok) throw new Error(r.error.message);
    state = r.state;
  }
  if (state.street !== 'settled' || !state.hand?.result) throw new Error('not settled');
  return { hand: state.hand as HandState & { result: NonNullable<HandState['result']> }, state };
}

describe('HandRecord (engine/log.ts)', () => {
  it('records the deal, wagers, choices with tier and exact regret, and the net', () => {
    const { hand } = settle({ player: 'As7c', dealer: 'TdTs', board: 'Kd9h5c3s2d' }, [
      'check',
      'check',
      'fold',
    ]);
    const r = handRecord(hand, hand.result, { ante: 1000, trips: 500 }, [
      { tier: 'b', regret: '0' },
      null,
      { tier: 'm', regret: '317/990' },
    ]);
    expect(r).toEqual({
      n: 1,
      p: 'As7c',
      d: 'TdTs',
      b: 'Kd9h5c3s2d',
      w: [1000, 500],
      a: [
        ['p', 'check', 'b', '0'],
        ['f', 'check'],
        ['r', 'fold', 'm', '317/990'],
      ],
      net: hand.result.net,
    });
    expect(recordPlay(r)).toEqual({ play: null, folded: true });
    expect(choiceOf({ type: 'play', multiple: 4 })).toBe('4x');
  });

  it('re-derives the settlement from the deal instead of storing it', () => {
    const { hand, state } = settle({ player: 'AhTc', dealer: '9d9s', board: '7dKs2c5h8h' }, [
      'check',
      2,
    ]);
    const r = handRecord(hand, hand.result, { ante: 1000, trips: 500 }, [null, null]);
    expect(recordPlay(r)).toEqual({ play: { multiple: 2 }, folded: false });
    const again = recordResult(r, state.rules);
    expect(again.net).toBe(hand.result.net);
    expect(again.outcome).toBe(hand.result.outcome);
    expect(again.wagers).toEqual(hand.result.wagers);
    expect(again.player.category).toBe(hand.result.player.category);
    expect(() => recordResult({ ...r, b: 'Kd9h' }, DEFAULT_RULES)).toThrow();
  });

  it('stays under the byte budget with three scored decisions and long exact ratios', () => {
    const { hand } = settle({ player: 'Qc7d', dealer: 'TdTs', board: 'KdJh9s5c2d' }, [
      'check',
      'check',
      1,
    ]);
    // The longest exact regrets each street can produce (in antes, unreduced): preflop over the
    // table's check denominator 20975724000 (regret < 3 antes), the flop over 1081 turn-river
    // pairs x 990 dealer hands = 1070190, the river over 990 dealer hands.
    const r = handRecord(hand, hand.result, { ante: 50_000, trips: 10_000 }, [
      { tier: 'x', regret: '62927171999/20975724000' },
      { tier: 'm', regret: '2140379/1070190' },
      { tier: 's', regret: '1979/990' },
    ]);
    const bytes = new TextEncoder().encode(JSON.stringify(r)).length;
    expect(bytes).toBeLessThanOrEqual(HISTORY_RECORD_BYTES);
  });

  it('keeps the newest first and at most HISTORY_LIMIT records', () => {
    let h: HandRecord[] = [];
    for (let n = 1; n <= HISTORY_LIMIT + 5; n++) {
      h = pushRecord(h, { n, p: 'AsKd', d: 'TdTs', b: 'Kd9h5c3s2d', w: [1000, 0], a: [], net: 0 });
    }
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(h[0]!.n).toBe(HISTORY_LIMIT + 5);
    expect(h[HISTORY_LIMIT - 1]!.n).toBe(6);
  });
});
