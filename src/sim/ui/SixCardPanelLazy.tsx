// I062: the Six Card Bonus panel is loaded on demand, so its UI, tables and rules stay out of the
// first-paint bundle (tests/build/bundle-size.test.ts). The shared helpers it needs are handed in
// as `kit`, so the lazy chunk imports no app module the first paint also uses. Until it arrives a
// sized placeholder holds the slot; `data-lazy-pending` lets tests wait for the real panel.
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { SimDriver } from '../scene';
import { TierBadge } from './TierBadge';
import { capitalize, fmtPct, handName, money, typographic } from './text';

export const SIX_CARD_KIT = {
  h,
  useState,
  TierBadge,
  capitalize,
  fmtPct,
  handName,
  money,
  typographic,
};
export type SixCardKit = typeof SIX_CARD_KIT;

type Panel = typeof import('./SixCardPanel').SixCardPanel;
let loaded: Panel | null = null;

export function SixCardPanelLazy({ d }: { d: SimDriver }) {
  const [P, setP] = useState<Panel | null>(() => loaded);
  useEffect(() => {
    if (P) return;
    let live = true;
    void import('./SixCardPanel').then((m) => {
      loaded = m.SixCardPanel;
      if (live) setP(() => m.SixCardPanel);
    });
    return () => {
      live = false;
    };
  }, [P]);
  return P ? (
    <P d={d} kit={SIX_CARD_KIT} />
  ) : (
    <div style={{ minHeight: '44px' }} data-lazy-pending="six-card" />
  );
}
