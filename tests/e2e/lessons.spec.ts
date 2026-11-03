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

// Auto-play-only scenes hide the table: the step panel and Next must still be reachable in every
// orientation (l17-s1, l17-s2, l18-s1, l21-s1).
for (const [lesson, count] of [
  ['variance-and-bankroll', 2],
  ['costly-habits', 1],
  ['strategy-fun-per-dollar', 1],
] as const) {
  test(`auto-play scenes in ${lesson} complete from Run to Done`, async ({ page }) => {
    await page.goto(`/#/learn/${lesson}`);
    const scenes = page.locator('.scene');
    await expect(scenes).toHaveCount(count);
    for (let i = 0; i < count; i++) {
      const scene = scenes.nth(i);
      await scene.scrollIntoViewIfNeeded();
      await expect(scene.getByTestId('step-panel')).toBeVisible();
      await scene.getByRole('button', { name: 'Run' }).click();
      await expect(scene.getByTestId('auto-play-result')).toBeVisible({ timeout: 60_000 });
      await scene.getByTestId('step-next').scrollIntoViewIfNeeded();
      await scene.getByTestId('step-next').click();
      await expect(scene.locator('.scene-head .badge')).toHaveText('Done');
    }
  });
}

// D39: lessons decide their own EV mode and confirm policy, whatever the user's settings.
test('lesson 6: the compare step previews Bet 3x and Check through the confirm sheet', async ({
  page,
}) => {
  await page.goto('/#/learn/reading-the-ev-sheet');
  const scene = page.locator('.scene').filter({ hasText: 'Three options, one best' });
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: /^Deal/ }).click();
  await expect(scene.getByTestId('step-panel')).toContainText(/Don't confirm yet/);
  await expect(scene.getByTestId('simulator')).toHaveAttribute('data-ev', 'ready');
  await scene.locator('button[data-option="play-3"]').click();
  const sheet = page.getByTestId('ev-sheet');
  await expect(sheet).toBeVisible();
  // The exact preflop EVs for AA at a $10 Ante (decisions §4).
  await expect(sheet).toContainText('+$36.01');
  await expect(sheet).toContainText('+$28.97');
  await expect(sheet).toContainText('+$21.93');
  await expect(scene.getByTestId('step-panel')).toContainText(/Don't confirm yet/);
  await sheet.getByRole('button', { name: /Cancel/ }).click();
  await scene.locator('button[data-option="check"]').click();
  await expect(scene.getByTestId('step-panel')).toContainText(/Confirm the Best play/);
  await expect(scene.getByTestId('simulator')).toHaveAttribute('data-street', 'preflop');
});

test('lesson 6: the look step shows Big mistake on Bet 4x with 7-2 offsuit', async ({ page }) => {
  await page.goto('/#/learn/reading-the-ev-sheet');
  const scene = page.locator('.scene').filter({ hasText: 'A big mistake, on purpose' });
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: /^Deal/ }).click();
  await expect(scene.getByTestId('simulator')).toHaveAttribute('data-ev', 'ready');
  await scene.locator('button[data-option="play-4"]').click();
  await expect(page.getByTestId('ev-sheet')).toContainText(/Big mistake/);
  await expect(scene.getByTestId('step-panel')).toContainText(/Now tap/);
});

for (const [lesson, title] of [
  ['preflop-raise', 'Preflop calls'],
  ['final-exam', 'Five hands for the road'],
] as const) {
  test(`${lesson}: EV after you choose (evMode after), even when Settings says before`, async ({
    page,
  }) => {
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: /Before I choose/ }).check();
    await page.getByRole('radio', { name: /All bets/ }).check();
    await page.goto(`/#/learn/${lesson}`);
    const scene = page.locator('.scene').filter({ hasText: title });
    await scene.scrollIntoViewIfNeeded();
    const deal = scene.getByRole('button', { name: /^Deal/ });
    if (await deal.isVisible()) await deal.click();
    await expect(scene.getByTestId('simulator')).toHaveAttribute('data-ev', 'ready');
    // No EV before acting: no best badge and no money on the option buttons.
    await expect(scene.locator('.is-best')).toHaveCount(0);
    const opt = scene.locator('button[data-option="play-4"]');
    await expect(opt).not.toContainText('$');
    await opt.click();
    await expect(page.getByTestId('practice-hidden')).toBeVisible();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('practice-result')).toBeVisible();
    await expect(page.getByTestId('blunder-warning')).toHaveCount(0);
  });
}

test('lesson 20: the progressive meter slider prices the bet and finds break-even (I063)', async ({
  page,
}) => {
  await page.goto('/#/learn/other-side-bets');
  const block = page.getByTestId('progressive');
  await block.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('progressive-meter')).toHaveText('$50,000');
  await expect(page.getByTestId('progressive-edge')).toContainText('House edge 32.3%');
  await expect(page.getByTestId('progressive-edge')).toContainText('$9.70 an hour');
  await expect(page.getByTestId('progressive-vs')).toContainText('$160,530.53');
  const slider = page.getByTestId('progressive-slider');
  expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Keyboard: End jumps to the top of the range, Home to the bottom.
  await slider.focus();
  await page.keyboard.press('End');
  await expect(page.getByTestId('progressive-meter')).toHaveText('$300,000');
  await expect(page.getByTestId('progressive-edge')).toContainText('Player edge');
  await page.keyboard.press('Home');
  await expect(page.getByTestId('progressive-meter')).toHaveText('$10,000');
  await expect(page.getByTestId('progressive-vs')).toContainText('below break-even');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('lesson 20: dragging the meter from $10k to $300k never changes the block height (I063)', async ({
  page,
}) => {
  for (const vp of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(vp);
    await page.goto('/#/learn/other-side-bets');
    const block = page.getByTestId('progressive');
    await block.scrollIntoViewIfNeeded();
    const slider = page.getByTestId('progressive-slider');
    await slider.focus();
    await page.keyboard.press('Home');
    const heights = new Set<number>();
    const docHeights = new Set<number>();
    // Every $1,000 step across the whole range, by keyboard (one ArrowRight = one step).
    for (let m = 10_000; m <= 300_000; m += 1_000) {
      if (m > 10_000) await page.keyboard.press('ArrowRight');
      const h = await block.evaluate((el) => [
        Math.round(el.getBoundingClientRect().height),
        document.documentElement.scrollHeight,
      ]);
      heights.add(h[0]!);
      docHeights.add(h[1]!);
    }
    await expect(page.getByTestId('progressive-meter')).toHaveText('$300,000');
    expect([...heights], `block heights at ${vp.width}x${vp.height}`).toHaveLength(1);
    expect([...docHeights], `page heights at ${vp.width}x${vp.height}`).toHaveLength(1);
  }
});
