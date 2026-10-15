import type { CircleId } from '../../scene/types';

export type { CircleId };

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type TextAnchor = 'start' | 'middle' | 'end';
export interface LabelSpot extends Pt {
  anchor: TextAnchor;
}

/** simulator.md §3.1. Positions are card top-left corners; circles are centre + radius. */
export interface FeltLayout {
  id: 'portrait' | 'landscape';
  viewBox: { w: number; h: number };
  cardSize: { w: number; h: number };
  dealer: [Pt, Pt];
  board: [Pt, Pt, Pt, Pt, Pt];
  player: [Pt, Pt];
  /** Board and hole cards can be a different size from the dealer's (portrait). */
  boardCardSize: { w: number; h: number };
  circles: Record<CircleId, { c: Pt; r: number; label: string }>;
  handLabels: { dealer: LabelSpot; player: LabelSpot };
  /** Cards fly from here. */
  deckPos: Pt;
  /** Chips fly to and from here. */
  rackPos: Pt;
  /** 44 CSS px, in viewBox units, at the reference viewport (1 unit = 1 px). */
  minTapUnits: number;
}
