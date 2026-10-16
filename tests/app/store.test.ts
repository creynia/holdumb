import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage, STORAGE_KEY, load } from '../../src/app/storage';
import { Store, finalExamScore, nextLesson, overallProgress } from '../../src/app/store';
import type { ContentBundle } from '../../src/content/types';

const bundle = (ids: string[]): ContentBundle => ({
  chapters: [{ id: 'c', title: 'C', summary: '', lessons: ids }],
  lessons: ids.map((id) => ({
    id,
    title: id,
    summary: '',
    minutes: 1,
    chapterId: 'c',
    blocks: [],
  })),
  glossary: [],
  bets: {} as ContentBundle['bets'],
  hands: {} as ContentBundle['hands'],
  strategy: {} as ContentBundle['strategy'],
});

describe('Store', () => {
  it('tracks status: new -> progress -> done and back (all lessons open)', () => {
    const s = new Store(new MemoryStorage());
    expect(s.status('a')).toBe('new');
    s.start('a');
    expect(s.status('a')).toBe('progress');
    s.completeLesson('a');
    expect(s.status('a')).toBe('done');
    s.completeLesson('a', false);
    expect(s.status('a')).toBe('progress');
  });
  it('records quizzes and scene progress', () => {
    const s = new Store(new MemoryStorage());
    s.markQuiz('a', 'q1', false);
    s.markQuiz('a', 'q1', true);
    expect(s.lesson('a')?.quizzes.q1).toEqual({ correct: true, attempts: 2, firstTry: false });
    s.markSceneStep('a', 's', 2);
    s.markSceneStep('a', 's', 1);
    s.markSceneComplete('a', 's');
    expect(s.lesson('a')?.scenes.s).toEqual({ completed: true, step: 2 });
  });
  it('notifies subscribers with a new snapshot per change', () => {
    const s = new Store(new MemoryStorage());
    const fn = vi.fn();
    const off = s.subscribe(fn);
    const before = s.snapshot;
    s.updateSettings({ theme: 'light' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.snapshot).not.toBe(before);
    off();
    s.updateSettings({ theme: 'dark' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('debounces saves and flushes on demand', () => {
    vi.useFakeTimers();
    const m = new MemoryStorage();
    const s = new Store(m, 300);
    s.completeLesson('a');
    expect(m.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(301);
    expect(load(m).lessons.a?.completedAt).toBeTypeOf('number');
    vi.useRealTimers();
  });
  it('export/import and reset keep settings unless asked', () => {
    const s = new Store(new MemoryStorage());
    s.completeLesson('a');
    s.updateSettings({ theme: 'dark' });
    const code = s.exportCode();
    s.reset();
    expect(s.status('a')).toBe('new');
    expect(s.settings.theme).toBe('dark');
    expect(s.importCode('nope')).toBe(false);
    expect(s.importCode(code)).toBe(true);
    expect(s.status('a')).toBe('done');
    s.reset(true);
    expect(s.settings.theme).toBe('system');
  });
  it('nextLesson / overallProgress', () => {
    const s = new Store(new MemoryStorage());
    const c = bundle(['a', 'b', 'c']);
    s.completeLesson('a');
    s.completeLesson('c');
    expect(nextLesson(c, s)).toBe('b');
    expect(overallProgress(c, s)).toEqual({ done: 2, total: 3 });
  });
  it('exam score counts first tries only', () => {
    const c = bundle(['final-exam']);
    c.lessons[0]!.blocks = [1, 2].map((i) => ({
      kind: 'quiz' as const,
      quiz: { id: `q${i}`, prompt: 'p', choices: ['a', 'b'], answer: 0, explanation: 'e' },
    }));
    const s = new Store(new MemoryStorage());
    s.markQuiz('final-exam', 'q1', true);
    s.markQuiz('final-exam', 'q2', false);
    s.markQuiz('final-exam', 'q2', true);
    expect(finalExamScore(c, s)).toBe(0.5);
  });
  it('Drill: streak, best streak, per-street accuracy and recent misses', () => {
    const s = new Store(new MemoryStorage());
    s.recordDrill('preflop', true, 'p:a');
    s.recordDrill('preflop', true, 'p:b');
    s.recordDrill('flop', false, 'f:x');
    expect(s.drillStreak).toBe(0);
    expect(s.drill.bestStreak).toBe(2);
    expect(s.drill.byStreet.preflop).toEqual({ answered: 2, correct: 2 });
    expect(s.drill.byStreet.flop).toEqual({ answered: 1, correct: 0 });
    expect(s.drill.recentMisses).toEqual(['f:x']);
    s.recordDrill('flop', true, 'f:x'); // answering a miss correctly clears it
    expect(s.drill.recentMisses).toEqual([]);
    const code = s.exportCode();
    s.reset();
    expect(s.drill.bestStreak).toBe(0);
    s.importCode(code);
    expect(s.drill.byStreet.preflop.answered).toBe(2);
  });
});

describe('Store sandbox', () => {
  it('keeps the sandbox snapshot, saves it, and round-trips it through export/import', () => {
    const mem = new MemoryStorage();
    const s = new Store(mem, 0);
    expect(s.sandbox).toBeUndefined();
    s.setSandbox({ v: 1, bankroll: 49000 });
    s.flush();
    expect(load(mem).sandbox).toEqual({ v: 1, bankroll: 49000 });
    const code = s.exportCode();
    const t = new Store(new MemoryStorage(), 0);
    expect(t.importCode(code)).toBe(true);
    expect(t.sandbox).toEqual({ v: 1, bankroll: 49000 });
    t.setSandbox(undefined);
    expect(t.sandbox).toBeUndefined();
  });
});
