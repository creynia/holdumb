import type { WagerId } from './types';

/** Wager ids in table order (simulator.md §1.3). Content tests cover exactly these. */
export const WAGER_IDS: readonly WagerId[] = ['ante', 'blind', 'play', 'trips'];
