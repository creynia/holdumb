import { describe, expect, it } from 'vitest';
import { createGame, parseCards } from '../engine';
import type { Card, GameEvent, HandResult } from '../engine';
import {
  FLOP_HIDDEN_PAIR,
  FOLDED_DEALER_CARDS,
  FOLDED_RESULT,
  PREFLOP_AA,
  WON_RESULT,
} from './fixtures';
import {
  MAX_LOGGED_HANDS,
  appendEvents,
  cardText,
  decodeMoveLog,
  eventsForHandInProgress,
  formatLine,
} from './moveLogData';
import type { AppendContext, LoggedHand } from './moveLogData';
import { DECISION_TIER_LABEL } from './text';

const c = (s: string) => parseCards(s);
const ctx: AppendContext = {
  bets: { ante: 1000, trips: 500 },
  preview: null,
  tripsPaytable: 'trips-8-6-5',
};
const text = (hands: readonly LoggedHand[], mode: 'before' | 'after' | 'never' = 'before') =>
  hands[0]!.lines.map((l) => formatLine(l, mode));

const dealEvents: GameEvent[] = [
  { type: 'hand-started', n: 3, forced: false },
  { type: 'player-dealt', cards: c('Ah 7c') as [Card, Card] },
  { type: 'dealer-dealt' },
];

describe('move log lines', () => {
  it('cardText uses suit symbols and 10 for tens', () => {
    expect(c('As Td 2h Kc').map(cardText)).toEqual(['A♠', '10♦', '2♥', 'K♣']);
  });

  it('a deal line names the bets and the hole cards; the newest hand comes first', () => {
    const one = appendEvents([], dealEvents, ctx);
    expect(text(one)).toEqual(['Ante $10, Blind $10, Trips $5. You: A♥ 7♣.']);
    const two = appendEvents(one, [{ type: 'hand-started', n: 4, forced: false }], {
      ...ctx,
      bets: { ante: 2500, trips: 0 },
    });
    expect(two.map((h) => h.n)).toEqual([4, 3]);
    expect(text(two)).toEqual(['Ante $25, Blind $25.']);
  });

  it('a mistake names its tier and its cost against the best option, in exact cents', () => {
    const pv = FLOP_HIDDEN_PAIR.preview;
    const check = pv.options.find((o) => o.action.type === 'check')!;
    let h = appendEvents([], dealEvents, ctx);
    h = appendEvents(h, [{ type: 'checked', street: 'flop' }], { ...ctx, preview: pv });
    // round(178661/178365 x $10) = 1002c, round(93143/178365 x $10) = 522c: costs $4.80.
    expect(text(h)[1]).toBe(
      `Flop: Check. ${DECISION_TIER_LABEL[check.tier]}, costs $4.80 against Bet 2x.`,
    );
    expect(check.tier).not.toBe('best');
  });

  it('the best play says so; the Play bet amount is shown', () => {
    const pv = PREFLOP_AA.preview;
    let h = appendEvents([], dealEvents, ctx);
    h = appendEvents(h, [{ type: 'played', street: 'preflop', multiple: 4, amount: 4000 }], {
      ...ctx,
      preview: pv,
    });
    expect(text(h)[1]).toBe('Preflop: Bet 4x ($40). Best play.');
  });

  it("'never' mode drops tier and cost; no preview or another street's preview gives none", () => {
    let h = appendEvents([], dealEvents, ctx);
    h = appendEvents(h, [{ type: 'checked', street: 'flop' }], {
      ...ctx,
      preview: FLOP_HIDDEN_PAIR.preview,
    });
    expect(text(h, 'never')[1]).toBe('Flop: Check.');
    expect(text(h, 'after')[1]).toMatch(/costs \$4\.80 against Bet 2x\.$/);
    // A preflop preview must never score a flop move.
    const other = appendEvents(h, [{ type: 'checked', street: 'flop' }], {
      ...ctx,
      preview: PREFLOP_AA.preview,
    });
    expect(text(other)[2]).toBe('Flop: Check.');
    const none = appendEvents(h, [{ type: 'folded' }], ctx);
    expect(text(none)[2]).toBe('River: Fold.');
  });

  it('board, dealer and settlement lines', () => {
    let h = appendEvents([], dealEvents, ctx);
    h = appendEvents(
      h,
      [
        { type: 'board-dealt', street: 'flop', cards: c('7d Ks 2c') },
        { type: 'board-dealt', street: 'turn-river', cards: c('9h Td') },
        {
          type: 'dealer-revealed',
          cards: FOLDED_DEALER_CARDS,
          hand: FOLDED_RESULT.dealer,
          qualifies: true,
        },
        { type: 'hand-settled', result: WON_RESULT },
      ],
      ctx,
    );
    expect(text(h).slice(1)).toEqual([
      'Flop: 7♦ K♠ 2♣.',
      'Turn and river: 9♥ 10♦.',
      'Dealer: 10♦ 10♠, a pair of tens, qualifies.',
      expect.stringMatching(/Net \+\$50\.$/),
    ]);
    const res = h[0]!.lines.at(-1)!;
    expect(res.t === 'result' && res.net).toBe(5000);
  });

  it("the result line names the table's Trips preset, as the toast does (I011)", () => {
    const win: HandResult = {
      ...WON_RESULT,
      player: { ...WON_RESULT.player, category: 'full-house' },
      wagers: [{ wager: 'trips', amount: 1000, result: 'win', profit: 9000, reason: 'trips-pays' }],
      net: 9000,
    };
    const settle = (tripsPaytable: AppendContext['tripsPaytable']) =>
      text(
        appendEvents(appendEvents([], dealEvents, ctx), [{ type: 'hand-settled', result: win }], {
          ...ctx,
          tripsPaytable,
        }),
      ).at(-1);
    expect(settle('trips-9-7-4')).toContain('full house pays 9 to 1 on Trips 9/7/4');
    expect(settle('trips-8-6-5')).toContain('full house pays 8 to 1 on Trips 8/6/5');
    // Stored at append time, so a reload keeps the preset the hand settled at.
    const h = appendEvents(
      appendEvents([], dealEvents, ctx),
      [{ type: 'hand-settled', result: win }],
      {
        ...ctx,
        tripsPaytable: 'trips-9-7-4',
      },
    );
    expect(text(decodeMoveLog(JSON.parse(JSON.stringify(h)))).at(-1)).toContain('on Trips 9/7/4');
  });

  it('events with no line (bets, dealer face down, clear) add nothing', () => {
    const h = appendEvents([], dealEvents, ctx);
    const same = appendEvents(
      h,
      [
        { type: 'bet-set', wager: 'ante', from: 1000, to: 1500 },
        { type: 'dealer-dealt' },
        { type: 'cleared' },
      ],
      ctx,
    );
    expect(same).toEqual(h);
  });

  it(`keeps at most ${MAX_LOGGED_HANDS} hands`, () => {
    let h: LoggedHand[] = [];
    for (let n = 1; n <= MAX_LOGGED_HANDS + 5; n++)
      h = appendEvents(h, [{ type: 'hand-started', n, forced: false }], ctx);
    expect(h).toHaveLength(MAX_LOGGED_HANDS);
    expect(h[0]!.n).toBe(MAX_LOGGED_HANDS + 5);
  });
});

describe('decodeMoveLog', () => {
  it('round-trips a log through JSON', () => {
    let h = appendEvents([], dealEvents, ctx);
    h = appendEvents(h, [{ type: 'checked', street: 'flop' }], {
      ...ctx,
      preview: FLOP_HIDDEN_PAIR.preview,
    });
    h = appendEvents(h, [{ type: 'hand-settled', result: FOLDED_RESULT }], ctx);
    expect(decodeMoveLog(JSON.parse(JSON.stringify(h)))).toEqual(h);
  });

  it('drops anything malformed and never throws', () => {
    expect(decodeMoveLog(undefined)).toEqual([]);
    expect(decodeMoveLog({ n: 1 })).toEqual([]);
    expect(
      decodeMoveLog([{ n: 1, lines: [{ t: 'deal', n: 1, hole: [99], ante: 1, trips: 0 }] }]),
    ).toEqual([]);
    expect(decodeMoveLog([{ n: 1, lines: [{ t: 'nope' }] }])).toEqual([]);
    expect(decodeMoveLog([{ n: 1, lines: [{ t: 'move', street: 'flop', act: 'raise' }] }])).toEqual(
      [],
    );
  });
});

describe('eventsForHandInProgress (a preset hand has no events)', () => {
  const game = createGame({
    bankroll: 50_000,
    bets: { ante: 1000 },
    startAt: { street: 'flop', deal: { player: ['Ah', 'Tc'], flop: ['7d', 'Ks', '2c'] } },
  });

  it('opens the log with the deal and the visible board', () => {
    const h = appendEvents([], eventsForHandInProgress(game, []), ctx);
    expect(text(h)).toEqual([
      'Ante $10, Blind $10, Trips $5. You: A\u2665 10\u2663.',
      'Flop: 7\u2666 K\u2660 2\u2663.',
    ]);
  });

  it('adds nothing when the log already has the hand, or outside a hand', () => {
    const h = appendEvents([], eventsForHandInProgress(game, []), ctx);
    expect(eventsForHandInProgress(game, h)).toEqual([]);
    expect(eventsForHandInProgress(createGame({ bankroll: 50_000 }), [])).toEqual([]);
  });
});
