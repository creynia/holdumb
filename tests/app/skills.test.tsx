// I069: Learn's "Your skills" card, from the last 20 Drill answers in each skill's categories.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../../src/app/context';
import { Learn } from '../../src/app/screens/Learn';
import { MIN_SKILL_ANSWERS, skillRow } from '../../src/app/skills';
import { MemoryStorage, emptyDrill, sanitize, MAX_RECENT_ANSWERS } from '../../src/app/storage';
import type { LensStats } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import { buildContent } from '../../src/content/load';
import type { Skill } from '../../src/content/types';
import { DRILL_CATEGORY_IDS } from '../../src/sim/strategy';

const real = buildContent(process.cwd());
const FLOP = real.skills.find((s) => s.id === 'flop')!;
const RIVER = real.skills.find((s) => s.id === 'river')!;
const PRE = real.skills.find((s) => s.id === 'preflop')!;

/** A lens record whose log is `n` answers in `cat`, the first `ok` of them correct, oldest first. */
const stats = (log: [string, boolean][]): LensStats => {
  const d: LensStats = { ...emptyDrill() };
  d.recent = log.map(([c, ok]) => `${c}:${ok ? 1 : 0}`);
  for (const [c, ok] of log) {
    const cur = d.byCategory[c as keyof LensStats['byCategory']] ?? { answered: 0, correct: 0 };
    d.byCategory[c as keyof LensStats['byCategory']] = {
      answered: cur.answered + 1,
      correct: cur.correct + (ok ? 1 : 0),
    };
  }
  return d;
};
const rep = (cat: string, n: number, ok: boolean): [string, boolean][] =>
  Array.from({ length: n }, () => [cat, ok]);

describe('skills content', () => {
  it('covers every Drill category exactly once, with real lessons', () => {
    const cats = real.skills.flatMap((s) => s.categories);
    expect([...cats].sort()).toEqual([...DRILL_CATEGORY_IDS].sort());
    const lessons = new Set(real.lessons.map((l) => l.id));
    for (const s of real.skills) expect(lessons.has(s.lessonId), s.id).toBe(true);
  });
});

describe('skillRow', () => {
  it('Not started below 5 answers: no accuracy, nothing claimed', () => {
    const r = skillRow(FLOP, stats(rep('flop-nothing', MIN_SKILL_ANSWERS - 1, true)));
    expect(r.status).toBe('not-started');
    expect(r.accuracy).toBeNull();
    expect(r.answers).toBe(4);
    expect(skillRow(FLOP, stats(rep('flop-nothing', MIN_SKILL_ANSWERS, true))).status).toBe(
      'solid',
    );
  });
  it('Practising below 80%, Solid at 80% and over', () => {
    expect(
      skillRow(FLOP, stats([...rep('flop-nothing', 15, true), ...rep('flop-nothing', 5, false)]))
        .status,
    ).toBe('practising'); // 75%
    const eighty = skillRow(
      FLOP,
      stats([...rep('flop-nothing', 16, true), ...rep('flop-nothing', 4, false)]),
    );
    expect(eighty.status).toBe('solid');
    expect(eighty.accuracy).toBe(0.8);
  });
  it('uses only the last 20 answers in the skill, and ignores other skills', () => {
    const log: [string, boolean][] = [
      ...rep('flop-nothing', 10, false), // old misses fall out of the window
      ...rep('river-outs-edge', 30, false), // another skill
      ...rep('flop-board-pair', 20, true),
    ];
    const r = skillRow(FLOP, stats(log));
    expect(r.answers).toBe(20);
    expect(r.accuracy).toBe(1);
    expect(r.status).toBe('solid');
    expect(skillRow(RIVER, stats(log)).status).toBe('practising');
  });
  it('a record from before answers were logged falls back to its category totals', () => {
    const d: LensStats = { ...emptyDrill() };
    d.byCategory['pre-ace'] = { answered: 10, correct: 4 };
    const r = skillRow(PRE, d);
    expect(r.answers).toBe(10);
    expect(r.accuracy).toBe(0.4);
    expect(r.status).toBe('practising');
  });
  it('points Drill at the weakest category', () => {
    const log: [string, boolean][] = [
      ...rep('pre-ace', 6, true),
      ...rep('pre-king', 6, false),
      ...rep('pre-low', 2, true),
    ];
    expect(skillRow(PRE, stats(log)).drillCategory).toBe('pre-king');
    expect(skillRow(PRE, emptyDrill()).drillCategory).toBe(PRE.categories[0]);
  });
});

describe('Learn: Your skills', () => {
  const skills: Skill[] = [PRE, FLOP, RIVER];
  async function mountLearn(answers: [string, boolean][]) {
    const store = new Store(new MemoryStorage());
    for (const [cat, ok] of answers)
      store.recordDrill(
        cat.startsWith('pre') ? 'preflop' : cat.startsWith('flop') ? 'flop' : 'river',
        ok,
        undefined,
        cat as never,
      );
    const el = document.createElement('div');
    document.body.appendChild(el);
    await act(() => {
      render(
        <AppProviders content={{ ...real, skills }} store={store}>
          <Learn />
        </AppProviders>,
        el,
      );
    });
    return el;
  }
  const row = (el: HTMLElement, id: string) =>
    el.querySelector<HTMLElement>(`[data-skill="${id}"]`)!;

  it('shows all three statuses as words, with the right links', async () => {
    const el = await mountLearn([
      ...rep('pre-ace', 2, true), // Not started (2 answers)
      ...rep('flop-nothing', 6, true),
      ...rep('flop-board-pair', 6, false), // 50%: Practising
      ...rep('river-outs-edge', 10, true), // Solid
    ]);
    expect(row(el, 'preflop').textContent).toContain('Not started');
    expect(row(el, 'preflop').textContent).toContain('2 of 5 answers so far');
    expect(row(el, 'flop').textContent).toContain('Practising');
    expect(row(el, 'flop').textContent).toContain('50% of your last 12');
    expect(row(el, 'river').textContent).toContain('Solid');
    // a skill under 80% links to its lesson and to the weakest category in Drill
    const flopLinks = [...row(el, 'flop').querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(flopLinks).toEqual(['#/learn/flop-raise', '#/drill?category=flop-board-pair']);
    // Not started: Drill only; Solid: no links
    expect(
      [...row(el, 'preflop').querySelectorAll('a')].map((a) => a.getAttribute('href')),
    ).toEqual(['#/drill?category=pre-ace']);
    expect(row(el, 'river').querySelectorAll('a')).toHaveLength(0);
  });
  it('speaks plainly: a guide to practise, no prediction or points', async () => {
    const el = await mountLearn([]);
    const text = el.querySelector('[data-testid="skills"]')!.textContent;
    expect(text).toMatch(/not a score/);
    expect(text).not.toMatch(/win|beat the house|points|level|streak/i);
  });
  it('is absent when the content has no skills', async () => {
    const store = new Store(new MemoryStorage());
    const el = document.createElement('div');
    document.body.appendChild(el);
    await act(() => {
      render(
        <AppProviders content={{ ...real, skills: [] }} store={store}>
          <Learn />
        </AppProviders>,
        el,
      );
    });
    expect(el.querySelector('[data-testid="skills"]')).toBeNull();
  });
});

describe('Drill answer log: sanitize', () => {
  it('keeps the newest 200 of 250 valid entries, oldest first', () => {
    const log = Array.from({ length: 250 }, (_, i) => `flop-nothing:${i % 2}`);
    // make the position visible: entry i in the newest 200 is index i + 50
    log[49] = 'pre-ace:1';
    log[50] = 'pre-king:0';
    log[249] = 'river-outs-low:1';
    const p = sanitize({ version: 1, drill: { recent: log } })!;
    expect(p.drill.recent).toHaveLength(MAX_RECENT_ANSWERS);
    expect(p.drill.recent[0]).toBe('pre-king:0'); // index 49 was cut, 50 is the oldest kept
    expect(p.drill.recent[199]).toBe('river-outs-low:1'); // the newest is kept
    expect(p.drill.recent).toEqual(log.slice(50));
  });
  it('round-trips through the stored JSON, for both lenses', () => {
    const d = { ...emptyDrill(), recent: ['pre-ace:1', 'flop-nothing:0'] };
    d.practical = { ...emptyDrill(), recent: ['river-outs-edge:1'] };
    const back = sanitize(JSON.parse(JSON.stringify({ version: 1, drill: d })))!;
    expect(back.drill.recent).toEqual(['pre-ace:1', 'flop-nothing:0']);
    expect(back.drill.practical.recent).toEqual(['river-outs-edge:1']);
  });
});

describe('Drill answer log (storage)', () => {
  it('recordDrill appends `<category>:<0|1>`, capped, and it persists', () => {
    const m = new MemoryStorage();
    const store = new Store(m);
    for (let i = 0; i < MAX_RECENT_ANSWERS + 5; i++)
      store.recordDrill('flop', i % 2 === 0, undefined, 'flop-nothing');
    store.recordDrill('river', false, undefined, 'river-outs-low');
    store.flush();
    const back = new Store(m).drill.recent;
    expect(back).toHaveLength(MAX_RECENT_ANSWERS);
    expect(back[back.length - 1]).toBe('river-outs-low:0');
    expect(back[back.length - 2]).toBe('flop-nothing:1'); // the last flop answer, i = 204, is even
  });
  it('drops malformed entries and unknown categories on load', () => {
    const p = sanitize({
      version: 1,
      drill: {
        recent: ['flop-nothing:1', 'flop-nothing:2', 'nope:1', 5, 'pre-ace:0', '__proto__:1'],
      },
    })!;
    expect(p.drill.recent).toEqual(['flop-nothing:1', 'pre-ace:0']);
  });
});
