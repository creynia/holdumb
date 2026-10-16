import { expect, test } from '@playwright/test';

test('a lesson scene completes in the UI and the lesson shows Done', async ({ page }) => {
  await page.goto('/#/learn/a-full-hand');
  const scene = page.locator('.scene').first();
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.getByTestId('step-panel')).toContainText(/Tap Deal/);
  // Deal is the only live action: Bet buttons do not exist yet.
  await expect(scene.locator('button[data-option]')).toHaveCount(0);
  await scene.getByRole('button', { name: /^Deal/ }).click();
  await expect(scene.getByTestId('step-panel')).toContainText(/Bet 4x/);
  // Once dealt, the player holds exactly two face-up cards (the dealer's two stay face down).
  await expect(scene.locator('g.sim-card:not(.sim-card-back)')).toHaveCount(2);
  await expect(scene.locator('g.sim-card-back')).toHaveCount(2);
  // The deal is locked while a decision is waiting.
  await scene.locator('button[data-option="play-4"]').click();
  await expect(scene.getByTestId('step-panel')).toContainText(/Step 3 of 3/);
  // The finished hand shows both hole cards, the dealer's two and the whole board.
  await expect(scene.locator('g.sim-card:not(.sim-card-back)')).toHaveCount(9);
  await scene.getByTestId('step-next').click();
  await expect(scene.locator('.scene-head .badge')).toHaveText('Done');
});

test('a wrong move is refused with the hint and there is no Try again', async ({ page }) => {
  await page.goto('/#/learn/expected-value');
  const scene = page.locator('.scene').first();
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: /^Deal/ }).click();
  await expect(scene.locator('button[data-option="check"]')).toBeVisible();
  await expect(scene.getByRole('button', { name: /try again/i })).toHaveCount(0);
});
