// Bankroll choices for New session and Top up (I083). Limits match Settings > Default bankroll.
import type { Cents } from '../engine';

export const BANKROLL_PRESETS_DOLLARS = [100, 250, 500, 1_000, 5_000] as const;
/** What the Top up chooser offers first ($500). */
export const DEFAULT_TOP_UP_CENTS: Cents = 50_000;
export const BANKROLL_MIN_DOLLARS = 1;
export const BANKROLL_MAX_DOLLARS = 1_000_000;

/** A whole-dollar amount in range, as cents; null for anything else (blank, decimals, junk). */
export function parseBankrollDollars(text: string): Cents | null {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (n < BANKROLL_MIN_DOLLARS || n > BANKROLL_MAX_DOLLARS) return null;
  return n * 100;
}

/** The rack cannot pay for the next Ante + Blind (+ Trips). Only meaningful between hands. */
export function rackShort(street: string, bankroll: Cents, ante: Cents, trips: Cents): boolean {
  return street === 'settled' && ante > 0 && bankroll < ante * 2 + trips;
}

/** The engine's rack-too-small rejection (engine/validate.ts). */
export const isRackRejection = (text: string | undefined): boolean =>
  !!text && /^Not enough in the rack/.test(text);
