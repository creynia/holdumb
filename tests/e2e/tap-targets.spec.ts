import { expect, test } from '@playwright/test';

// I034: every label wrapping a checkbox or radio is >= 44px tall, and tapping its text toggles it.
async function audit(page: import('@playwright/test').Page, where: string) {
  const labels = page.locator('label:has(input[type="checkbox"]), label:has(input[type="radio"])');
  const n = await labels.count();
  expect(n, `${where}: has checkbox/radio labels`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const label = labels.nth(i);
    if (!(await label.isVisible())) continue;
    const box = (await label.boundingBox())!;
    expect(box.height, `${where} label #${i} height`).toBeGreaterThanOrEqual(44);
  }
}

async function tapTextToggles(label: import('@playwright/test').Locator) {
  const input = label.locator('input').first();
  const before = await input.isChecked();
  await label.scrollIntoViewIfNeeded();
  const lb = (await label.boundingBox())!;
  const ib = (await input.boundingBox())!;
  // tap the label body to the right of the input, not the input itself
  const x = Math.min(lb.width - 6, ib.x - lb.x + ib.width + 20);
  await label.click({ position: { x, y: lb.height / 2 } });
  await expect(input).toBeChecked({ checked: !before });
}

test('play: the table options and compare labels are 44px and toggle from the text', async ({
  page,
}) => {
  await page.goto('/#/play');
  const confirm = page.getByTestId('confirm-toggle');
  await expect(confirm).toBeAttached();
  // Every EV segment and the Confirm label box are at least 44 x 44 (I090).
  for (const l of await page.locator('.sim-options label').all()) {
    const b = (await l.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
  await page.locator('details.sim-autoplay > summary').click();
  const cmp = page.locator('label:has-text("Compare (same cards)")');
  await expect(cmp).toBeVisible();
  await audit(page, '/play');
  await tapTextToggles(page.locator('label.sim-options-confirm'));
  await tapTextToggles(cmp);
});

test('settings: checkbox and radio labels are 44px', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.locator('input[type="radio"]').first()).toBeVisible();
  await audit(page, '/settings');
  await tapTextToggles(page.locator('label.check').first());
});

test('every lesson with a quiz has 44px option rows that toggle from the text', async ({
  page,
}) => {
  await page.goto('/#/learn');
  await expect(page.locator('a[href^="#/learn/"]').first()).toBeVisible();
  const hrefs = await page
    .locator('a[href^="#/learn/"]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
  expect(hrefs.length).toBeGreaterThan(5);
  let withQuiz = 0;
  for (const h of hrefs) {
    await page.goto(`/${h}`);
    await page.waitForLoadState('networkidle');
    const radios = page.locator('label:has(input[type="radio"])');
    if ((await radios.count()) === 0) continue;
    withQuiz++;
    await audit(page, h);
    await tapTextToggles(radios.first());
  }
  expect(withQuiz).toBeGreaterThan(0);
});
