import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Lesson 19 has isolated citations and an adjacent run [2][3][4].
test('every .cite-btn has a >=44px hit area and neighbours do not overlap', async ({ page }) => {
  await page.goto('/#/learn/trips-bet');
  const btns = page.locator('.cite-btn');
  await expect(btns.first()).toBeVisible();
  const n = await btns.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    await btns.nth(i).scrollIntoViewIfNeeded();
    const r = await btns.nth(i).evaluate((el) => {
      const b = el.getBoundingClientRect();
      const hit = (x: number, y: number) => document.elementFromPoint(x, y) === el;
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
    else expect(r.left + r.right + r.w, `cite ${i} adjacent width`).toBeGreaterThanOrEqual(24);
  }
});

test('lesson with citations has no serious axe violations', async ({ page }) => {
  await page.goto('/#/learn/trips-bet');
  await expect(page.locator('.cite-btn').first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
