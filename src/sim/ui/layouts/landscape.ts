import type { FeltLayout } from './types';

/** simulator.md §3.3: felt viewBox 560x390 (the 284 px rail is HTML beside it). */
export const landscapeLayout: FeltLayout = {
  id: 'landscape',
  viewBox: { w: 560, h: 390 },
  cardSize: { w: 60, h: 84 },
  boardCardSize: { w: 62, h: 86 },
  dealer: [
    { x: 200, y: 10 },
    { x: 268, y: 10 },
  ],
  board: [
    { x: 80, y: 112 },
    { x: 162, y: 112 },
    { x: 244, y: 112 },
    { x: 326, y: 112 },
    { x: 408, y: 112 },
  ],
  player: [
    { x: 200, y: 296 },
    { x: 268, y: 296 },
  ],
  circles: {
    trips: { c: { x: 110, y: 250 }, r: 30, label: 'TRIPS' },
    ante: { c: { x: 220, y: 250 }, r: 30, label: 'ANTE' },
    blind: { c: { x: 330, y: 250 }, r: 30, label: 'BLIND' },
    play: { c: { x: 440, y: 250 }, r: 34, label: 'PLAY' },
  },
  handLabels: {
    dealer: { x: 340, y: 56, anchor: 'start' },
    player: { x: 340, y: 342, anchor: 'start' },
  },
  deckPos: { x: 500, y: 20 },
  rackPos: { x: 280, y: 386 },
  minTapUnits: 44,
};
