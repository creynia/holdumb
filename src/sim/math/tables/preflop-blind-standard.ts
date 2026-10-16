// PLACEHOLDER until `npm run gen:tables` runs.
import type { BlindPaytableId } from '../../engine/types';
export interface PreflopTable {
  blindPaytable: BlindPaytableId;
  denRaise: bigint;
  denCheck: bigint;
  rows: string;
}
export const PREFLOP_BLIND_STANDARD: PreflopTable = {
  blindPaytable: 'blind-standard',
  denRaise: 2_097_572_400n,
  denCheck: 20_975_724_000n,
  rows: 'AA:0,0,0,0,0,0,0,0,0,0,0,0,0',
};
