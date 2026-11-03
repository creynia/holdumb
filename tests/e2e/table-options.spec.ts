// I090: the table options row (Show EV segments and the Confirm box) on /play. They are the
// persisted settings: they act mid-decision, survive a reload and agree with More -> Settings.
import { expect, test } from '@playwright/test';

const FLOP = '/#/play?hole=AhTc&board=7dKs2c&dealer=9d9s&street=flop&speed=instant';
const ready = (page: import('@playwright/test').Page) =>
  page.waitForSelector('[data-testid="simulator"][data-ev="ready"]', { timeout: 20_000 });

test('EV segments act at once mid-decision, persist, and match Settings', async ({ page }) => {
  await page.goto(FLOP);
  await ready(page);
  const ev = page.getByRole('group', { name: 'Show EV' });
  const sub = page.locator('button[data-option] .sim-act-sub').first();
  await expect(sub).toContainText('·');
  await ev.getByRole('radio', { name: 'After' }).check();
  await expect(ev.getByRole('radio', { name: 'After' })).toBeChecked();
  await expect(page.locator('button[data-option]').first()).not.toContainText('·');
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole('group', { name: 'Show EV' }).getByRole('radio', { name: 'After' }),
  ).toBeChecked();
  await expect(page.locator('button[data-option]').first()).not.toContainText('·');
  await page.goto('/#/settings');
  await expect(page.getByRole('radio', { name: /After I choose/ })).toBeChecked();
  await page.goto(FLOP);
  await ready(page);
  const ev2 = page.getByRole('group', { name: 'Show EV' });
  await ev2.getByRole('radio', { name: 'Off' }).check();
  await ev2.getByRole('radio', { name: 'Before' }).check();
  await ready(page);
  await expect(page.locator('button[data-option] .sim-act-sub').first()).toContainText('·');
});

test('Confirm box is the confirm setting; Settings agrees', async ({ page }) => {
  await page.goto('/#/play');
  const box = page.getByRole('checkbox', { name: 'Confirm bets' });
  await expect(box).not.toBeChecked();
  await expect(box).toHaveAccessibleDescription(/Asks before a bet goes in: All bets\./);
  await page.locator('label.sim-options-confirm').click();
  await expect(box).toBeChecked();
  await page.goto('/#/settings');
  await expect(page.getByRole('radio', { name: /^All bets/ })).toBeChecked();
  await page.getByRole('radio', { name: /^Only bad bets/ }).check();
  await page.goto('/#/play');
  await expect(page.getByRole('checkbox', { name: 'Confirm bets' })).toHaveAccessibleDescription(
    /Only bad bets\./,
  );
});

test('keyboard: Tab reaches the group, arrows move the radio, Space toggles Confirm', async ({
  page,
}) => {
  await page.goto('/#/play');
  const before = page.getByRole('radio', { name: 'Before' });
  await before.focus();
  await expect(before).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const after = page.getByRole('radio', { name: 'After' });
  await expect(after).toBeFocused();
  await expect(after).toBeChecked();
  // The focus ring shows on the segment around the native radio.
  const outline = await page
    .locator('.sim-seg-opt:has(input:focus-visible)')
    .evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(outline).toBe('solid');
  await page.keyboard.press('Tab');
  const box = page.getByRole('checkbox', { name: 'Confirm bets' });
  await expect(box).toBeFocused();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
});

test('no options row in a lesson scene or on Drill', async ({ page }) => {
  await page.goto('/#/learn/a-full-hand');
  const scene = page.locator('.scene').first();
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.getByTestId('simulator')).toBeVisible();
  await expect(page.getByTestId('table-options')).toHaveCount(0);
  await page.goto('/#/drill?street=flop');
  await expect(page.getByTestId('drill-spot')).toBeVisible();
  await expect(page.getByTestId('table-options')).toHaveCount(0);
});
