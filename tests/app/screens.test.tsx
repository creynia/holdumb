import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContent } from '../../src/content/load';
import { parseCards } from '../../src/sim/engine';
import { formatMoney } from '../../src/sim';
import type { DecisionPreview, DrillSpot } from '../../src/sim';
import { App } from '../../src/app/App';
import { preloadRoutes } from '../../src/app/lazy';
import { AppProviders } from '../../src/app/context';
import {
  DRILL_CATEGORY_IDS,
  gradeSpot as realGradeSpot,
  nextSpot as realNextSpot,
} from '../../src/sim';
import { spotFromCode } from '../../src/sim';
import { createEvClient } from '../../src/sim/worker';
import { waitFor } from '@testing-library/preact';
import { weakestCategory } from '../../src/app/drillCategories';
import { Drill, rngFromSeed, type DrillDeps } from '../../src/app/screens/Drill';
import { About } from '../../src/app/screens/About';
import { MemoryStorage } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import {
  flushAnnouncements,
  resetAnnouncer,
  subscribeAnnouncements,
} from '../../src/sim/ui/announcer';

/** The `_sample-*` fixtures in tests/fixtures/content, so real lessons can never break these tests. */
function fixtureContent() {
  const root = mkdtempSync(join(tmpdir(), 'holdumb-fixture-'));
  const src = join(process.cwd(), 'tests', 'fixtures', 'content');
  mkdirSync(join(root, 'content', 'lessons'), { recursive: true });
  for (const sub of ['', 'lessons'])
    for (const f of readdirSync(join(src, sub)).filter((n) => n.startsWith('_sample-')))
      cpSync(join(src, sub, f), join(root, 'content', sub, f));
  return buildContent(root);
}
const content = fixtureContent();

async function mount(hash: string, store = new Store(new MemoryStorage())) {
  location.hash = hash;
  const el = document.createElement('div');
  document.body.appendChild(el);
  await preloadRoutes(false);
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
  resetAnnouncer();
});
/** What the single announcer would speak now. */
function heard(): string[] {
  const out: string[] = [];
  const off = subscribeAnnouncements((_p, t) => out.push(t));
  flushAnnouncements();
  off();
  return out;
}

describe('error boundary', () => {
  /** A store whose sandbox snapshot is corrupt: /play throws while rendering, until it is reset. */
  class BrokenSandboxStore extends Store {
    broken = true;
    override get sandbox(): unknown {
      if (this.broken) throw new Error('corrupt sandbox');
      return undefined;
    }
    override setSandbox(snap: unknown) {
      if (snap === undefined) this.broken = false;
      super.setSandbox(snap);
    }
  }

  it('shows the fallback, keeps the tab bar alive, and Reset table remounts /play', async () => {
    const store = new BrokenSandboxStore(new MemoryStorage());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { el } = await mount('#/play', store);
    const screen = el.querySelector('[data-testid="error-screen"]');
    expect(screen?.textContent).toContain('This screen hit a problem');
    expect(el.querySelector('[data-testid="error-build-sha"]')?.textContent).toBeTruthy();
    expect(el.querySelector('[data-testid="simulator"]')).toBeNull();
    // The tab bar still renders and responds to clicks.
    expect(el.querySelectorAll('nav.tabbar a')).toHaveLength(4);
    await act(() => {
      el.querySelector<HTMLElement>('nav.tabbar a[href="#/learn"]')!.click();
    });
    await waitFor(() => expect(location.hash).toBe('#/learn'));
    await waitFor(() => expect(el.querySelector('[data-testid="error-screen"]')).toBeNull());
    // Back on /play it fails again; Reset table clears the snapshot and remounts the table.
    await act(() => {
      location.hash = '#/play';
    });
    await waitFor(() => expect(el.querySelector('[data-testid="error-screen"]')).not.toBeNull());
    store.setSandbox({ stale: true });
    store.broken = true;
    await act(() => {
      btn(el, 'Reset table').click();
    });
    expect(store.broken).toBe(false);
    expect(store.sandbox).toBeUndefined();
    expect(el.querySelector('[data-testid="error-screen"]')).toBeNull();
    expect(el.querySelector('nav.tabbar')).not.toBeNull();
  });

  it('offers Reset table only on /play; elsewhere it is Reload only and nothing is wiped', async () => {
    class BrokenStatusStore extends Store {
      override status(): ReturnType<Store['status']> {
        throw new Error('broken learn');
      }
    }
    const store = new BrokenStatusStore(new MemoryStorage());
    store.setSandbox({ keep: 'me' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { el } = await mount('#/learn', store);
    expect(el.querySelector('[data-testid="error-screen"]')).not.toBeNull();
    expect(btn(el, 'Reload')).toBeTruthy();
    expect(btn(el, 'Reset table')).toBeUndefined();
    expect(store.sandbox).toEqual({ keep: 'me' });
  });

  it('ignores the harmless ResizeObserver error', async () => {
    const { el } = await mount('#/more');
    await act(() => {
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'ResizeObserver loop completed with undelivered notifications.',
        }),
      );
    });
    expect(el.querySelector('[data-testid="error-toast"]')).toBeNull();
  });

  it('shows one top-bar notice at a time: the update toast wins over the error toast', async () => {
    const { simulateUpdateAvailable } = await import('../../src/pwa/register');
    const { el } = await mount('#/more');
    await act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    });
    expect(el.querySelector('[data-testid="error-toast"]')).not.toBeNull();
    await act(() => simulateUpdateAvailable());
    expect(el.querySelector('.pwa-toast')).not.toBeNull();
    expect(el.querySelector('[data-testid="error-toast"]')).toBeNull();
  });

  it('shows a toast for an uncaught window error', async () => {
    const { el } = await mount('#/more');
    expect(el.querySelector('[data-testid="error-toast"]')).toBeNull();
    await act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    });
    expect(el.querySelector('[data-testid="error-toast"]')?.textContent).toContain('went wrong');
  });
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
    for (const h of [
      '#/strategy',
      '#/hands',
      '#/bets',
      '#/settings',
      '#/about',
      '#/glossary',
      '#/sources',
    ]) {
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
    '#/sources',
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
    // The verdict and the explanation are both spoken, exactly as shown (I036).
    const spokenQuiz = heard();
    expect(spokenQuiz).toHaveLength(1);
    expect(spokenQuiz[0]).toBe(
      el
        .querySelector('.quiz-result')!
        .textContent.replace(/\s+/g, ' ')
        .trim()
        .replace(/ Try again$/, ''),
    );
    expect(spokenQuiz[0]).toContain('Not quite.');
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
    expect(hrefs).toEqual(
      expect.arrayContaining(['#/hands', '#/bets', '#/sources', '#/settings', '#/about']),
    );
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
    const legends = [...el.querySelectorAll('fieldset > legend')].map((l) => l.textContent);
    expect(legends).toEqual(['Show EV', 'Which bets']);
    const radios = (name: string) => [
      ...el.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`),
    ];
    const labelOf = (r: HTMLInputElement) => r.closest('label')!.textContent;
    expect(radios('ev-mode').map(labelOf)).toEqual([
      expect.stringContaining('Before I choose'),
      expect.stringContaining('After I choose'),
      expect.stringContaining('Off'),
    ]);
    expect(radios('confirm-tiers').map(labelOf)).toEqual([
      expect.stringContaining('All bets'),
      expect.stringContaining('Medium and bad bets'),
      expect.stringContaining('Only bad bets'),
    ]);
    expect(labelOf(radios('confirm-tiers')[1]!)).toContain('more than 0.10 Ante');
    // Defaults: EV before, no confirm step.
    expect(radios('ev-mode').find((r) => r.checked)!.value).toBe('before');
    expect(store.settings.confirmOn).toBe('never');
    expect(radios('confirm-tiers').find((r) => r.checked)!.value).toBe('all');
    await act(() => {
      radios('ev-mode')[2]!.click();
    });
    expect(store.settings.evMode).toBe('never');
    // Confirm my bets (D40): tick it, then pick the medium scope.
    await act(() => {
      el.querySelector<HTMLInputElement>('input[aria-describedby="confirm-bets-hint"]')!.click();
    });
    await act(() => {
      radios('confirm-tiers')[1]!.click();
    });
    expect(store.settings.confirmOn).toBe('costly');
    expect(store.settings.confirmTiers).toBe('costly');
    expect(radios('confirm-tiers').find((r) => r.checked)!.value).toBe('costly');
    // The confirm box, reduce motion, four-colour and Sounds remain; the old three checkboxes are gone.
    const boxes = [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map(labelOf)).toEqual([
      expect.stringContaining('Confirm my bets'),
      expect.stringContaining('Reduce motion'),
      expect.stringContaining('Four-colour deck'),
      expect.stringContaining('Sounds'),
    ]);
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
    expect(el.querySelector('[data-testid="settings-msg"]')?.textContent).toContain('not valid');
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

describe('Settings: Sounds (I027)', () => {
  it('is off by default and a tick turns it on', async () => {
    const { el, store } = await mount('#/settings');
    expect(store.settings.sounds).toBe(false);
    const box = [...el.querySelectorAll<HTMLInputElement>('label.check input')].find((i) =>
      i.closest('label')!.textContent.startsWith('Sounds'),
    )!;
    expect(box.checked).toBe(false);
    await act(() => box.click());
    expect(store.settings.sounds).toBe(true);
    await act(() => box.click());
    expect(store.settings.sounds).toBe(false);
  });
});

describe('Settings bounds and flushing', () => {
  const field = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.startsWith(label))!
      .querySelector('input')!;
  const type = (i: HTMLInputElement, v: string) =>
    act(() => {
      i.value = v;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
  it('clamps on commit, re-syncs rejected input, and sets min/max attributes', async () => {
    const { el, store } = await mount('#/settings');
    const ante = field(el, 'Ante unit');
    expect([ante.min, ante.max]).toEqual(['1', '500']);
    expect(field(el, 'Hands per hour').max).toBe('500');
    expect(field(el, 'Default bankroll').max).toBe('1000000');
    await type(ante, '9999');
    expect(store.settings.anteUnitCents).toBe(50_000);
    expect(ante.value).toBe('500');
    await type(ante, '');
    expect(store.settings.anteUnitCents).toBe(50_000);
    expect(ante.value).toBe('500');
    await type(field(el, 'Hands per hour'), '0');
    expect(store.settings.handsPerHour).toBe(1);
  });
  it('flushes when the page becomes hidden', async () => {
    const { store } = await mount('#/settings');
    const flush = vi.spyOn(store, 'flush');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  it('shows the banner when a save is refused', async () => {
    const m = new MemoryStorage();
    const { el, store } = await mount('#/learn', new Store(m));
    m.setItem = () => {
      throw new Error('quota');
    };
    expect(el.querySelector('.banner')).toBeNull();
    await act(() => {
      store.completeLesson('x');
      store.flush();
    });
    expect(el.querySelector('.banner')).toBeTruthy();
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
    expect(el.querySelector('[data-testid="update-status"]')!.textContent).toContain('latest');
    check.mockResolvedValue('failed');
    await act(() => btn(el, 'Check for updates').click());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(el.querySelector('[data-testid="update-status"]')!.textContent).toContain('Could not');
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
      options: [
        {
          action: { type: 'play', multiple: 2 },
          label: 'Bet 2x',
          ev: frac(5),
          evCents: frac(5000),
          assumesBestLater: false,
          why: { rows: [], casesLabel: 'deals', formula: '' },
          regret: frac(bestIdx === 0 ? 0 : 30),
          tier: bestIdx === 0 ? 'best' : 'costly',
        },
        {
          action: { type: 'check' },
          label: 'Check',
          ev: frac(-5),
          evCents: frac(-5000),
          assumesBestLater: false,
          why: { rows: [], casesLabel: 'deals', formula: '' },
          regret: frac(bestIdx === 1 ? 0 : 10),
          tier: bestIdx === 1 ? 'best' : 'close',
        },
      ],
    }) as unknown as DecisionPreview;

  function setup(bestIdx: 0 | 1, deps?: Partial<DrillDeps>) {
    const d: DrillDeps = {
      nextSpot: (rng) => [spot('flop', 'f:x'), rng],
      gradeSpot: realGradeSpot,
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

  it('deals a spot with the D31 labels in the table slot order (I012)', async () => {
    const { store, d } = setup(0);
    const el = await mountDrill(store, d);
    const labels = [...el.querySelectorAll('.choice-row button')].map((b) => b.textContent);
    expect(labels).toEqual(['Check', 'Bet 2x']);
    expect(el.querySelectorAll('[data-testid="drill-spot"] .cards').length).toBe(2);
  });
  it('river and preflop use their own choices; never "Raise"', async () => {
    for (const [street, want] of [
      ['river', ['Fold', 'Bet 1x']],
      ['preflop', ['Check', 'Bet 3x', 'Bet 4x']],
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
      '#/strategy?view=flop',
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
  const ACTIONS = {
    preflop: [{ type: 'play', multiple: 4 }, { type: 'play', multiple: 3 }, { type: 'check' }],
    flop: [{ type: 'play', multiple: 2 }, { type: 'check' }],
    river: [{ type: 'play', multiple: 1 }, { type: 'fold' }],
  } as unknown as Record<
    'preflop' | 'flop' | 'river',
    DecisionPreview['options'][number]['action'][]
  >;
  it('See the chart: preflop highlights the hand, flop and river open their own view', async () => {
    for (const [street, handClass, want] of [
      ['preflop', 'AKs', '#/strategy?highlight=AKs'],
      ['flop', undefined, '#/strategy?view=flop'],
      ['river', undefined, '#/strategy?view=river'],
    ] as const) {
      document.body.innerHTML = '';
      const { store, d } = setup(0, {
        nextSpot: (r) => [spot(street, 'x'), r],
        preview: () =>
          Promise.resolve({
            ...preview(0),
            street,
            handClass,
            options: ACTIONS[street].map((action) => ({ ...preview(0).options[0]!, action })),
          } as unknown as DecisionPreview),
      });
      const el = await mountDrill(store, d);
      await act(() => (el.querySelector('.choice-row button') as HTMLButtonElement).click());
      await tick();
      const res = el.querySelector('[data-testid="drill-result"]') as HTMLElement;
      expect(btn(res, 'See the chart').getAttribute('href'), street).toBe(want);
    }
  });
  it('Strategy: view=river scrolls the river section into view, unknown views do nothing', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const { el } = await mount('#/strategy?view=river');
    const sec = el.querySelector('[data-view="river"]') as HTMLElement;
    expect(spy.mock.contexts[0]).toBe(sec);
    spy.mockClear();
    document.body.innerHTML = '';
    await mount('#/strategy?view=bogus');
    expect(spy).not.toHaveBeenCalled();
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
    expect(el.querySelectorAll('[aria-label="Street"] .seg').length).toBe(4);
    expect(el.querySelector('[data-testid="drill-stats"]')).toBeTruthy();
  });
  it('street filter is read from the query', async () => {
    const nextSpot = vi.fn<DrillDeps['nextSpot']>((r) => [spot('river', 'r:1'), r]);
    const { store, d } = setup(0, { nextSpot });
    await mountDrill(store, d, 'street=river&focus=a,b');
    expect(nextSpot.mock.calls[0]![1]).toEqual({
      street: 'river',
      focus: ['a', 'b'],
      interesting: true,
    });
  });
  describe('grading lens', () => {
    // Bet 2x is perfect-best by 0.300 antes over Check, which is what the basic card plays here.
    const differing = (): DecisionPreview => {
      const p = preview(0);
      p.options[1]!.regret = frac(30);
      p.options[1]!.tier = 'costly';
      return p;
    };
    const btnIn = (el: HTMLElement, group: string, name: string) =>
      [...el.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] button`)].find(
        (b) => b.textContent === name,
      )!;

    it('defaults to perfect: the basic card play is a Mistake', async () => {
      const { store, d } = setup(0, { preview: () => Promise.resolve(differing()) });
      const el = await mountDrill(store, d);
      expect(store.drill.lens).toBe('perfect');
      await act(() => btn(el, 'Check').click());
      await tick();
      expect(el.querySelector('[data-testid="drill-result"]')!.getAttribute('data-tier')).toBe(
        'costly',
      );
    });
    it('practical: the basic card play is Correct! and names perfect play and its regret', async () => {
      const { store, d } = setup(0, { preview: () => Promise.resolve(differing()) });
      const el = await mountDrill(store, d);
      await act(() => btnIn(el, 'Grade by', 'Basic card').click());
      expect(store.drill.lens).toBe('practical');
      await act(() => btn(el, 'Check').click());
      await tick();
      const res = el.querySelector('[data-testid="drill-result"]')!;
      expect(res.getAttribute('data-tier')).toBe('best');
      // Spoken in full: the verdict, the better play and by how much (I036).
      const spokenGrade = heard();
      expect(spokenGrade).toHaveLength(1);
      expect(spokenGrade[0]).toContain('Perfect play says Bet 2x here, by 0.300 antes');
      expect(res.querySelector('[data-testid="drill-headline"]')!.textContent).toMatch(
        /^Correct! Check is the card's play\. Perfect play says Bet 2x here, by 0\.300 antes \(\$[\d.,]+ per hand\)\. The card's rule is still the one to remember\.$/,
      );
      expect(store.drill.practical.byStreet.flop).toEqual({ answered: 1, correct: 1 });
      expect(store.drill.byStreet.flop).toEqual({ answered: 0, correct: 0 });
    });
    describe('pinned spot f:2dJd.4h6d9d (flush draw: the card bets 2x, perfect checks)', () => {
      // The real engine: Check 26929/142692 is best; Bet 2x 273331/2140380 costs 0.061 antes.
      const run = async (choice: string) => {
        const ev = createEvClient({ mode: 'inthread' });
        const spot = spotFromCode('f:2dJd.4h6d9d');
        const { store, d } = setup(1, {
          nextSpot: (r) => [spot, r],
          preview: (req) => ev.run('preview', req),
        });
        const el = await mountDrill(store, d);
        await act(() => btnIn(el, 'Grade by', 'Basic card').click());
        await act(() => btn(el, choice).click());
        await waitFor(() => expect(el.querySelector('[data-testid="drill-result"]')).toBeTruthy(), {
          timeout: 60_000,
        });
        ev.dispose();
        return el.querySelector('[data-testid="drill-result"] [data-testid="drill-headline"]')!
          .textContent;
      };
      it("choosing the card's action names perfect play, exactly", async () => {
        expect(await run('Bet 2x')).toBe(
          "Correct! Bet 2x is the card's play. Perfect play says Check here, by 0.061 antes ($0.61 per hand). The card's rule is still the one to remember.",
        );
      }, 90_000);
      it('choosing the perfect action does not claim it is the card play', async () => {
        expect(await run('Check')).toBe(
          'Correct! Check is the best play (the card says Bet 2x here).',
        );
      }, 90_000);
    });
    it('lenses never mix: categories, misses, streaks and the weakest line are per lens', () => {
      const store = new Store(new MemoryStorage());
      store.setDrillLens('practical');
      for (let i = 0; i < 5; i++) store.recordDrill('flop', false, `f:${i}`, 'flop-flush-draw');
      expect(store.drill.practical.byCategory['flop-flush-draw']).toEqual({
        answered: 5,
        correct: 0,
      });
      expect(store.drill.practical.recentMisses).toHaveLength(5);
      expect(store.drill.byCategory).toEqual({});
      expect(store.drill.recentMisses).toEqual([]);
      expect(weakestCategory(store.drill)?.id).toBe('flop-flush-draw');
      store.setDrillLens('perfect');
      expect(weakestCategory(store.drill)).toBeNull();
      store.recordDrill('flop', true, 'f:9', 'flop-flush-draw');
      expect(store.drillStreak).toBe(1);
      store.setDrillLens('practical');
      expect(store.drillStreak).toBe(0);
      expect(store.drill.bestStreak).toBe(1);
      expect(store.drill.practical.bestStreak).toBe(0);
    });
    it('the lens persists in the store and survives a reload', () => {
      const mem = new MemoryStorage();
      const a = new Store(mem);
      a.setDrillLens('practical');
      a.flush();
      expect(new Store(mem).drill.lens).toBe('practical');
    });
  });
  it("?category= restricts the filter and lists only that street's categories", async () => {
    const nextSpot = vi.fn<DrillDeps['nextSpot']>((r) => [spot('flop', 'f:1'), r]);
    const { store, d } = setup(0, { nextSpot });
    const el = await mountDrill(store, d, 'category=flop-flush-draw');
    expect(nextSpot.mock.calls[0]![1]).toEqual({
      street: 'flop',
      category: 'flop-flush-draw',
      interesting: true,
    });
    const sel = el.querySelector<HTMLSelectElement>('[data-testid="drill-categories"]')!;
    const opts = [...sel.options];
    expect(opts.map((o) => o.textContent)).toEqual([
      'All',
      'Flop hidden pairs',
      'Flop two pair or better',
      'Flop board pairs',
      'Flop flush draws',
      'Flop straight draws',
      'Flop nothing',
      'Flop pocket deuces',
    ]);
    expect(sel.value).toBe('flop-flush-draw');
  });
  it('a category from another street than ?street= is ignored; unknown ids too', async () => {
    const nextSpot = vi.fn<DrillDeps['nextSpot']>((r) => [spot('river', 'r:1'), r]);
    const { store, d } = setup(0, { nextSpot });
    await mountDrill(store, d, 'street=river&category=flop-flush-draw');
    await mountDrill(store, d, 'street=river&category=nope');
    expect(nextSpot.mock.calls.map((c) => c[1])).toEqual([
      { street: 'river', interesting: true },
      { street: 'river', interesting: true },
    ]);
  });
  it('seeded: the same seed through deps deals the same category-only spots', async () => {
    const seen: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const codes: string[] = [];
      const { store, d } = setup(0, {
        seed: 42,
        nextSpot: (r, f) => {
          const out = realNextSpot(r, f);
          codes.push(out[0].code);
          expect(out[0].category).toBe('flop-flush-draw');
          return out;
        },
      });
      const el = await mountDrill(store, d, 'category=flop-flush-draw');
      for (let i = 0; i < 3; i++) {
        await act(() => btn(el, 'Check').click());
        await tick();
        await act(() => btn(el, 'Next hand').click());
      }
      seen.push(codes);
    }
    expect(seen[0]!.length).toBe(4);
    expect(seen[1]).toEqual(seen[0]);
  });
  it('20 seeded draws from every category all carry that category', () => {
    for (const category of DRILL_CATEGORY_IDS) {
      let r = rngFromSeed(2024);
      for (let i = 0; i < 20; i++) {
        const [sp, next] = realNextSpot(r, { street: 'mixed', category });
        r = next;
        expect(sp.category).toBe(category);
      }
    }
  });
  it('shows the weakest category once it has 5 answers', async () => {
    const { store, d } = setup(0);
    const el = await mountDrill(store, d);
    expect(el.querySelector('[data-testid="drill-weakest"]')).toBeNull();
    for (let i = 0; i < 4; i++) store.recordDrill('flop', i < 2, undefined, 'flop-flush-draw');
    await act(() => store.recordDrill('flop', false, undefined, 'flop-flush-draw'));
    expect(el.querySelector('[data-testid="drill-weakest"]')!.textContent).toBe(
      'Your weakest: Flop flush draws 40% (5)',
    );
  });
  it('Close calls: on by default (filter.interesting), off restores the plain filter, and persists', async () => {
    const nextSpot = vi.fn<DrillDeps['nextSpot']>((r) => [spot('flop', 'f:1'), r]);
    const mem = new MemoryStorage();
    const store = new Store(mem);
    const d: DrillDeps = { ...setup(0).d, nextSpot };
    const el = await mountDrill(store, d, 'street=flop');
    expect(nextSpot.mock.calls[0]![1]).toEqual({ street: 'flop', interesting: true });
    const box = el.querySelector<HTMLInputElement>('[data-testid="drill-close-calls"] input')!;
    expect(box.checked).toBe(true);
    await act(() => box.click());
    expect(store.drill.closeCalls).toBe(false);
    expect(nextSpot.mock.calls.at(-1)![1]).toEqual({ street: 'flop' });
    store.flush();
    expect(new Store(mem).drill.closeCalls).toBe(false);
    expect(el.textContent).toContain('close-call categories');
  });
  it('a failed preview offers a retry without recording an answer', async () => {
    const { store, d } = setup(0, { preview: () => Promise.reject(new Error('x')) });
    const el = await mountDrill(store, d);
    await act(() => btn(el, 'Check').click());
    await tick();
    expect(el.querySelector('.drill-spot .warn')?.textContent).toContain(
      'Could not work out the EV',
    );
    expect(store.drill.byStreet.flop.answered).toBe(0);
  });

  // ---- money
  it('no float arithmetic on fractions remains in Drill.tsx', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/screens/Drill.tsx'), 'utf8');
    expect(src).not.toMatch(/Number\([^)]*\.num\)|Number\([^)]*\.den\)/);
  });

  it('the per-hand cost equals the EV sheet cost to the cent over 200 seeded previews', async () => {
    // exact half-away-from-zero rounding of num/den (den > 0), independent of the app code
    const roundCents = (n: bigint, d: bigint): bigint => {
      const a = n < 0n ? -n : n;
      const q = (2n * a + d) / (2n * d);
      return n < 0n ? -q : q;
    };
    let seed = 20260703;
    const next = (m: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % m;
    };
    const fraction = () => ({ num: BigInt(next(400000) - 200000), den: BigInt(1 + next(7)) });
    const cases = 200;
    for (let i = 0; i < cases; i++) {
      const x = fraction();
      const y = fraction();
      // best is the larger EV, so the cost is non-negative
      const bestEv = roundCents(x.num, x.den) >= roundCents(y.num, y.den) ? x : y;
      const otherEv = bestEv === x ? y : x;
      const pv = {
        street: 'flop',
        bestIndex: 0,
        handClass: 'AKo',
        options: [
          {
            action: { type: 'play', multiple: 2 },
            label: 'Bet 2x',
            ev: { num: 1n, den: 1n },
            evCents: bestEv,
            assumesBestLater: false,
            why: { rows: [], casesLabel: 'deals', formula: '' },
            regret: { num: 0n, den: 1n },
            tier: 'best',
          },
          {
            action: { type: 'check' },
            label: 'Check',
            ev: { num: 1n, den: 1n },
            evCents: otherEv,
            assumesBestLater: false,
            why: { rows: [], casesLabel: 'deals', formula: '' },
            regret: { num: 1n, den: 1n },
            tier: 'costly',
          },
        ],
      } as unknown as DecisionPreview;
      const cost = Number(
        roundCents(bestEv.num, bestEv.den) - roundCents(otherEv.num, otherEv.den),
      );
      document.body.innerHTML = '';
      const store = new Store(new MemoryStorage());
      const el = await mountDrill(store, {
        nextSpot: (r) => [spot('flop', `f:${i}`), r],
        gradeSpot: realGradeSpot,
        preview: () => Promise.resolve(pv),
      });
      await act(() => btn(el, 'Check').click());
      await act(() => new Promise((r) => setTimeout(r, 0)));
      const text = el.querySelector('[data-testid="drill-result"]')!.textContent ?? '';
      expect(text, `case ${i}`).toContain(`(${formatMoney(cost)}) more on average`);
    }
  }, 120_000);
});

describe('persistent storage in the app (I076)', () => {
  const stubStorage = (api: Record<string, unknown> | undefined) => {
    Object.defineProperty(navigator, 'storage', { value: api, configurable: true });
  };
  afterEach(() => stubStorage(undefined));
  it('asks once ever: not on render, once after the first completion, never again', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persist, persisted: () => Promise.resolve(false) });
    const [first, second] = content.lessons.filter((l) => l.blocks.length > 0);
    const { el, store } = await mount(`#/learn/${first!.id}`);
    expect(persist).toHaveBeenCalledTimes(0);
    await act(() => btn(el, 'Mark complete').click());
    expect(persist).toHaveBeenCalledTimes(1);
    const { el: el2 } = await mount(`#/learn/${second!.id}`, store);
    await act(() => btn(el2, 'Mark complete').click());
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('a stored answer is not asked again after a reload', async () => {
    const persist = vi.fn(() => Promise.resolve(false));
    stubStorage({ persist, persisted: () => Promise.resolve(false) });
    const store = new Store(new MemoryStorage());
    store.updateSettings({ persistAsked: 'denied' });
    const lesson = content.lessons.find((l) => l.blocks.length > 0)!;
    const { el } = await mount(`#/learn/${lesson.id}`, store);
    await act(() => btn(el, 'Mark complete').click());
    expect(persist).toHaveBeenCalledTimes(0);
  });
  it.each([
    ['persistent', true, 'Storage: persistent'],
    ['may be cleared', false, 'Storage: may be cleared by the browser'],
  ])('Settings shows the %s state', async (_label, persisted, text) => {
    stubStorage({ persisted: () => Promise.resolve(persisted) });
    const { el } = await mount('#/settings');
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(el.querySelector('[data-testid="storage-state"]')!.textContent).toContain(text);
  });
  it('Settings shows no storage text when the API is missing', async () => {
    stubStorage(undefined);
    const { el } = await mount('#/settings');
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(el.querySelector('[data-testid="storage-state"]')!.textContent?.trim()).toBe('');
  });
});

describe('Settings: Show EV and Confirm bets (D40, I091)', () => {
  const fieldsetOf = (el: HTMLElement, legend: string) =>
    [...el.querySelectorAll('fieldset')].find(
      (f) => f.querySelector('legend')?.textContent === legend,
    ) as HTMLFieldSetElement;
  const box = (el: HTMLElement) =>
    el.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-describedby="confirm-bets-hint"]',
    )!;
  const tierRadios = (el: HTMLElement) =>
    fieldsetOf(el, 'Which bets').querySelectorAll<HTMLInputElement>('input[type="radio"]');

  it('Show EV says Off (not Never); the old confirm radios and note are gone', async () => {
    const { el } = await mount('#/settings');
    const ev = fieldsetOf(el, 'Show EV');
    expect(ev.textContent).toContain('Off');
    expect(ev.textContent).not.toContain('Never');
    expect(el.querySelector('#confirm-on-note')).toBeNull();
    expect(el.textContent).not.toContain('Ask me to confirm');
    expect(el.textContent).not.toContain('Confirm options apply when EV is shown before the move');
  });
  it('defaults: the box is unticked, Which bets is disabled, All bets is selected', async () => {
    const { el } = await mount('#/settings');
    expect(box(el).checked).toBe(false);
    expect(fieldsetOf(el, 'Which bets').disabled).toBe(true);
    expect([...tierRadios(el)].find((r) => r.checked)?.value).toBe('all');
  });
  it('ticking turns Confirm on with the stored scope and enables Which bets', async () => {
    const { el, store } = await mount('#/settings');
    await act(() => box(el).click());
    expect(store.settings.confirmOn).toBe('all');
    expect(box(el).checked).toBe(true);
    expect(fieldsetOf(el, 'Which bets').disabled).toBe(false);
  });
  it('re-ticking restores the stored scope, not All bets', async () => {
    const { el, store } = await mount('#/settings');
    await act(() => box(el).click());
    await act(() => [...tierRadios(el)].find((r) => r.value === 'blunder')!.click());
    await act(() => box(el).click());
    expect(store.settings.confirmOn).toBe('never');
    await act(() => box(el).click());
    expect(store.settings.confirmOn).toBe('blunder');
    expect(box(el).checked).toBe(true);
    expect(fieldsetOf(el, 'Which bets').disabled).toBe(false);
    expect([...tierRadios(el)].find((r) => r.checked)?.value).toBe('blunder');
  });
  it('picking a scope stores it; unticking keeps it and greys Which bets with it still shown', async () => {
    const { el, store } = await mount('#/settings');
    await act(() => box(el).click());
    const only = [...tierRadios(el)].find((r) => r.value === 'blunder')!;
    await act(() => only.click());
    expect(store.settings.confirmOn).toBe('blunder');
    expect(store.settings.confirmTiers).toBe('blunder');
    await act(() => box(el).click());
    expect(store.settings.confirmOn).toBe('never');
    expect(store.settings.confirmTiers).toBe('blunder');
    expect(fieldsetOf(el, 'Which bets').disabled).toBe(true);
    expect([...tierRadios(el)].find((r) => r.checked)?.value).toBe('blunder');
  });
});
