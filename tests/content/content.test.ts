import { describe, expect, it } from 'vitest';
import { HAND_CATEGORIES, WAGER_IDS } from '../../src/sim/engine';
import { DRILL_CATEGORY_IDS, STRATEGY_IDS } from '../../src/sim/strategy';
import { buildContent } from '../../src/content/load';
import { strategyMetrics } from '../../src/sim/strategy/metrics';
import { formatMoney, formatPct } from '../../src/sim/engine/money';
import { fracToNumber } from '../../src/sim/strategy/fraction';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const bundle = buildContent(root);
const lessonIds = new Set(bundle.lessons.map((l) => l.id));

describe('content bundle', () => {
  it('lesson 18 quotes the always-bet-4x figures the engine computes', () => {
    const text = readFileSync(join(root, 'content/lessons/18-costly-habits.md'), 'utf8');
    const spec = (id: 'never-fold' | 'always-max') => ({ id, ante: 1000, trips: 0 });
    const rules = { tripsPaytable: 'trips-8-6-5' } as never;
    const never = strategyMetrics(spec('never-fold'), rules, 30);
    const always = strategyMetrics(spec('always-max'), rules, 30);
    // same expected loss per hand, and twice the money in action (element of risk halves)
    expect(always.evPerHourCents.num * never.evPerHourCents.den).toBe(
      never.evPerHourCents.num * always.evPerHourCents.den,
    );
    expect(text).toContain(`${formatPct(never.edgePerAnte, 2)} of the Ante`);
    expect(text).toContain(
      `element of risk is ${formatPct(always.elementOfRisk, 2)} against ${formatPct(never.elementOfRisk, 2)}`,
    );
    expect(formatMoney(Math.round(fracToNumber(always.evPerHourCents)), { sign: true })).toBe('-$122.11');
  });

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

describe('drill.json', () => {
  it('has a reminder for exactly the 18 Drill categories; river-outs ones carry {outs}', () => {
    expect(Object.keys(bundle.drill).sort()).toEqual([...DRILL_CATEGORY_IDS].sort());
    for (const [id, text] of Object.entries(bundle.drill)) {
      expect(text, id).toBeTruthy();
      expect(text.includes('{outs}'), id).toBe(id.startsWith('river-outs-'));
    }
  });
});
