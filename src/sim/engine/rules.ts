import type { TableRules } from './types';

export const DEFAULT_RULES: TableRules = {
  blindPaytable: 'blind-standard',
  tripsPaytable: 'trips-8-6-5',
  anteMin: 500,
  anteMax: 50_000,
  tripsMin: 100,
  tripsMax: 10_000,
  betUnit: 100,
  preflopMultiples: [4, 3],
  requireAnteForTrips: true,
};

export function resolveRules(partial?: Partial<TableRules>): TableRules {
  const rules = { ...DEFAULT_RULES, ...partial };
  // The Blind flush pays 3:2 on an ante that is a multiple of betUnit; an even unit keeps every payout whole cents.
  if (!Number.isInteger(rules.betUnit) || rules.betUnit <= 0 || rules.betUnit % 2 !== 0)
    throw new Error(
      `resolveRules: betUnit must be a positive even number of cents, got ${rules.betUnit}`,
    );
  return rules;
}
