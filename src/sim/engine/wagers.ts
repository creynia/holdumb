import { evaluateN } from './evaluator';
import { BLIND_PAYTABLES, TRIPS_PAYTABLES, blindPay, tripsPay } from './paytables';
import type {
  Cents,
  Deal,
  HandResult,
  PlayMultiple,
  TableRules,
  WagerDef,
  WagerId,
  WagerSettlement,
} from './types';

/** Wager ids in table order (simulator.md §1.3). Content tests cover exactly these. */
export const WAGER_IDS: readonly WagerId[] = ['ante', 'blind', 'play', 'trips'];

/** The wager registry (simulator.md §1.3). Side bets are added here later. */
export const WAGERS: Readonly<Record<WagerId, WagerDef>> = {
  ante: {
    id: 'ante',
    label: 'Ante',
    kind: 'main',
    describePayout: () =>
      'Pays 1 to 1 if you beat a dealer who qualifies (pair or better); pushes if the dealer does not qualify',
  },
  blind: {
    id: 'blind',
    label: 'Blind',
    kind: 'main',
    describePayout: (rules: TableRules) => {
      const t = BLIND_PAYTABLES[rules.blindPaytable];
      const pay = (
        c: 'straight' | 'flush' | 'full-house' | 'quads' | 'straight-flush' | 'royal-flush',
      ): string => {
        const [n, d] = t.pays[c]!;
        return d === 1 ? `${n}` : `${n}:${d}`;
      };
      return `Pays only if you win with a straight or better: Straight ${pay('straight')}, Flush ${pay('flush')}, Full house ${pay('full-house')}, Quads ${pay('quads')}, Straight flush ${pay('straight-flush')}, Royal ${pay('royal-flush')}; other wins push`;
    },
  },
  play: {
    id: 'play',
    label: 'Play',
    kind: 'main',
    describePayout: () => 'Pays 1 to 1 if you beat the dealer; the dealer does not need to qualify',
  },
  trips: {
    id: 'trips',
    label: 'Trips',
    kind: 'side',
    describePayout: (rules: TableRules) => {
      const t = TRIPS_PAYTABLES[rules.tripsPaytable];
      const p = (
        c:
          | 'royal-flush'
          | 'straight-flush'
          | 'quads'
          | 'full-house'
          | 'flush'
          | 'straight'
          | 'trips',
      ): number => t.pays[c]![0];
      return `Pays on your own hand, trips or better, even if you fold: Royal ${p('royal-flush')}, Straight flush ${p('straight-flush')}, Quads ${p('quads')}, Full house ${p('full-house')}, Flush ${p('flush')}, Straight ${p('straight')}, Trips ${p('trips')}`;
    },
  },
};

export interface SettleBets {
  ante: Cents;
  blind: Cents;
  trips: Cents;
}

type Outcome = 'win' | 'lose' | 'tie';

function outcomeOf(playerValue: number, dealerValue: number): Outcome {
  return playerValue > dealerValue ? 'win' : playerValue < dealerValue ? 'lose' : 'tie';
}

/**
 * Pure resolution of a hand (simulator.md §1.5). `play` is null when the player folded (or never
 * played). The wagers array lists ante, blind, play (if any), trips (if any), in that order.
 */
export function settleHand(
  deal: Deal,
  bets: SettleBets,
  play: { multiple: PlayMultiple } | null,
  folded: boolean,
  rules: TableRules,
): HandResult {
  const player = evaluateN([...deal.player, ...deal.board]);
  const dealer = evaluateN([...deal.dealer, ...deal.board]);
  const dealerQualifies = dealer.category !== 'high-card';
  const outcome = outcomeOf(player.value, dealer.value);
  const blindTable = BLIND_PAYTABLES[rules.blindPaytable];
  const tripsTable = TRIPS_PAYTABLES[rules.tripsPaytable];

  /** Ante, blind and (if given) play for a showdown with the given outcome. */
  const showdown = (o: Outcome, playAmount: Cents): WagerSettlement[] => {
    const out: WagerSettlement[] = [];
    // Ante
    if (o === 'tie')
      out.push({ wager: 'ante', amount: bets.ante, result: 'push', profit: 0, reason: 'tie' });
    else if (!dealerQualifies)
      out.push({
        wager: 'ante',
        amount: bets.ante,
        result: 'push',
        profit: 0,
        reason: 'dealer-not-qualified',
      });
    else if (o === 'win')
      out.push({
        wager: 'ante',
        amount: bets.ante,
        result: 'win',
        profit: bets.ante,
        reason: 'beats-dealer',
      });
    else
      out.push({
        wager: 'ante',
        amount: bets.ante,
        result: 'lose',
        profit: -bets.ante,
        reason: 'dealer-wins',
      });
    // Blind
    if (o === 'tie')
      out.push({ wager: 'blind', amount: bets.blind, result: 'push', profit: 0, reason: 'tie' });
    else if (o === 'lose')
      out.push({
        wager: 'blind',
        amount: bets.blind,
        result: 'lose',
        profit: -bets.blind,
        reason: 'dealer-wins',
      });
    else {
      const bonus = blindPay(blindTable, player.category, bets.blind);
      if (bonus > 0)
        out.push({
          wager: 'blind',
          amount: bets.blind,
          result: 'win',
          profit: bonus,
          reason: 'blind-bonus',
        });
      else
        out.push({
          wager: 'blind',
          amount: bets.blind,
          result: 'push',
          profit: 0,
          reason: 'blind-push-under-straight',
        });
    }
    // Play
    if (playAmount > 0) {
      if (o === 'win')
        out.push({
          wager: 'play',
          amount: playAmount,
          result: 'win',
          profit: playAmount,
          reason: 'beats-dealer',
        });
      else if (o === 'lose')
        out.push({
          wager: 'play',
          amount: playAmount,
          result: 'lose',
          profit: -playAmount,
          reason: 'dealer-wins',
        });
      else
        out.push({ wager: 'play', amount: playAmount, result: 'push', profit: 0, reason: 'tie' });
    }
    return out;
  };

  const wagers: WagerSettlement[] = [];
  let ifPlayed: HandResult['ifPlayed'];
  if (folded || play === null) {
    wagers.push(
      { wager: 'ante', amount: bets.ante, result: 'lose', profit: -bets.ante, reason: 'folded' },
      { wager: 'blind', amount: bets.blind, result: 'lose', profit: -bets.blind, reason: 'folded' },
    );
    {
      const hypothetical = showdown(outcome, bets.ante);
      ifPlayed = { outcome, net: hypothetical.reduce((s, w) => s + w.profit, 0) };
    }
  } else {
    wagers.push(...showdown(outcome, play.multiple * bets.ante));
  }
  if (bets.trips > 0) {
    const profit = tripsPay(tripsTable, player.category, bets.trips);
    wagers.push(
      profit > 0
        ? { wager: 'trips', amount: bets.trips, result: 'win', profit, reason: 'trips-pays' }
        : { wager: 'trips', amount: bets.trips, result: 'lose', profit, reason: 'trips-misses' },
    );
  }
  const result: HandResult = {
    player,
    dealer,
    dealerQualifies,
    outcome: folded || play === null ? 'fold' : outcome,
    wagers,
    net: wagers.reduce((s, w) => s + w.profit, 0),
  };
  if (ifPlayed) result.ifPlayed = ifPlayed;
  return result;
}
