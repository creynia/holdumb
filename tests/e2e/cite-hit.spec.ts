import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

// Every lesson that has citations (lesson id = file name without the numeric prefix).
const lessons = readdirSync('content/lessons')
  .filter(
    (f) => f.endsWith('.md') && /\[\^\d+\]/.test(readFileSync(`content/lessons/${f}`, 'utf8')),
  )
  .map((f) => f.replace(/^\d+-/, '').replace(/\.md$/, ''));

test('there are lessons with citations to test', () => {
  expect(lessons.length).toBeGreaterThanOrEqual(9);
});

for (const id of lessons) {
  test(`${id}: every .cite-btn hit area is wide enough, and a tap on a glyph hits that button`, async ({
    page,
  }) => {
    await page.goto(`/#/learn/${id}`);
    const btns = page.locator('.cite-btn');
    await expect(btns.first()).toBeAttached();
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      const r = await btns.nth(i).evaluate((el) => {
        el.scrollIntoView({ block: 'center' });
        // The button box is 0 tall (line-height 0), so probe from the glyph's own box.
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const g = rg.getBoundingClientRect();
        const cx = g.x + g.width / 2;
        const cy = g.y + g.height / 2;
        const own = (x: number, y: number) => document.elementFromPoint(x, y) === el;
        // 3x3 grid inside the glyph: all of it must hit this very button.
        let glyphHits = 0;
        for (const fx of [0.2, 0.5, 0.8])
          for (const fy of [0.2, 0.5, 0.8])
            if (own(g.x + g.width * fx, g.y + g.height * fy)) glyphHits++;
        const reach = (dx: number, dy: number) => {
          let d = 0;
          while (d < 60 && own(cx + dx * (d + 1), cy + dy * (d + 1))) d++;
          return d;
        };
        // Each reach counts the 1px steps beyond the centre pixel, so add 1 for the centre itself.
        return {
          glyphHits,
          width: reach(-1, 0) + reach(1, 0) + 1,
          height: reach(0, -1) + reach(0, 1) + 1,
        };
      });
      expect(r.glyphHits, `cite ${i} glyph taps`).toBe(9);
      expect(r.width, `cite ${i} width`).toBeGreaterThanOrEqual(44);
      expect(r.height, `cite ${i} height`).toBeGreaterThanOrEqual(24);
    }
  });

  test(`${id}: the hit area does not change the layout`, async ({ page }) => {
    await page.goto(`/#/learn/${id}`);
    await expect(page.locator('.cite-btn').first()).toBeAttached();
    const measure = () =>
      page.evaluate(() => ({
        h: document.documentElement.scrollHeight,
        w: document.documentElement.scrollWidth,
        p: [...document.querySelectorAll('.lesson p, .lesson li')].map((e) => {
          const b = e.getBoundingClientRect();
          return [Math.round(b.x), Math.round(b.y + scrollY), Math.round(b.height)];
        }),
      }));
    const withHit = await measure();
    await page.addStyleTag({ content: '.cite-btn::before { display: none !important; }' });
    expect(withHit).toEqual(await measure());
    expect(withHit.w).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test('a lesson with citations has no serious axe violations', async ({ page }) => {
  await page.goto('/#/learn/trips-bet');
  await expect(page.locator('.cite-btn').first()).toBeAttached();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
