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
  return { ...DEFAULT_RULES, ...partial };
}
