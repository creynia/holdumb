import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../engine';
import { buildTimeline, effectiveSpeed } from './animation';

const dealEvents: GameEvent[] = [{ type: 'player-dealt', cards: [0, 5] }, { type: 'dealer-dealt' }];
const flopEvents: GameEvent[] = [{ type: 'board-dealt', street: 'flop', cards: [9, 14, 20] }];
const riverEnd: GameEvent[] = [
  { type: 'board-dealt', street: 'turn-river', cards: [30, 41] },
  {
    type: 'dealer-revealed',
    cards: [1, 6],
    hand: { value: 0, category: 'pair', best5: [] },
    qualifies: true,
  },
  {
    type: 'wager-settled',
    settlement: {
      wager: 'ante',
      amount: 1000,
      result: 'win',
      profit: 1000,
      reason: 'beats-dealer',
    },
  },
];

describe('buildTimeline', () => {
  it('instant gives an empty timeline', () => {
    const t = buildTimeline([...dealEvents, ...flopEvents, ...riverEnd], 'instant');
    expect(t.totalMs).toBe(0);
    expect(t.cardMs).toBe(0);
    expect(t.delays.flop).toEqual([0, 0, 0]);
    expect(t.delays.reveal).toEqual([0, 0]);
  });
  it('deals cards one after another', () => {
    const t = buildTimeline(dealEvents, 'normal');
    expect(t.delays.player).toEqual([0, 180]);
    expect(t.delays.dealer).toEqual([360, 540]);
  });
  it('flips the flop in three steps and turn/river in two', () => {
    expect(buildTimeline(flopEvents, 'normal').delays.flop).toEqual([0, 150, 300]);
    const t = buildTimeline(riverEnd, 'normal');
    expect([t.delays.turn, t.delays.river]).toEqual([0, 200]);
    expect(t.delays.reveal[0]).toBe(400); // after the board
  });
  it('keeps every step about a second or less', () => {
    for (const evs of [dealEvents, flopEvents, riverEnd])
      expect(buildTimeline(evs, 'normal').totalMs).toBeLessThanOrEqual(1200);
  });
  it('fast is quicker than normal', () => {
    expect(buildTimeline(riverEnd, 'fast').totalMs).toBeLessThan(
      buildTimeline(riverEnd, 'normal').totalMs,
    );
  });
});

describe('effectiveSpeed', () => {
  it('reduced motion forces instant', () => {
    expect(effectiveSpeed('normal', true)).toBe('instant');
    expect(effectiveSpeed('fast', false)).toBe('fast');
    expect(effectiveSpeed(undefined, false)).toBe('normal');
  });
});
