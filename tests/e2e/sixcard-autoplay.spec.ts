import { expect, test } from '@playwright/test';

// I062: with the table's Six Card Bonus on, auto-play settles it at every deal and reports it.
test('auto-play counts the Six Card Bonus when the table has it on', async ({ page }) => {
  await page.goto('/#/play?seed=7&speed=instant');
  await page.getByTestId('six-card-toggle').check();
  const auto = page.locator('details.sim-autoplay');
  await auto.locator('summary').click();
  const panel = page.getByTestId('auto-play');
  await panel.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('auto-play-result')).toBeVisible({ timeout: 30_000 });
  // 30 hands (one hour) at the default $5 bet from a $500 rack: every bet is taken.
  await expect(page.getByTestId('auto-play-six-card')).toHaveText(
    /^Six Card: 30 bets, \$150 wagered, net [+−-]?\u2060?\$[\d,]+(\.\d\d)?, \d+ paid$/,
  );

  // Off again: the next run has no Six Card line.
  await page.getByTestId('six-card-toggle').uncheck();
  await panel.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('auto-play-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('auto-play-six-card')).toHaveCount(0);
});
