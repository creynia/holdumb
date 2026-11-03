import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Proves @axe-core/playwright compiles against our pinned Playwright and runs.
test('home has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/');
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad).toEqual([]);
});

// Forced colours (Windows High Contrast): the play table still passes axe, and the tier words
// and the selected-button outline stay in the page.
test('practice table has no serious or critical axe violations in forced colours', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/#/play?speed=instant');
  await expect(page.getByTestId('simulator')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad).toEqual([]);
});

// The forced-colours block must actually apply: each tier has its own border, the selected button
// has an outline, the felt keeps its colours, and the current tab is underlined. Probe elements are
// injected so the test does not depend on a hand being dealt.
test('forced colours: tier borders differ, the selection outline shows, the felt keeps its colours, the current tab is underlined', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/#/play?speed=instant');
  await expect(page.getByTestId('simulator')).toBeVisible();
  const styles = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 's3-style-probe';
    host.innerHTML = ['best', 'close', 'small', 'costly', 'blunder']
      .map((t) => `<div class="sim-act-decision tier-${t}"></div>`)
      .join('')
      .concat(
        '<button class="sim-act is-selected" type="button">x</button>',
        '<nav class="tabbar"><a aria-current="page" href="#/play">x</a></nav>',
      );
    document.body.append(host);
    const decisions = [...host.querySelectorAll<HTMLElement>('.sim-act-decision')].map((e) => {
      const cs = getComputedStyle(e);
      return { style: cs.borderBottomStyle, width: cs.borderBottomWidth };
    });
    const selected = getComputedStyle(host.querySelector('button')!).outlineStyle;
    const tab = getComputedStyle(host.querySelector('.tabbar a')!).textDecorationLine;
    const felt = document.querySelector('.sim-felt');
    const feltAdjust = felt ? getComputedStyle(felt).forcedColorAdjust : 'missing';
    host.remove();
    return { decisions, selected, tab, feltAdjust };
  });
  expect(new Set(styles.decisions.map((d) => d.style)).size).toBe(5);
  // Every tier keeps the same border width, so the action bar never moves between tiers.
  expect(new Set(styles.decisions.map((d) => d.width)).size).toBe(1);
  expect(styles.selected).not.toBe('none');
  expect(styles.tab).toContain('underline');
  expect(styles.feltAdjust).toBe('none');
});

// In forced colours every tier's button must have the same box at both tight viewports, or the
// action bar moves between tiers. Probe buttons with the tier classes stand in for the real ones.
test('forced colours: every tier button has the same box at 360x740 and 844x390', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/#/play?speed=instant');
  await expect(page.getByTestId('simulator')).toBeVisible();
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const boxes = await page.evaluate(() => {
      const host = document.createElement('div');
      host.innerHTML = ['best', 'close', 'small', 'costly', 'blunder']
        .map(
          (t) => `<button type="button" class="sim-act sim-act-decision tier-${t}">Bet 2x</button>`,
        )
        .join('');
      document.body.append(host);
      const out = [...host.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return `${r.width}x${r.height}`;
      });
      host.remove();
      return out;
    });
    expect(new Set(boxes).size, `${viewport.width}x${viewport.height}: ${boxes.join(' ')}`).toBe(1);
  }
});
