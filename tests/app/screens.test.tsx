import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import content from 'virtual:content';
import { parseCards } from '../../src/sim/engine';
import type { DecisionPreview, DrillSpot } from '../../src/sim';
import { App } from '../../src/app/App';
import { AppProviders } from '../../src/app/context';
import { Drill, type DrillDeps } from '../../src/app/screens/Drill';
import { About } from '../../src/app/screens/About';
import { MemoryStorage } from '../../src/app/storage';
import { Store } from '../../src/app/store';

async function mount(hash: string, store = new Store(new MemoryStorage())) {
  location.hash = hash;
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(() => {
    render(
      <AppProviders content={content} store={store}>
        <App />
      </AppProviders>,
      el,
    );
  });
  return { el, store };
}
const btn = (el: HTMLElement, text: string | RegExp) =>
  [...el.querySelectorAll<HTMLElement>('button, a.btn')].find((b) =>
    typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''),
  )!;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('shell', () => {
  it('has exactly the four D4 tabs, in order, and marks the current one', async () => {
    const { el } = await mount('#/learn');
    const tabs = [...el.querySelectorAll('nav.tabbar a')];
    expect(tabs.map((a) => a.textContent)).toEqual(['♠Learn', '⚅Play', '◎Drill', '≡More']);
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual([
      '#/learn',
      '#/play',
      '#/drill',
      '#/more',
    ]);
    expect(el.querySelector('nav.tabbar a[aria-current="page"]')?.getAttribute('href')).toBe(
      '#/learn',
    );
  });
  it('keeps More highlighted on its sub-screens', async () => {
    for (const h of ['#/strategy', '#/hands', '#/bets', '#/settings', '#/about', '#/glossary']) {
      const { el } = await mount(h);
      expect(el.querySelector('nav.tabbar a[aria-current="page"]')?.getAttribute('href')).toBe(
        '#/more',
      );
      document.body.innerHTML = '';
    }
  });
  it.each([
    '#/',
    '#/learn',
    '#/play',
    '#/drill',
    '#/strategy',
    '#/hands',
    '#/bets',
    '#/bets/trips',
    '#/glossary',
    '#/settings',
    '#/about',
    '#/more',
  ])('%s renders one h1 (or the table)', async (h) => {
    const { el } = await mount(h);
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('main#main')).toBeTruthy();
    document.body.innerHTML = '';
  });
  it.each(['#/nope', '#/learn/missing', '#/bets/missing'])('%s is not found', async (h) => {
    const { el } = await mount(h);
    expect(el.querySelector('h1')?.textContent).toBe('Not found');
  });
});

describe('Learn', () => {
  it('puts the strategy chart card first, then every chapter', async () => {
    const { el } = await mount('#/learn');
    const page = el.querySelector('.page')!;
    const first = [...page.children].find((c) => c.tagName !== 'H1')!;
    expect(first.getAttribute('href')).toBe('#/strategy');
    expect(el.querySelectorAll('section.chapter').length).toBe(content.chapters.length);
    expect(el.querySelectorAll('a.lesson-row').length).toBe(content.lessons.length);
  });
  it('lesson badges update live when a lesson is completed elsewhere', async () => {
    const { el, store } = await mount('#/learn');
    const id = content.lessons[0]!.id;
    const row = () => el.querySelector(`a[href="#/learn/${id}"]`)!;
    expect(row().className).toContain('st-new');
    await act(() => store.completeLesson(id));
    expect(row().className).toContain('st-done');
    expect(row().textContent).toContain('Complete');
  });
});

describe('Lesson', () => {
  const withQuiz = content.lessons.find((l) =>
    l.blocks.some((b) => b.kind === 'quiz' && b.quiz.hand),
  )!;
  it('renders every block kind from the sample content', async () => {
    const kinds = new Set(content.lessons.flatMap((l) => l.blocks.map((b) => b.kind)));
    for (const k of ['html', 'tip', 'math', 'scene', 'quiz'])
      expect(kinds.has(k as never)).toBe(true);
    const rich = content.lessons.find((l) => l.blocks.some((b) => b.kind === 'math'))!;
    const { el } = await mount(`#/learn/${rich.id}`);
    expect(el.querySelector('details.math')).toBeTruthy();
    expect(el.querySelector('aside.tip')).toBeTruthy();
    expect(el.querySelector('.prose .cards[role="img"]')).toBeTruthy();
    expect(el.querySelector('section.scene')).toBeTruthy();
  });
  it('marks complete, and the footer button reflects it', async () => {
    const { el, store } = await mount(`#/learn/${withQuiz.id}`);
    await act(() => btn(el, 'Mark complete').click());
    expect(store.status(withQuiz.id)).toBe('done');
    expect(btn(el, /Completed/).getAttribute('aria-pressed')).toBe('true');
  });
  it('quiz: draws the hand and inline cards, grades, records the first try', async () => {
    const quiz = withQuiz.blocks.flatMap((b) =>
      b.kind === 'quiz' && b.quiz.hand ? [b.quiz] : [],
    )[0]!;
    const { el: page, store } = await mount(`#/learn/${withQuiz.id}`);
    const radios0 = page.querySelector<HTMLInputElement>(`input[name="quiz-${quiz.id}"]`)!;
    const el = radios0.closest('fieldset')! as HTMLElement;
    expect(el.querySelector('[data-testid="quiz-hand"] .cards')).toBeTruthy();
    const radios = el.querySelectorAll<HTMLInputElement>(`input[name="quiz-${quiz.id}"]`);
    expect(radios.length).toBe(quiz.choices.length);
    const wrong = (quiz.answer + 1) % radios.length;
    await act(() => {
      radios[wrong]!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(() => btn(el, 'Check answer').click());
    expect(el.querySelector('.quiz-result.no')).toBeTruthy();
    expect(store.lesson(withQuiz.id)?.quizzes[quiz.id]).toMatchObject({
      correct: false,
      firstTry: false,
    });
    await act(() => btn(el, 'Try again').click());
    const again = el.querySelectorAll<HTMLInputElement>(`input[name="quiz-${quiz.id}"]`);
    await act(() => {
      again[quiz.answer]!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(() => btn(el, 'Check answer').click());
    expect(el.querySelector('.quiz-result.ok')).toBeTruthy();
    expect(store.lesson(withQuiz.id)?.quizzes[quiz.id]?.correct).toBe(true);
  });
  it('quiz options and explanations render {{cards}}', async () => {
    const l = content.lessons.find((x) =>
      x.blocks.some((b) => b.kind === 'quiz' && b.quiz.choices.some((c) => c.includes('{{'))),
    );
    if (!l) return; // no lesson puts cards in a choice (yet)
    const { el } = await mount(`#/learn/${l.id}`);
    expect(el.querySelectorAll('.choice .cards').length).toBeGreaterThan(0);
    expect(el.textContent).not.toContain('{{');
  });
  it('shows previous / next links across lessons', async () => {
    const { el } = await mount(`#/learn/${content.lessons[1]!.id}`);
    const links = [...el.querySelectorAll('.prevnext a')].map((a) => a.getAttribute('href'));
    expect(links).toContain(`#/learn/${content.lessons[0]!.id}`);
  });
});

describe('reference screens', () => {
  it('Hands lists all ten categories, strongest first, with drawn examples', async () => {
    const { el } = await mount('#/hands');
    const rows = [...el.querySelectorAll<HTMLElement>('li[data-category]')];
    expect(rows.length).toBe(10);
    expect(rows[0]!.dataset.category).toBe('royal-flush');
    expect(rows[9]!.dataset.category).toBe('high-card');
    expect(rows.every((r) => r.querySelector('.cards'))).toBe(true);
    expect(rows[0]!.querySelectorAll('.pc').length).toBe(5);
  });
  it('Paytables show the Blind table and all five Trips presets', async () => {
    const { el } = await mount('#/bets');
    expect(el.querySelectorAll('[data-preset]').length).toBe(5);
    expect(el.querySelector('[data-section="blind"] tbody')!.children.length).toBe(6);
    expect(el.querySelector('[data-preset="trips-8-6-5"]')!.textContent).toContain('In use');
    expect(el.querySelector('[data-preset="trips-8-6-5"]')!.textContent).toContain('1.904%');
  });
  it('Strategy: lens buttons and the three chart views', async () => {
    const { el } = await mount('#/strategy?lens=practical');
    expect(el.querySelectorAll('[data-testid="chart-block"]').length).toBe(3);
    const pressed = [...el.querySelectorAll('.seg')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['false', 'true', 'false']);
  });
  it('Play mounts the simulator', async () => {
    const { el } = await mount('#/play?hole=AsKd&board=QhJh2c');
    expect(el.querySelector('[data-testid="simulator"]')).toBeTruthy();
  });
  it('offers the offline copy on Home and More', async () => {
    for (const h of ['#/', '#/more']) {
      const { el } = await mount(h);
      expect(
        el.querySelector('a[download][href*="releases/download/latest-build/holdumb.html"]'),
      ).toBeTruthy();
      document.body.innerHTML = '';
    }
  });
  it('More links to the reference screens, strategy charts first', async () => {
    const { el } = await mount('#/more');
    const hrefs = [...el.querySelectorAll('.grid a')].map((a) => a.getAttribute('href'));
    expect(hrefs[0]).toBe('#/strategy');
    expect(hrefs).toEqual(expect.arrayContaining(['#/hands', '#/bets', '#/settings', '#/about']));
  });
});

describe('Settings', () => {
  it('exposes the D30 fields and the Trips variants menu', async () => {
    const { el, store } = await mount('#/settings');
    const selects = el.querySelectorAll('select');
    const trips = selects[0]!;
    expect(trips.options.length).toBe(5);
    await act(() => {
      trips.value = 'trips-9-7-4';
      trips.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(store.settings.paytable).toBe('trips-9-7-4');
    const boxes = [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const practice = boxes.find((b) => b.parentElement?.textContent?.includes('Practice'))!;
    await act(() => {
      practice.checked = true;
      practice.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(store.settings.practice).toBe(true);
    expect(boxes.length).toBeGreaterThanOrEqual(5); // practice, confirm, skip, reduce motion, four-colour
  });
  it('applies the theme and four-colour deck to the document', async () => {
    const { store } = await mount('#/settings');
    await act(() => store.updateSettings({ theme: 'dark', fourColorDeck: true }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-fourcolor')).toBe('true');
  });
  it('import needs a second confirmation; junk is rejected', async () => {
    const src = new Store(new MemoryStorage());
    src.completeLesson('a');
    const { el, store } = await mount('#/settings');
    const ta = el.querySelector('textarea')!;
    await act(() => {
      ta.value = 'junk';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => btn(el, 'Import').click());
    expect(el.querySelector('[role="status"]')?.textContent).toContain('not valid');
    await act(() => {
      ta.value = src.exportCode();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => btn(el, 'Import').click());
    expect(store.status('a')).toBe('new');
    await act(() => btn(el, 'Yes, replace').click());
    expect(store.status('a')).toBe('done');
  });
  it('warns when progress cannot be saved', async () => {
    const { el } = await mount('#/settings');
    expect(el.textContent).not.toContain('will not be saved');
    document.body.innerHTML = '';
    const s = new Store(new MemoryStorage());
    Object.defineProperty(s, 'persistent', { value: false });
    const { el: el2 } = await mount('#/settings', s);
    expect(el2.querySelector('.banner')).toBeTruthy();
  });
});

describe('About', () => {
  it('shows version and build SHA and reports each update result', async () => {
    const check = vi.fn<() => Promise<'up-to-date' | 'failed'>>().mockResolvedValue('up-to-date');
    const el = document.createElement('div');
    document.body.appendChild(el);
    await act(() => {
      render(<About check={check} />, el);
    });
    expect(el.querySelector('[data-testid="build-sha"]')!.textContent).toBe('test');
    expect(el.querySelector('[data-testid="version"]')!.textContent).toBe('test');
    await act(() => btn(el, 'Check for updates').click());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(check).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role="status"]')!.textContent).toContain('latest');
    check.mockResolvedValue('failed');
    await act(() => btn(el, 'Check for updates').click());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Could not');
  });
});

describe('Drill', () => {
  const spot = (street: 'preflop' | 'flop' | 'river', code: string): DrillSpot => {
    const [a, b, ...rest] = parseCards(street === 'preflop' ? 'As Kd' : 'As Kd 2c 7h 9s 3d Jc');
    return {
      code,
      street,
      hole: [a!, b!],
      board: street === 'preflop' ? [] : street === 'flop' ? rest.slice(0, 3) : rest.slice(0, 5),
      category: 'pre-premium',
    };
  };
  const frac = (n: number) => ({ num: BigInt(n), den: 100n });
  const preview = (bestIdx: 0 | 1): DecisionPreview =>
    ({
      street: 'flop',
      bestIndex: bestIdx,
      handClass: 'AKo',
      options: [
        {
          action: { type: 'play', multiple: 2 },
          label: 'Bet 2x',
          ev: frac(5),
          regret: frac(bestIdx === 0 ? 0 : 30),
          tier: bestIdx === 0 ? 'best' : 'costly',
        },
        {
          action: { type: 'check' },
          label: 'Check',
          ev: frac(-5),
          regret: frac(bestIdx === 1 ? 0 : 10),
          tier: bestIdx === 1 ? 'best' : 'close',
        },
      ],
    }) as unknown as DecisionPreview;

  function setup(bestIdx: 0 | 1, deps?: Partial<DrillDeps>) {
    const d: DrillDeps = {
      nextSpot: (rng) => [spot('flop', 'f:x'), rng],
      preview: () => Promise.resolve(preview(bestIdx)),
      ...deps,
    };
    const store = new Store(new MemoryStorage());
    return { store, d };
  }
  async function mountDrill(store: Store, d: DrillDeps, q = '') {
    const el = document.createElement('div');
    document.body.appendChild(el);
    await act(() => {
      render(
        <AppProviders content={content} store={store}>
          <Drill query={new URLSearchParams(q)} deps={d} />
        </AppProviders>,
        el,
      );
    });
    return el;
  }
  const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

  it('deals a spot with the D31 labels for its street', async () => {
    const { store, d } = setup(0);
    const el = await mountDrill(store, d);
    const labels = [...el.querySelectorAll('.choice-row button')].map((b) => b.textContent);
    expect(labels).toEqual(['Bet 2x', 'Check']);
    expect(el.querySelectorAll('[data-testid="drill-spot"] .cards').length).toBe(2);
  });
  it('river and preflop use their own choices; never "Raise"', async () => {
    for (const [street, want] of [
      ['river', ['Bet 1x', 'Fold']],
      ['preflop', ['Bet 4x', 'Bet 3x', 'Check']],
    ] as const) {
      document.body.innerHTML = '';
      const { store, d } = setup(0, { nextSpot: (r) => [spot(street, 'x'), r] });
      const el = await mountDrill(store, d);
      expect([...el.querySelectorAll('.choice-row button')].map((b) => b.textContent)).toEqual(
        want,
      );
      expect(el.textContent).not.toMatch(/Raise/);
    }
  });
  it('correct answer: grades best, shows chart and play links, bumps the streak', async () => {
    const { store, d } = setup(0);
    const el = await mountDrill(store, d);
    await act(() => btn(el, 'Bet 2x').click());
    await tick();
    const res = el.querySelector('[data-testid="drill-result"]')!;
    expect(res.getAttribute('data-tier')).toBe('best');
    expect(btn(res as HTMLElement, 'See the chart').getAttribute('href')).toBe(
      '#/strategy?highlight=AKo',
    );
    expect(btn(res as HTMLElement, 'Play it out').getAttribute('href')).toMatch(
      /^#\/play\?hole=AsKd&board=/,
    );
    expect(store.drill.byStreet.flop).toEqual({ answered: 1, correct: 1 });
    expect(el.querySelector('[data-testid="streak"]')!.textContent).toBe('1');
    expect(
      [...el.querySelectorAll('.choice-row button')].every(
        (b) => (b as HTMLButtonElement).disabled,
      ),
    ).toBe(true);
  });
  it('close counts as correct, costly does not, and misses are remembered (D33)', async () => {
    const { store, d } = setup(1); // best = Check; Bet 2x is "costly"
    const el = await mountDrill(store, d);
    await act(() => btn(el, 'Bet 2x').click());
    await tick();
    expect(el.querySelector('[data-testid="drill-result"]')!.getAttribute('data-tier')).toBe(
      'costly',
    );
    expect(store.drill.recentMisses).toEqual(['f:x']);
    expect(store.drill.bestStreak).toBe(0);
    await act(() => btn(el, 'Next hand').click());
    expect(el.querySelector('[data-testid="drill-result"]')).toBeNull();
    expect(btn(el, /Review misses/)).toBeTruthy();
  });
  it('shows the shell with a clear message while the strategy engine is a stub', async () => {
    const { store, d } = setup(0, {
      nextSpot: () => {
        throw new Error('not implemented');
      },
    });
    const el = await mountDrill(store, d);
    expect(el.querySelector('[data-testid="drill-unavailable"]')).toBeTruthy();
    expect(el.querySelectorAll('.segmented .seg').length).toBe(4);
    expect(el.querySelector('[data-testid="drill-stats"]')).toBeTruthy();
  });
  it('street filter is read from the query', async () => {
    const nextSpot = vi.fn<DrillDeps['nextSpot']>((r) => [spot('river', 'r:1'), r]);
    const { store, d } = setup(0, { nextSpot });
    await mountDrill(store, d, 'street=river&focus=a,b');
    expect(nextSpot.mock.calls[0]![1]).toEqual({ street: 'river', focus: ['a', 'b'] });
  });
  it('a failed preview offers a retry without recording an answer', async () => {
    const { store, d } = setup(0, { preview: () => Promise.reject(new Error('x')) });
    const el = await mountDrill(store, d);
    await act(() => btn(el, 'Check').click());
    await tick();
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
    expect(store.drill.byStreet.flop.answered).toBe(0);
  });
});
