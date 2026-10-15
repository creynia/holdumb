import { describe, expect, it } from 'vitest';
import {
  BLIND_PAYTABLES,
  PAYTABLE_PRESET_IDS,
  PAYTABLE_PRESETS,
  TRIPS_PAYTABLES,
  blindPay,
  tripsPay,
} from './paytables';
import { DEFAULT_RULES, resolveRules } from './rules';
import { formatMoney, formatPct } from './money';
import { HAND_CATEGORIES } from './types';

const SEVEN: Record<string, bigint> = {
  'royal-flush': 4324n,
  'straight-flush': 37260n,
  quads: 224848n,
  'full-house': 3473184n,
  flush: 4047644n,
  straight: 6180020n,
  trips: 6461620n,
};
const TOTAL = 133784560n;
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

describe('Trips paytables (D6b): exact house edge from the 7-card counts', () => {
  const EXPECT: Record<string, [bigint, bigint]> = {
    'trips-9-7-4': [301629n, 33446140n],
    'trips-8-6-5': [48987n, 2572780n],
    'trips-8-7-4': [233985n, 6689228n],
    'trips-7-6-5': [115779n, 2572780n],
    'trips-8-6-4': [545459n, 8361535n],
  };
  for (const id of PAYTABLE_PRESET_IDS) {
    it(id, () => {
      const t = TRIPS_PAYTABLES[id];
      let winnings = 0n;
      let paying = 0n;
      for (const c of HAND_CATEGORIES) {
        const odds = t.pays[c];
        if (odds) {
          expect(odds[1]).toBe(1);
          winnings += SEVEN[c]! * BigInt(odds[0]);
          paying += SEVEN[c]!;
        }
      }
      const edgeNum = TOTAL - paying - winnings; // losses minus winnings = -EV
      const g = gcd(edgeNum, TOTAL);
      expect([edgeNum / g, TOTAL / g]).toEqual(EXPECT[id]);
    });
  }
  it('default and listing', () => {
    expect(PAYTABLE_PRESET_IDS[0]).toBe('trips-8-6-5');
    expect(PAYTABLE_PRESETS).toHaveLength(5);
    expect(DEFAULT_RULES.tripsPaytable).toBe('trips-8-6-5');
    expect(P_TRIPS_PAID()).toBe(20_428_900n);
  });
  it('blind and trips pay helpers', () => {
    const b = BLIND_PAYTABLES['blind-standard'];
    expect(blindPay(b, 'flush', 500)).toBe(750);
    expect(blindPay(b, 'royal-flush', 1000)).toBe(500_000);
    expect(blindPay(b, 'straight', 1000)).toBe(1000);
    expect(blindPay(b, 'trips', 1000)).toBe(0);
    const t = TRIPS_PAYTABLES['trips-8-6-5'];
    expect(tripsPay(t, 'trips', 500)).toBe(1500);
    expect(tripsPay(t, 'two-pair', 500)).toBe(-500);
    expect(resolveRules({ anteMin: 100 }).anteMin).toBe(100);
  });
});

function P_TRIPS_PAID(): bigint {
  return Object.values(SEVEN).reduce((a, b) => a + b, 0n);
}

describe('money', () => {
  it('formats cents and percentages', () => {
    expect(formatMoney(-14)).toBe('-$0.14');
    expect(formatMoney(3900, { sign: true })).toBe('+$39');
    expect(formatMoney(125000)).toBe('$1,250');
    expect(formatMoney(750)).toBe('$7.50');
    expect(formatPct({ num: 48987n, den: 2572780n }, 3)).toBe('1.904%');
    expect(formatPct({ num: -50643648973n, den: 2317817502000n })).toBe('-2.18%');
  });
});
