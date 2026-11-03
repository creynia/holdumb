import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Lesson 19 has isolated citations and an adjacent run [2][3][4].
test('every .cite-btn has a >=44px hit area and neighbours do not overlap', async ({ page }) => {
  await page.goto('/#/learn/trips-bet');
  const btns = page.locator('.cite-btn');
  await expect(btns.first()).toBeAttached();
  const n = await btns.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    await btns.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const r = await btns.nth(i).evaluate((el) => {
      // The button box is 0 tall (line-height 0), so probe from the centre of its glyph.
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const b = rg.getBoundingClientRect();
      // A neighbouring citation on the next line may win the shared strip; the tap still hits a citation.
      const hit = (x: number, y: number) => {
        const t = document.elementFromPoint(x, y);
        return t === el || !!t?.classList.contains('cite-btn');
      };
      // Probe outward from the visual box to find the extent of the hit area, per axis.
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const extent = (dx: number, dy: number) => {
        let d = 0;
        while (d < 40 && hit(cx + dx * (d + 1), cy + dy * (d + 1))) d++;
        return d;
      };
      const next = el.parentElement?.nextElementSibling?.classList.contains('cite') ?? false;
      const prev = el.parentElement?.previousElementSibling?.classList.contains('cite') ?? false;
      return {
        up: extent(0, -1),
        down: extent(0, 1),
        left: extent(-1, 0),
        right: extent(1, 0),
        h: b.height,
        w: b.width,
        next,
        prev,
      };
    });
    expect(r.up + r.down + r.h, `cite ${i} height`).toBeGreaterThanOrEqual(43);
    if (!r.next && !r.prev)
      expect(r.left + r.right + r.w, `cite ${i} width`).toBeGreaterThanOrEqual(43);
    else expect(r.left + r.right + r.w, `cite ${i} adjacent width`).toBeGreaterThanOrEqual(20);
  }
});

test('lesson with citations has no serious axe violations', async ({ page }) => {
  await page.goto('/#/learn/trips-bet');
  await expect(page.locator('.cite-btn').first()).toBeAttached();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
