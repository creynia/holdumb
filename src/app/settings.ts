import { DEFAULT_SIM_SETTINGS } from '../sim/ui/types';
import type { SimSettings } from '../sim/ui/types';

/** Persisted settings (architecture.md §2.4 + decisions.md D30). TODO(app) owns this file after WP0. */
export interface Settings extends SimSettings {
  theme: 'system' | 'light' | 'dark';
  reduceMotion: boolean;
  defaultBankrollCents: number; // default 50_000 ($500)
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_SIM_SETTINGS,
  theme: 'system',
  reduceMotion: false,
  defaultBankrollCents: 50_000,
};
