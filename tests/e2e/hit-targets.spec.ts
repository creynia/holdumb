import { expect, test } from '@playwright/test';

// I032: the bet-circle hit rects scale with the felt; they must stay >= 44 CSS px, apart, and clear of the cards.
const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
];
const EPS = 0.5;
type Box = { x: number; y: number; width: number; height: number };
const hit = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${size.width}x${size.height} ${scheme}`, () => {
      test.use({ viewport: size, colorScheme: scheme });

      test('circle hit targets are 44px, disjoint from each other and the card slots; corners tap the right circle', async ({
        page,
      }) => {
        test.skip(test.info().project.name !== 'mobile', 'viewport is set by this spec');
        await page.goto('/#/play?seed=7&speed=instant');
        const ids = ['trips', 'ante', 'blind', 'play'];
        const boxes: Record<string, Box> = {};
        for (const id of ids) {
          await expect(page.locator(`rect.sim-hit[data-hit="${id}"]`)).toBeVisible();
          boxes[id] = (await page.locator(`rect.sim-hit[data-hit="${id}"]`).boundingBox())!;
          expect(boxes[id].width, `${id} width`).toBeGreaterThanOrEqual(44 - EPS);
          expect(boxes[id].height, `${id} height`).toBeGreaterThanOrEqual(44 - EPS);
        }
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++)
            expect(hit(boxes[ids[i]!]!, boxes[ids[j]!]!), `${ids[i]} / ${ids[j]}`).toBe(false);
        const cards = await page.locator('svg.sim-felt .sim-slot, svg.sim-felt g.sim-card').all();
        for (const c of cards) {
          const b = await c.boundingBox();
          if (!b) continue;
          for (const id of ids) expect(hit(boxes[id]!, b), `${id} / card`).toBe(false);
        }
        // every corner (inset 1px) of every padded rect lands on that same rect
        for (const id of ids) {
          const b = boxes[id]!;
          for (const [dx, dy] of [
            [1, 1],
            [b.width - 1, 1],
            [1, b.height - 1],
            [b.width - 1, b.height - 1],
          ] as const) {
            const got = await page.evaluate(
              ([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute('data-hit') ?? null,
              [b.x + dx, b.y + dy],
            );
            expect(got, `${id} corner ${dx},${dy}`).toBe(id);
          }
        }
        // a real tap on the top-left corner of Trips bets on Trips
        const t = boxes.trips!;
        const before = await page.locator('[data-circle="trips"]').textContent();
        await page.mouse.click(t.x + 2, t.y + 2);
        await expect(page.locator('[data-circle="trips"]')).not.toHaveText(before ?? '');
      });
    });
  }
}
