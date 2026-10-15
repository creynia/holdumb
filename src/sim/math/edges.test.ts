import { describe, expect, it } from 'vitest';
import { PAYTABLE_PRESET_IDS } from '../engine/paytables';
import {
  GAME_EDGE,
  GAME_ELEMENT_OF_RISK,
  GAME_EV,
  GAME_EXPECTED_WAGER,
  SEVEN_CARD_COUNTS,
  SEVEN_CARD_TOTAL,
  perHour,
  tripsEdge,
  tripsPerHour,
} from './edges';
import { div, frac, round, toFixed, toRatio } from './fraction';

describe('Trips edges (decisions.md D6b)', () => {
  const want: Record<string, [string, string, string]> = {
    'trips-9-7-4': ['301629/33446140', '0.902', 'good'],
    'trips-8-6-5': ['48987/2572780', '1.904', 'good'],
    'trips-8-7-4': ['233985/6689228', '3.498', 'fair'],
    'trips-7-6-5': ['115779/2572780', '4.500', 'fair'],
    'trips-8-6-4': ['545459/8361535', '6.523', 'poor'],
  };
  it.each(Object.entries(want))('%s', (id, [ratio, pct, tier]) => {
    const e = tripsEdge(id as never);
    expect(toRatio(e.edge)).toBe(ratio);
    expect(toFixed(frac(e.edge.num * 100n, e.edge.den), 3)).toBe(pct);
    expect(e.tier).toBe(tier);
  });
  it('covers every preset', () => {
    expect(PAYTABLE_PRESET_IDS.sort()).toEqual(Object.keys(want).sort());
  });
  it('category counts sum to the 7-card total with the rest below trips', () => {
    const total = Object.values(SEVEN_CARD_COUNTS).reduce((a, b) => a + b, 0n);
    expect(total).toBe(SEVEN_CARD_TOTAL);
  });
});

describe('game constants (decisions.md §4)', () => {
  it('house edge, element of risk and per hour', () => {
    expect(toFixed(frac(GAME_EDGE.num * 100n, GAME_EDGE.den), 5)).toBe('2.18497');
    expect(toRatio(div(GAME_EDGE, GAME_EXPECTED_WAGER))).toBe(toRatio(GAME_ELEMENT_OF_RISK));
    expect(toFixed(frac(GAME_ELEMENT_OF_RISK.num * 100n, GAME_ELEMENT_OF_RISK.den), 5)).toBe(
      '0.52622',
    );
    expect(GAME_EV.num).toBeLessThan(0n);
  });
  it('$6.55/hour at $10 and $2.86/hour for $5 Trips 8-6-5', () => {
    expect(round(perHour(GAME_EDGE, 1000))).toBe(655);
    expect(round(tripsPerHour('trips-8-6-5', 500))).toBe(286);
  });
});
