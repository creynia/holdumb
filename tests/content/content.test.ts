import { describe, expect, it } from 'vitest';
import { HAND_CATEGORIES, WAGER_IDS } from '../../src/sim/engine';
import { STRATEGY_IDS } from '../../src/sim/strategy';
import { compileLesson } from '../../src/content/compile';
import { buildContent, readSources } from '../../src/content/load';

const root = process.cwd();
const bundle = buildContent(root);
const src = readSources(root);
const lessonIds = new Set(bundle.lessons.map((l) => l.id));

describe('content bundle', () => {
  it('lists every lesson in exactly one chapter, and every chapter lesson exists', () => {
    const listed = bundle.chapters.flatMap((c) => c.lessons);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.every((id) => lessonIds.has(id))).toBe(true);
    expect([...lessonIds].sort()).toEqual([...listed].sort());
    for (const l of bundle.lessons)
      expect(bundle.chapters.find((c) => c.id === l.chapterId)?.lessons).toContain(l.id);
  });
  it('bets.json covers exactly the engine wager ids', () => {
    expect(Object.keys(bundle.bets).sort()).toEqual([...WAGER_IDS].sort());
  });
  it('hands.json covers exactly the evaluator categories, with valid examples', () => {
    expect(Object.keys(bundle.hands).sort()).toEqual([...HAND_CATEGORIES].sort());
    for (const h of Object.values(bundle.hands)) expect(h.example.split(/\s+/)).toHaveLength(5);
  });
  it('strategy.json covers exactly the strategy registry', () => {
    expect(Object.keys(bundle.strategy).sort()).toEqual([...STRATEGY_IDS].sort());
  });
  it('every lessonId / see reference resolves', () => {
    const slugs = new Set(bundle.glossary.map((g) => g.slug));
    expect(slugs.size).toBe(bundle.glossary.length);
    for (const g of bundle.glossary) {
      if (g.lessonId) expect(lessonIds.has(g.lessonId)).toBe(true);
      for (const s of g.see ?? []) expect(slugs.has(s)).toBe(true);
    }
    for (const b of Object.values(bundle.bets))
      if (b.lessonId) expect(lessonIds.has(b.lessonId)).toBe(true);
  });
  it('quiz ids are unique across the course', () => {
    const ids = bundle.lessons.flatMap((l) => l.blocks.flatMap((b) => (b.kind === 'quiz' ? [b.quiz.id] : [])));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('placeholder samples stay valid', () => {
  it('every _sample-* lesson compiles', () => {
    const all = readSources(root, true).lessonFiles.filter((f) => f.file.startsWith('_sample-'));
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      const l = compileLesson(f.source, f.file);
      expect(l.id).toBe(`sample-${f.slug}`);
    }
  });
  it('real files, when present, replace the samples', () => {
    expect(src.samplesActive).toBe(!src.chapters.some((c) => !c.id.startsWith('sample-')));
  });
});
