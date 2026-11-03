// I062 Six Card Bonus (decisions.md D5a): an optional side bet on the best five of six cards, your
// two hole cards plus four bonus cards dealt to a separate area (the NJ layout, curriculum.md
// sources). The bonus cards come from the 43 cards the main deal left unseen, through their own
// seeded stream, so the game's RNG stream (and every seeded replay) is unchanged. The bet does not
// depend on play, so it settles at the deal. Pure; the engine's wager registry is untouched.
import { FULL_DECK } from './cards';
import { evaluateN } from './evaluator';
import { seedRng, shuffle } from './rng';
import type { Card, Cents, Deal, EvaluatedHand, HandCategory } from './types';

export type SixCardPaytableId = 'six-card-1000-200-100' | 'six-card-1000-200-50';

export interface SixCardPaytable {
  id: SixCardPaytableId;
  label: string;
  /** "To 1"; categories not listed lose. The exact edge is math/edges.ts `sixCardEdge`. */
  pays: Partial<Record<HandCategory, number>>;
}

export const SIX_CARD_PAYTABLES: Readonly<Record<SixCardPaytableId, SixCardPaytable>> = {
  'six-card-1000-200-100': {
    id: 'six-card-1000-200-100',
    label: '1000/200/100/20/15/10/7',
    pays: {
      'royal-flush': 1000,
      'straight-flush': 200,
      quads: 100,
      'full-house': 20,
      flush: 15,
      straight: 10,
      trips: 7,
    },
  },
  'six-card-1000-200-50': {
    id: 'six-card-1000-200-50',
    label: '1000/200/50/20/15/10/5',
    pays: {
      'royal-flush': 1000,
      'straight-flush': 200,
      quads: 50,
      'full-house': 20,
      flush: 15,
      straight: 10,
      trips: 5,
    },
  },
};
export const SIX_CARD_PAYTABLE_IDS: readonly SixCardPaytableId[] = [
  'six-card-1000-200-100',
  'six-card-1000-200-50',
];
export const DEFAULT_SIX_CARD_PAYTABLE: SixCardPaytableId = 'six-card-1000-200-100';

/** Whole dollars, $1 to $25 (the Trips limits' unit; tables commonly spread $1–$25). */
export const SIX_CARD_MIN: Cents = 100;
export const SIX_CARD_MAX: Cents = 2_500;

export interface SixCardResult {
  bet: Cents;
  bonus: readonly [Card, Card, Card, Card];
  hand: EvaluatedHand;
  /** Profit: bet × pays, or −bet. */
  profit: Cents;
  paytable: SixCardPaytableId;
}

/** A per-hand seed, independent of the game RNG (FNV-1a style mix of the game seed and hand n). */
function bonusSeed(gameSeed: number, handN: number): number {
  let h = 0x811c9dc5 ^ 0x5c;
  for (const v of [gameSeed >>> 0, handN >>> 0]) {
    h = Math.imul(h ^ (v & 0xffff), 0x01000193);
    h = Math.imul(h ^ (v >>> 16), 0x01000193);
  }
  return h >>> 0;
}

/** The four bonus cards for hand `handN`: drawn from the 43 cards the deal did not use. */
export function bonusCards(deal: Deal, gameSeed: number, handN: number): [Card, Card, Card, Card] {
  const used = new Set<Card>([...deal.player, ...deal.dealer, ...deal.board]);
  const rest = FULL_DECK.filter((c) => !used.has(c));
  const [s] = shuffle(seedRng(bonusSeed(gameSeed, handN)), rest);
  return [s[0]!, s[1]!, s[2]!, s[3]!];
}

/** Profit of a Six Card bet of `bet` with this category. */
export function sixCardPay(table: SixCardPaytable, category: HandCategory, bet: Cents): Cents {
  const to1 = table.pays[category];
  return to1 === undefined ? -bet : bet * to1;
}

export function settleSixCard(
  deal: Deal,
  gameSeed: number,
  handN: number,
  bet: Cents,
  paytable: SixCardPaytableId = DEFAULT_SIX_CARD_PAYTABLE,
): SixCardResult {
  const bonus = bonusCards(deal, gameSeed, handN);
  const hand = evaluateN([...deal.player, ...bonus]);
  return {
    bet,
    bonus,
    hand,
    profit: sixCardPay(SIX_CARD_PAYTABLES[paytable], hand.category, bet),
    paytable,
  };
}
