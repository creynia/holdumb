// curriculum.md 9.2: the Drill grading body per tier, the category reminder and the river outs count.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../../src/app/context';
import { Drill, type DrillDeps } from '../../src/app/screens/Drill';
import { MemoryStorage } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import { buildContent } from '../../src/content/load';
import { parseCards } from '../../src/sim/engine';
import { riverFacts } from '../../src/sim';
import type { DecisionPreview, DrillSpot } from '../../src/sim';
import type { DrillCategoryId } from '../../src/sim/strategy';

const content = buildContent(process.cwd());
const fr = (num: number, den = 1000) => ({ num: BigInt(num), den: BigInt(den) });

function spot(street: 'flop' | 'river', category: DrillCategoryId, cards: string): DrillSpot {
  const c = parseCards(cards);
  return { code: `t:${category}`, street, hole: [c[0]!, c[1]!], board: c.slice(2), category };
}

/** A two-option preview where the second option (the best) beats the first (the pick) by `regret`. */
function preview(
  street: 'flop' | 'river',
  tier: 'close' | 'small' | 'costly' | 'blunder',
  regretMilli: number,
  costCents: number,
): DecisionPreview {
  const [aLabel, a, bLabel, b] =
    street === 'flop'
      ? (['Bet 2x', { type: 'play', multiple: 2 }, 'Check', { type: 'check' }] as const)
      : (['Bet 1x', { type: 'play', multiple: 1 }, 'Fold', { type: 'fold' }] as const);
  const opt = (
    label: string,
    action: unknown,
    evMilli: number,
    cents: number,
    t: string,
    r: number,
  ) => ({
    action,
    label,
    ev: fr(evMilli),
    evCents: fr(cents, 1),
    assumesBestLater: false,
    why: { rows: [], casesLabel: 'deals', formula: '' },
    regret: fr(r),
    tier: t,
  });
  return {
    street,
    bestIndex: 1,
    handClass: null,
    options: [
      opt(aLabel, a, -regretMilli, 0, tier, regretMilli),
      opt(bLabel, b, 0, costCents, 'best', 0),
    ],
  } as unknown as DecisionPreview;
}

async function answer(s: DrillSpot, p: DecisionPreview, pick: string) {
  const deps: DrillDeps = {
    nextSpot: (rng) => [s, rng],
    preview: () => Promise.resolve(p),
    seed: 1,
  };
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(() => {
    render(
      <AppProviders content={content} store={new Store(new MemoryStorage())}>
        <Drill query={new URLSearchParams()} deps={deps} />
      </AppProviders>,
      el,
    );
  });
  const b = [...el.querySelectorAll<HTMLButtonElement>('.choice-row button')].find(
    (x) => x.textContent === pick,
  );
  expect(b, `button ${pick}`).toBeTruthy();
  await act(() => b!.click());
  await act(() => new Promise((r) => setTimeout(r, 0)));
  const res = el.querySelector('[data-testid="drill-result"]');
  expect(res, 'result shown').toBeTruthy();
  return { el, text: res!.querySelector('p[role="status"]')!.textContent };
}

const FLOP = 'Kc 3d 8s 5h 2c';
const PAIR = '9c 8d Ks Kd 4c';

describe('Drill grading copy (curriculum 9.2)', () => {
  it('names the category above the cards', async () => {
    const { el } = await answer(
      spot('flop', 'flop-board-pair', PAIR),
      preview('flop', 'costly', 400, 2000),
      'Bet 2x',
    );
    expect(el.querySelector('[data-testid="drill-category-label"]')!.textContent).toBe(
      'Flop board pairs',
    );
  });
  it('best: just the category reminder', async () => {
    const s = spot('flop', 'flop-nothing', FLOP);
    const p = preview('flop', 'close', 0, 0);
    // pick the best option (Check): it is graded best
    const { text } = await answer(s, p, 'Check');
    expect(text).toBe('Correct! No pair, no draw: check.');
  });
  it('close: "Either is fine." and no reminder', async () => {
    const { text } = await answer(
      spot('flop', 'flop-nothing', FLOP),
      preview('flop', 'close', 30, 150),
      'Bet 2x',
    );
    expect(text).toBe('Close call. Check is better by just 0.030 antes ($1.50). Either is fine.');
  });
  it('small: "per hand" plus the reminder', async () => {
    const { text } = await answer(
      spot('flop', 'flop-board-pair', PAIR),
      preview('flop', 'small', 120, 600),
      'Bet 2x',
    );
    expect(text).toBe(
      'Not quite. Check is better by 0.120 antes ($6 per hand). A pair on the board belongs to the dealer too: check.',
    );
  });
  it('costly and blunder: "earns ... more on average" plus the reminder', async () => {
    const c = await answer(
      spot('flop', 'flop-nothing', FLOP),
      preview('flop', 'costly', 400, 2000),
      'Bet 2x',
    );
    expect(c.text).toBe(
      'Mistake. Check earns 0.400 antes ($20) more on average. No pair, no draw: check.',
    );
    document.body.innerHTML = '';
    const b = await answer(
      spot('flop', 'flop-nothing', FLOP),
      preview('flop', 'blunder', 900, 4500),
      'Bet 2x',
    );
    expect(b.text).toBe(
      'Big mistake. Check earns 0.900 antes ($45) more on average. No pair, no draw: check.',
    );
  });
  it('river outs categories fill in the dealer outs from riverFacts', async () => {
    const s = spot('river', 'river-outs-edge', 'Qc 7d Kd Jh 9s 5c 2d');
    const outs = riverFacts(s.hole, s.board).outs;
    expect(outs).toBe(19);
    const { text } = await answer(s, preview('river', 'costly', 300, 1500), 'Bet 1x');
    expect(text).toBe(
      `Mistake. Fold earns 0.300 antes ($15) more on average. Count the dealer's outs: fewer than 21, bet 1x; otherwise fold. Here: ${outs}.`,
    );
  });
});
