import type { WagerId } from '../sim/engine/types';

/**
 * The four wagers, in table order. A copy of the engine's WAGER_IDS so naming a bet page does not
 * load the engine's wager module (and its evaluator) with Home (I095); a test keeps them equal.
 */
export const WAGER_IDS: readonly WagerId[] = ['ante', 'blind', 'play', 'trips'];

// Kept apart from the Bets screen so App can name a bet page without loading the screen (I039).
export const NAME: Record<WagerId, string> = {
  ante: 'Ante',
  blind: 'Blind',
  play: 'Play',
  trips: 'Trips',
};

/** The wager's page name (its h1), or undefined for an unknown wager id. */
export function wagerName(
  id: string,
  bets: Partial<Record<WagerId, { name?: string }>>,
): string | undefined {
  if (!(WAGER_IDS as readonly string[]).includes(id)) return undefined;
  const w = id as WagerId;
  return bets[w]?.name ?? NAME[w];
}
