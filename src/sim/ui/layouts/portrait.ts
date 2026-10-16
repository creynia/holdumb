import type { FeltLayout } from './types';

/** simulator.md §3.2: viewBox 390x600, 1 unit = 1 CSS px at 390 wide. */
export const portraitLayout: FeltLayout = {
  id: 'portrait',
  viewBox: { w: 390, h: 600 },
  cardSize: { w: 70, h: 98 },
  boardCardSize: { w: 64, h: 90 },
  dealer: [
    { x: 122, y: 16 },
    { x: 198, y: 16 },
  ],
  board: [
    { x: 16, y: 150 },
    { x: 89, y: 150 },
    { x: 162, y: 150 },
    { x: 235, y: 150 },
    { x: 308, y: 150 },
  ],
  player: [
    { x: 122, y: 488 },
    { x: 198, y: 488 },
  ],
  circles: {
    trips: { c: { x: 195, y: 290 }, r: 30, label: 'TRIPS' },
    ante: { c: { x: 125, y: 362 }, r: 34, label: 'ANTE' },
    blind: { c: { x: 265, y: 362 }, r: 34, label: 'BLIND' },
    play: { c: { x: 195, y: 440 }, r: 38, label: 'PLAY' },
  },
  handLabels: {
    dealer: { x: 195, y: 130, anchor: 'middle' },
    player: { x: 112, y: 540, anchor: 'end' },
  },
  nextHandCaption: { x: 195, y: 346 },
  deckPos: { x: 340, y: 20 },
  rackPos: { x: 195, y: 596 },
  minTapUnits: 44,
};
