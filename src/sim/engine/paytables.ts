import type { BlindPaytableId, Paytable, PaytablePresetId, TripsPaytableId } from './types';

/** Blind: pays on a win with a straight or better; lesser winning hands push. */
export const BLIND_PAYTABLES: Readonly<Record<BlindPaytableId, Paytable>> = {
  'blind-standard': {
    id: 'blind-standard',
    label: 'Standard (500/50/10/3/3:2/1)',
    pays: {
      'royal-flush': [500, 1],
      'straight-flush': [50, 1],
      quads: [10, 1],
      'full-house': [3, 1],
      flush: [3, 2],
      straight: [1, 1],
    },
  },
};

const tripsTable = (id: TripsPaytableId, fh: number, fl: number, st: number): Paytable => ({
  id,
  label: `Trips ${id.slice(6).replaceAll('-', '/')}`,
  pays: {
    'royal-flush': [50, 1],
    'straight-flush': [40, 1],
    quads: [30, 1],
    'full-house': [fh, 1],
    flush: [fl, 1],
    straight: [st, 1],
    trips: [3, 1],
  },
});

/** decisions.md D6/D6b. Default is 'trips-8-6-5'. */
export const TRIPS_PAYTABLES: Readonly<Record<TripsPaytableId, Paytable>> = {
  'trips-8-6-5': tripsTable('trips-8-6-5', 8, 6, 5),
  'trips-9-7-4': tripsTable('trips-9-7-4', 9, 7, 4),
  'trips-8-7-4': tripsTable('trips-8-7-4', 8, 7, 4),
  'trips-7-6-5': tripsTable('trips-7-6-5', 7, 6, 5),
  'trips-8-6-4': tripsTable('trips-8-6-4', 8, 6, 4),
};

export const PAYTABLE_PRESET_IDS: readonly PaytablePresetId[] = [
  'trips-8-6-5',
  'trips-9-7-4',
  'trips-8-7-4',
  'trips-7-6-5',
  'trips-8-6-4',
];
export const DEFAULT_PAYTABLE_PRESET: PaytablePresetId = 'trips-8-6-5';
