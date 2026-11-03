import { DEFAULT_SIM_SETTINGS } from '../sim/ui/types';
import type { SimSettings } from '../sim/ui/types';

/** Which bets the Confirm box asks about: the scope it turns on (D40). */
export type ConfirmTiers = Exclude<SimSettings['confirmOn'], 'never'>;

/** Persisted settings (architecture.md §2.4 + decisions.md D30). TODO(app) owns this file after WP0. */
export interface Settings extends SimSettings {
  theme: 'system' | 'light' | 'dark';
  reduceMotion: boolean;
  defaultBankrollCents: number; // default 50_000 ($500)
  /** Whether the once-ever storage request has been answered (I076). */
  persistAsked: 'no' | 'granted' | 'denied';
  /** Scope of the Confirm box (D40). confirmOn is the effective policy; 'never' = box unticked. */
  confirmTiers: ConfirmTiers;
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_SIM_SETTINGS,
  theme: 'system',
  reduceMotion: false,
  defaultBankrollCents: 50_000,
  persistAsked: 'no',
  confirmTiers: 'all',
};

/** Confirm bets is on (the box is ticked). */
export const confirmEnabled = (s: Pick<Settings, 'confirmOn'>): boolean => s.confirmOn !== 'never';

/** Tick or untick the box: on turns on the stored scope; off is 'never' (scope kept). */
export const withConfirmEnabled = (s: Settings, on: boolean): Partial<Settings> =>
  on ? { confirmOn: s.confirmTiers } : { confirmOn: 'never' };

/** Pick a scope: stored, and applied at once when the box is ticked. */
export const withConfirmTiers = (s: Settings, t: ConfirmTiers): Partial<Settings> => ({
  confirmTiers: t,
  confirmOn: confirmEnabled(s) ? t : 'never',
});
