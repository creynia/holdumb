// I060: Drill's count-the-outs mode: a number, the exact count, the missed ranks, then the action.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../../src/app/context';
import { Drill, type DrillDeps } from '../../src/app/screens/Drill';
import { outsFeedback, parseOuts } from '../../src/app/screens/DrillOuts';
import { MemoryStorage, sanitize } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import { buildContent } from '../../src/content/load';
import { parseCards } from '../../src/sim/engine';
import { gradeSpot, outsDetailText, riverFacts } from '../../src/sim';
import type { DecisionPreview, DrillSpot } from '../../src/sim';

const content = buildContent(process.cwd());
const fr = (num: number, den = 1000) => ({ num: BigInt(num), den: BigInt(den) });

/** Qc 7d on Kd Jh 9s 5c 2d: 19 dealer outs, no hidden pair. */
const c = parseCards('Qc 7d Kd Jh 9s 5c 2d');
const SPOT: DrillSpot = {
  code: 'r:Qc7d.KdJh9s5c2d',
  street: 'river',
  hole: [c[0]!, c[1]!],
  board: c.slice(2),
  category: 'river-outs-edge',
};
const FACTS = riverFacts(SPOT.hole, SPOT.board);

const opt = (
  label: string,
  action: unknown,
  ev: number,
  cents: number,
  tier: string,
  r: number,
) => ({
  action,
  label,
  ev: fr(ev),
  evCents: fr(cents, 1),
  assumesBestLater: false,
  why: { rows: [], casesLabel: 'deals', formula: '' },
  regret: fr(r),
  tier,
});
const PREVIEW = {
  street: 'river',
  bestIndex: 0,
  handClass: null,
  options: [
    opt('Bet 1x', { type: 'play', multiple: 1 }, 0, 0, 'best', 0),
    opt('Fold', { type: 'fold' }, -100, -359, 'small', 100),
  ],
} as unknown as DecisionPreview;

async function mount(query = 'mode=outs', store = new Store(new MemoryStorage())) {
  const deps: DrillDeps = {
    nextSpot: (rng) => [SPOT, rng],
    gradeSpot,
    preview: () => Promise.resolve(PREVIEW),
    seed: 1,
  };
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(() => {
    render(
      <AppProviders content={content} store={store}>
        <Drill query={new URLSearchParams(query)} deps={deps} />
      </AppProviders>,
      el,
    );
  });
  return { el, store };
}
const typeAndCheck = async (el: HTMLElement, value: string) => {
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Dealer outs"]')!;
  await act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
};

describe('outsFeedback / parseOuts', () => {
  it('exact count, and the count with the ranks when it differs', () => {
    expect(outsFeedback(19, FACTS, SPOT.hole, SPOT.board)).toBe('Exactly right: 19 outs.');
    const detail = outsDetailText(FACTS, SPOT.hole, SPOT.board);
    expect(FACTS.outs).toBe(19);
    expect(outsFeedback(16, FACTS, SPOT.hole, SPOT.board)).toBe(
      `19 outs (you said 16): ${detail} beat you.`,
    );
    expect(detail).toMatch(/any \w+ \(\d\)/);
  });
  it('0 outs reads plainly; a field accepts only whole numbers 0 to 45', () => {
    const f0 = { ...FACTS, outs: 0, outCards: [] };
    expect(outsFeedback(3, f0, SPOT.hole, SPOT.board)).toBe(
      '0 outs (you said 3): no single card beats you.',
    );
    expect(['0', '19', '45'].map(parseOuts)).toEqual([0, 19, 45]);
    expect(['', '46', '-1', '1.5', 'abc', '100'].map(parseOuts)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('Drill ?mode=outs', () => {
  it('asks for the count first: a "Dealer outs" field, no action buttons, no category spoiler', async () => {
    const { el } = await mount();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Dealer outs"]');
    expect(input).toBeTruthy();
    expect(el.querySelector('.choice-row')).toBeNull();
    expect(el.querySelector('[data-testid="drill-category-label"]')).toBeNull();
    expect(el.querySelector('button[type="submit"]')!.hasAttribute('disabled')).toBe(true);
    expect(el.querySelector('[data-testid="drill-spot"]')!.getAttribute('data-street')).toBe(
      'river',
    );
  });
  it('the +/- buttons step within 0..45', async () => {
    const { el } = await mount();
    const input = () => el.querySelector<HTMLInputElement>('input[aria-label="Dealer outs"]')!;
    const more = el.querySelector<HTMLButtonElement>('button[aria-label="One more out"]')!;
    const fewer = el.querySelector<HTMLButtonElement>('button[aria-label="One fewer out"]')!;
    await act(() => more.click());
    expect(input().value).toBe('0');
    await act(() => more.click());
    expect(input().value).toBe('1');
    await act(() => fewer.click());
    await act(() => fewer.click());
    expect(input().value).toBe('0');
    await typeAndCheckValue(el, '45');
  });
  it('an exact answer: the count is confirmed, the action question follows and is graded as today', async () => {
    const { el, store } = await mount();
    await typeAndCheck(el, '19');
    const fb = el.querySelector('[data-testid="outs-feedback"]')!;
    expect(fb.textContent).toContain('Exactly right: 19 outs.');
    expect(fb.textContent).toContain('So: bet 1x or fold?');
    expect(store.drill.outs).toEqual({ answered: 1, exact: 1, within2: 1, absErrorTotal: 0 });
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.choice-row button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Fold', 'Bet 1x']);
    await act(() => buttons[1]!.click());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(el.querySelector('[data-testid="drill-result"]')!.getAttribute('data-tier')).toBe(
      'best',
    );
  });
  it('a miss names the count and the ranks, and the error is kept', async () => {
    const { el, store } = await mount();
    await typeAndCheck(el, '16');
    const fb = el.querySelector('[data-testid="outs-feedback"]')!.textContent;
    expect(fb).toContain(
      `19 outs (you said 16): ${outsDetailText(FACTS, SPOT.hole, SPOT.board)} beat you.`,
    );
    expect(store.drill.outs).toEqual({ answered: 1, exact: 0, within2: 0, absErrorTotal: 3 });
  });
  it('stats are exact rate, within 2 and the mean absolute error, and persist', async () => {
    const m = new MemoryStorage();
    const store = new Store(m);
    store.recordOuts(19, 19);
    store.recordOuts(21, 19);
    store.recordOuts(10, 19);
    store.flush();
    expect(new Store(m).drill.outs).toEqual({
      answered: 3,
      exact: 1,
      within2: 2,
      absErrorTotal: 11,
    });
    const { el } = await mount('mode=outs', new Store(m));
    expect(el.querySelector('[data-testid="outs-stats"]')!.textContent).toMatch(
      /33% exact, 67% within 2, average miss 3\.7 \(3 answers\)/,
    );
  });
  it('without ?mode=outs the screen is the action drill as before', async () => {
    const { el } = await mount('street=river');
    expect(el.querySelector('input[aria-label="Dealer outs"]')).toBeNull();
    expect(el.querySelector('.choice-row')).toBeTruthy();
    expect(el.querySelector('a[href="#/drill?mode=outs"]')).toBeTruthy();
  });
});

describe('outs stats: sanitize', () => {
  it('clamps and defaults malformed records', () => {
    const p = sanitize({
      version: 1,
      drill: { outs: { answered: 5, exact: 9, within2: 2, absErrorTotal: -3 } },
    })!;
    expect(p.drill.outs).toEqual({ answered: 5, exact: 5, within2: 5, absErrorTotal: 0 });
    expect(sanitize({ version: 1, drill: { outs: 'x' } })!.drill.outs).toEqual({
      answered: 0,
      exact: 0,
      within2: 0,
      absErrorTotal: 0,
    });
  });
});

async function typeAndCheckValue(el: HTMLElement, value: string) {
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Dealer outs"]')!;
  await act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(el.querySelector('button[type="submit"]')!.hasAttribute('disabled')).toBe(false);
}
