import { expect, test } from '@playwright/test';

// I007: after a showdown every face-up card says whether it plays, and the unused ones are dimmed.
test('a settled showdown marks the five cards that play on each side', async ({ page }) => {
  await page.goto('/#/play?seed=7&speed=instant');
  await page.locator('button[data-action="deal"]').click();
  await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'preflop');
  const before = await page
    .locator('g.sim-card:not(.sim-card-back)')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(before.every((n) => !/plays/.test(n ?? ''))).toBe(true);
  await page.locator('button[data-option="play-4"]').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('simulator')).toHaveAttribute('data-street', 'settled');
  const cards = page.locator('g.sim-card:not(.sim-card-back)');
  await expect(cards).toHaveCount(9);
  const names = await cards.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );
  for (const n of names) expect(n).toMatch(/, (plays|doesn't play)$/);
  const out = await page.locator('g.sim-card.is-out').count();
  const playing = names.filter((n) => n.endsWith(', plays')).length;
  expect(out + playing).toBe(9);
  // Each side plays exactly five, so at least five of the nine play and at most four are dimmed.
  expect(playing).toBeGreaterThanOrEqual(5);
  expect(out).toBeLessThanOrEqual(4);
  // The ActionBar did not move (dimming is opacity only).
  expect(
    await page
      .locator('g.sim-card.is-out')
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe('0s');
});

// Through the real Simulator: folding on the river leaves your own cards unlabelled, and only the
// dealer's best five counts (the board cards in it play, the others do not).
test('folding on the river marks only the dealer five', async ({ page }) => {
  await page.goto(
    '/#/play?seed=7&hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river&speed=instant',
  );
  await page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });
  await page.locator('button[data-option="fold"]').click();
  await expect(page.getByTestId('fold-reveal')).toBeVisible();
  const label = (name: string) =>
    page
      .locator('g.sim-card')
      .filter({ has: page.locator(`xpath=self::*[starts-with(@aria-label, "${name}")]`) });
  const names = await page
    .locator('g.sim-card:not(.sim-card-back)')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(names).toHaveLength(9);
  // Your two cards: no label at all.
  expect(names).toContain('Three of clubs');
  expect(names).toContain('Four of diamonds');
  // The dealer's pair of tens plays, with the board's ace, king and queen; the nine and seven do not.
  for (const n of [
    'Ten of diamonds',
    'Ten of spades',
    'Ace of hearts',
    'King of spades',
    'Queen of diamonds',
  ])
    expect(names).toContain(`${n}, plays`);
  for (const n of ['Nine of clubs', 'Seven of hearts'])
    expect(names).toContain(`${n}, doesn't play`);
  expect(await label('Three of clubs').count()).toBe(1);
  await expect(page.locator('g.sim-card.is-out')).toHaveCount(2);
});
