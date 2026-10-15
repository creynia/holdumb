import { describe, expect, it } from 'vitest';
import { landscapeLayout, portraitLayout } from './index';
import type { FeltLayout, Rect } from './types';

function rects(l: FeltLayout): { name: string; r: Rect }[] {
  const out: { name: string; r: Rect }[] = [];
  l.dealer.forEach((p, i) => out.push({ name: `dealer${i}`, r: { ...p, ...l.cardSize } }));
  l.board.forEach((p, i) => out.push({ name: `board${i}`, r: { ...p, ...l.boardCardSize } }));
  l.player.forEach((p, i) => out.push({ name: `player${i}`, r: { ...p, ...l.cardSize } }));
  for (const [id, c] of Object.entries(l.circles))
    out.push({
      name: id,
      r: { x: c.c.x - c.r, y: c.c.y - c.r, w: c.r * 2, h: c.r * 2 },
    });
  return out;
}
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe.each([portraitLayout, landscapeLayout])('$id layout', (layout) => {
  it('keeps every element inside the viewBox', () => {
    for (const { name, r } of rects(layout)) {
      expect(r.x, name).toBeGreaterThanOrEqual(0);
      expect(r.y, name).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, name).toBeLessThanOrEqual(layout.viewBox.w);
      expect(r.y + r.h, name).toBeLessThanOrEqual(layout.viewBox.h);
    }
  });
  it('has no overlapping cards or circles', () => {
    const all = rects(layout);
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(overlap(all[i]!.r, all[j]!.r), `${all[i]!.name} / ${all[j]!.name}`).toBe(false);
  });
  it('makes every betting circle a tap target of at least minTapUnits', () => {
    for (const [id, c] of Object.entries(layout.circles))
      expect(c.r * 2, id).toBeGreaterThanOrEqual(layout.minTapUnits);
  });
});

describe('spec geometry', () => {
  it('portrait matches simulator.md 3.2', () => {
    expect(portraitLayout.viewBox).toEqual({ w: 390, h: 600 });
    expect(portraitLayout.board.map((p) => p.x)).toEqual([16, 89, 162, 235, 308]);
    expect(portraitLayout.circles.play.r).toBe(38);
  });
  it('landscape matches simulator.md 3.3', () => {
    expect(landscapeLayout.viewBox).toEqual({ w: 560, h: 390 });
    expect(landscapeLayout.board.map((p) => p.x)).toEqual([80, 162, 244, 326, 408]);
    expect(Object.values(landscapeLayout.circles).map((c) => c.c.x)).toEqual([110, 220, 330, 440]);
  });
});
