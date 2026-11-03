import { expect, test } from '@playwright/test';

// I074: a corrupt sandbox snapshot must never leave /play blank. Either the table shows (snapshot
// ignored) or the recoverable fallback does, with the tab bar alive either way.
const corruptions: [string, unknown][] = [
  ['a string', 'not a snapshot'],
  ['an empty object', {}],
  ['wrong field types', { state: 42, bankroll: 'lots', hand: [null] }],
  ['a number', 12345],
];

for (const [name, sandbox] of corruptions) {
  test(`/play with a corrupt sandbox (${name}) is never blank`, async ({ page }) => {
    await page.addInitScript((snap) => {
      // Only seed once, so Reset table can clear it and a reload does not re-inject it.
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'holdumb:v1',
        JSON.stringify({
          version: 1,
          lessons: {},
          settings: {},
          drill: {},
          sandbox: snap,
        }),
      );
    }, sandbox);
    await page.goto('/#/play');
    const table = page.getByTestId('simulator');
    const fallback = page.getByTestId('error-screen');
    await expect(table.or(fallback)).toBeVisible({ timeout: 20_000 });
    // Tab bar on phones, top nav on desktop: whichever is shown must stay alive.
    const nav = page.locator('nav.tabbar:visible, nav.topnav:visible');
    await expect(nav).toBeVisible();
    if (await fallback.isVisible()) {
      await expect(fallback).toContainText('This screen hit a problem');
      await page.getByRole('button', { name: 'Reset table' }).click();
      await expect(table).toBeVisible({ timeout: 20_000 });
    }
    await nav.locator('a[href="#/learn"]').click();
    await expect(page.locator('main#main h1')).toBeVisible();
  });
}

test('a real render error shows the fallback, keeps the nav alive, and Reset table recovers /play', async ({
  page,
}) => {
  // formatMoney is the only caller of this thousands-separator regex; while the flag is set it
  // throws, so every screen that prints money fails to render.
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- re-applied with .apply below
    const replace = String.prototype.replace;
    (window as unknown as { __boom: boolean }).__boom = false;
    String.prototype.replace = function (this: string, ...args: [never, never]) {
      const [pattern] = args as unknown as [unknown];
      if (
        (window as unknown as { __boom: boolean }).__boom &&
        pattern instanceof RegExp &&
        pattern.source.startsWith('\\B(?=(\\d{3})')
      )
        throw new Error('forced render error');
      return replace.apply(this, args);
    } as typeof String.prototype.replace;
  });
  await page.goto('/#/learn');
  const nav = page.locator('nav.tabbar:visible, nav.topnav:visible');
  await expect(nav).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __boom: boolean }).__boom = true));
  await nav.locator('a[href="#/play"]').click();
  const fallback = page.getByTestId('error-screen');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText('This screen hit a problem');
  await expect(page.getByTestId('error-build-sha')).not.toBeEmpty();
  await expect(nav).toBeVisible();
  // Reset table is on /play only, and clears the flag's cause by remounting once it is fixed.
  await page.evaluate(() => ((window as unknown as { __boom: boolean }).__boom = false));
  await page.getByRole('button', { name: 'Reset table' }).click();
  await expect(page.getByTestId('simulator')).toBeVisible({ timeout: 20_000 });
  await expect(fallback).toBeHidden();
});
