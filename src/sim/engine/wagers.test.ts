import { describe, expect, it } from 'vitest';
import { parseCard, parseCards } from './cards';
import { resolveRules } from './rules';
import { nextU32, seedRng } from './rng';
import { WAGERS, WAGER_IDS, settleHand } from './wagers';
import { TRIPS_PAYTABLES } from './paytables';
import type { Deal, TableRules, TripsPaytableId, WagerId } from './types';
import { oracleSettle, type OraclePath } from './__tests__/settleOracle';

function mk(player: string, dealer: string, board: string): Deal {
  const p = parseCards(player);
  const d = parseCards(dealer);
  const b = parseCards(board);
  return {
    player: [p[0]!, p[1]!],
    dealer: [d[0]!, d[1]!],
    board: [b[0]!, b[1]!, b[2]!, b[3]!, b[4]!],
    forced: true,
  };
}
const rules = resolveRules();
const bet = { ante: 1000, blind: 1000, trips: 500 };
const net = (r: ReturnType<typeof settleHand>): Record<WagerId, number> => {
  const o: Record<WagerId, number> = { ante: 0, blind: 0, play: 0, trips: 0 };
  for (const w of r.wagers) o[w.wager] += w.profit;
  return o;
};

describe('golden settlements ($10 ante, $5 trips)', () => {
  it('raise 4x, win with a flush, dealer qualifies: +10 +15 +40 +30 = +95', () => {
    const r = settleHand(
      mk('Ah 9h', '2s 2d', 'Kh 7h 3h Qc 4d'),
      bet,
      { multiple: 4 },
      false,
      rules,
    );
    expect(net(r)).toEqual({ ante: 1000, blind: 1500, play: 4000, trips: 3000 });
    expect(r.net).toBe(9500);
    expect(r.outcome).toBe('win');
  });
  it('4x, win with two pair, dealer ace high (no qualify): 0 0 +40 -5', () => {
    const r = settleHand(
      mk('Kh Qd', 'As 8c', 'Kc Qs 2c 4s 7h'),
      bet,
      { multiple: 4 },
      false,
      rules,
    );
    expect(net(r)).toEqual({ ante: 0, blind: 0, play: 4000, trips: -500 });
    expect(r.net).toBe(3500);
    expect(r.wagers[0]!.reason).toBe('dealer-not-qualified');
    expect(r.wagers[1]!.reason).toBe('blind-push-under-straight');
  });
  it('2x, lose to the dealer pair: -10 -10 -20 -5', () => {
    const r = settleHand(
      mk('Ah Kd', '9s 9d', '2c 4h 6s Jd Qc'),
      bet,
      { multiple: 2 },
      false,
      rules,
    );
    expect(net(r)).toEqual({ ante: -1000, blind: -1000, play: -2000, trips: -500 });
    expect(r.net).toBe(-4500);
  });
  it('1x, lose with king high to ace high (no qualify): 0 -10 -10 -5', () => {
    const r = settleHand(
      mk('Kh 3d', 'As 4d', '2c 9h 6s Jd 8c'),
      bet,
      { multiple: 1 },
      false,
      rules,
    );
    expect(net(r)).toEqual({ ante: 0, blind: -1000, play: -1000, trips: -500 });
    expect(r.net).toBe(-2500);
  });
  it('fold with trips on the board: -10 -10 +15 = -5, and Trips still pays', () => {
    const r = settleHand(mk('Ah Kd', '9s 9d', '5c 5h 5s Jd 2c'), bet, null, true, rules);
    expect(net(r)).toEqual({ ante: -1000, blind: -1000, play: 0, trips: 1500 });
    expect(r.net).toBe(-500);
    expect(r.outcome).toBe('fold');
    expect(r.wagers.map((w) => w.wager)).toEqual(['ante', 'blind', 'trips']);
    expect(r.wagers[0]!.reason).toBe('folded');
  });
  it('4x, win with a royal flush: +10 +5000 +40 +250 = +5300', () => {
    const r = settleHand(
      mk('Ah Kh', '2s 2d', 'Qh Jh Th 3c 4d'),
      bet,
      { multiple: 4 },
      false,
      rules,
    );
    expect(net(r)).toEqual({ ante: 1000, blind: 500000, play: 4000, trips: 25000 });
    expect(r.net).toBe(530000);
  });
  it('tie (board plays): everything pushes except the Trips loss', () => {
    const r = settleHand(
      mk('2h 3d', '4s 5d', 'Ah Kd Qc Js 9c'),
      bet,
      { multiple: 1 },
      false,
      rules,
    );
    expect(net(r)).toEqual({ ante: 0, blind: 0, play: 0, trips: -500 });
    expect(r.outcome).toBe('tie');
  });
  it('blind flush pays 3:2 on $5 ante exactly ($7.50)', () => {
    const r = settleHand(
      mk('Ah 9h', '2s 2d', 'Kh 7h 3h Qc 4d'),
      { ante: 500, blind: 500, trips: 0 },
      { multiple: 1 },
      false,
      rules,
    );
    expect(net(r).blind).toBe(750);
    expect(r.wagers.map((w) => w.wager)).toEqual(['ante', 'blind', 'play']);
  });
});

describe('D7 fold reveal (ifPlayed)', () => {
  it('reports what 1x would have returned, excluding Trips', () => {
    const win = settleHand(mk('Ah Ad', '9s 9d', '2c 4h 6s Jd Qc'), bet, null, true, rules);
    expect(win.ifPlayed).toEqual({ outcome: 'win', net: 1000 + 0 + 1000 }); // ante + (pair: blind push) + play 1x
    expect(win.dealerQualifies).toBe(true);
    const lose = settleHand(mk('2h 3d', '9s 9d', 'Ac 4h 6s Jd Qc'), bet, null, true, rules);
    expect(lose.ifPlayed).toEqual({ outcome: 'lose', net: -3000 });
    const tie = settleHand(mk('2h 3d', '4s 5d', 'Ah Kd Qc Js 9c'), bet, null, true, rules);
    expect(tie.ifPlayed).toEqual({ outcome: 'tie', net: 0 });
  });
  it('is absent when the hand was played', () => {
    expect(
      settleHand(mk('2h 3d', '4s 5d', 'Ah Kd Qc Js 9c'), bet, { multiple: 1 }, false, rules)
        .ifPlayed,
    ).toBeUndefined();
  });
});

describe('registry', () => {
  it('describes every wager', () => {
    for (const id of WAGER_IDS) {
      expect(WAGERS[id].id).toBe(id);
      expect(WAGERS[id].describePayout(rules).length).toBeGreaterThan(10);
    }
    expect(WAGERS.trips.kind).toBe('side');
    expect(WAGERS.blind.describePayout(rules)).toContain('Flush 3:2');
  });
});

describe('settleHand vs independent oracle', () => {
  it(
    'matches wager by wager: 5,000 hands x 5 paths x 2 Trips paytables',
    { timeout: 120_000 },
    () => {
      let rng = seedRng(777);
      const paths: OraclePath[] = ['4x', '3x', '2x', '1x', 'fold'];
      const ids: TripsPaytableId[] = ['trips-8-6-5', 'trips-9-7-4'];
      // Mix in strong boards so quads / straights / flushes / royals show up often enough.
      for (let i = 0; i < 5_000; i++) {
        const deck = Array.from({ length: 52 }, (_, j) => j);
        const pick: number[] = [];
        for (let j = 0; j < 9; j++) {
          const [u, n] = nextU32(rng);
          rng = n;
          const k = j + (u % (52 - j));
          [deck[j], deck[k]] = [deck[k]!, deck[j]!];
          pick.push(deck[j]!);
        }
        const deal: Deal = {
          player: [pick[0]!, pick[1]!],
          dealer: [pick[2]!, pick[3]!],
          board: [pick[4]!, pick[5]!, pick[6]!, pick[7]!, pick[8]!],
          forced: false,
        };
        for (const id of ids) {
          const r: TableRules = resolveRules({ tripsPaytable: id });
          for (const path of paths) {
            const ante = 500 + 100 * (i % 7);
            const trips = i % 3 === 0 ? 0 : 100 * ((i % 5) + 1);
            const got = settleHand(
              deal,
              { ante, blind: ante, trips },
              path === 'fold' ? null : { multiple: Number(path[0]) as 1 },
              path === 'fold',
              r,
            );
            const want = oracleSettle(
              { player: [...deal.player], dealer: [...deal.dealer], board: [...deal.board] },
              path,
              ante,
              trips,
              id,
            );
            expect(net(got), `${i} ${id} ${path}`).toEqual(want);
          }
        }
      }
    },
  );
  it('all five Trips presets share 50/40/30 and 3 for trips', () => {
    for (const t of Object.values(TRIPS_PAYTABLES)) {
      expect(t.pays['royal-flush']).toEqual([50, 1]);
      expect(t.pays['straight-flush']).toEqual([40, 1]);
      expect(t.pays.quads).toEqual([30, 1]);
      expect(t.pays.trips).toEqual([3, 1]);
    }
    expect(parseCard('As')).toBe(48);
  });
});

describe('settleHand vs oracle on rare categories', () => {
  const deals: [string, string, string][] = [
    ['9h 9d', '2s 3d', '9c 9s Ad Kd 4c'], // quads
    ['6h 7h', '2s 3d', '8h 9h Th Kd 4c'], // straight flush
    ['Ah 2d', '2s 3d', '3h 4c 5s Kd 9c'], // wheel vs pair
    ['Kh Kd', 'Qs Qd', 'Kc Qc 2s 7d 9c'], // full house vs full house
    ['Ah Kh', '2s 3d', 'Qh Jh Th 3c 4d'], // royal
  ];
  it('matches the oracle', () => {
    for (const [p, d, b] of deals) {
      const deal = mk(p, d, b);
      for (const path of ['4x', '2x', '1x', 'fold'] as OraclePath[]) {
        for (const id of ['trips-8-6-5', 'trips-8-6-4'] as TripsPaytableId[]) {
          const got = settleHand(
            deal,
            { ante: 1000, blind: 1000, trips: 500 },
            path === 'fold' ? null : { multiple: Number(path[0]) as 1 },
            path === 'fold',
            resolveRules({ tripsPaytable: id }),
          );
          const want = oracleSettle(
            { player: [...deal.player], dealer: [...deal.dealer], board: [...deal.board] },
            path,
            1000,
            500,
            id,
          );
          expect(net(got), `${p}/${d}/${b} ${id} ${path}`).toEqual(want);
        }
      }
    }
  });
});
