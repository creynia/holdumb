import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContent } from '../../src/content/load';
import { validateScene } from '../../src/sim/scene';

const root = process.cwd();
const bundle = buildContent(root);
const IDS = [
  'welcome',
  'hand-rankings',
  'a-full-hand',
  'settling-bets',
  'expected-value',
  'reading-the-ev-sheet',
];
const FILES = IDS.map((id, i) => `${String(i + 1).padStart(2, '0')}-${id}.md`);
const text = (id: string) =>
  readFileSync(join(root, 'content/lessons', FILES[IDS.indexOf(id)]!), 'utf8');

describe('lessons 1-6', () => {
  it('exist in order, with the right chapters', () => {
    const ids = bundle.lessons.map((l) => l.id);
    expect(ids.slice(0, 6)).toEqual(IDS);
    expect(bundle.lessons.slice(0, 4).every((l) => l.chapterId === 'foundations')).toBe(true);
    expect(bundle.lessons.slice(4, 6).every((l) => l.chapterId === 'ev-basics')).toBe(true);
  });
  it('chapters.json has all 6 chapters and 23 lessons (D19)', () => {
    expect(bundle.chapters.map((c) => c.id)).toEqual([
      'foundations',
      'ev-basics',
      'perfect-lowest-edge',
      'perfect-practical',
      'perfect-fun',
      'real-casino',
    ]);
    expect(bundle.chapters.flatMap((c) => c.lessons)).toHaveLength(23);
  });
  it('every scene validates, ids are lNN-sN, and each lesson ends with a quiz', () => {
    IDS.forEach((id, i) => {
      const l = bundle.lessons.find((x) => x.id === id)!;
      const scenes = l.blocks.flatMap((b) => (b.kind === 'scene' ? [b.scene] : []));
      expect(scenes.length).toBeGreaterThan(0);
      scenes.forEach((s, j) => {
        expect(s.id).toBe(`l${String(i + 1).padStart(2, '0')}-s${j + 1}`);
        expect(validateScene(s).ok).toBe(true);
      });
      expect(l.blocks.at(-1)?.kind).toBe('quiz');
    });
  });
  it('practice-off EV scenes: lessons 5 and 6 show EV', () => {
    for (const id of ['expected-value', 'reading-the-ev-sheet']) {
      const l = bundle.lessons.find((x) => x.id === id)!;
      for (const b of l.blocks) if (b.kind === 'scene') expect(b.scene.showEV).toBe(true);
    }
  });
  it('uses the D31 labels and never "Raise"', () => {
    for (const id of IDS) expect(text(id)).not.toMatch(/\bRaise\b/);
  });
});

describe('pinned numbers', () => {
  const pins: Record<string, string[]> = {
    'hand-rankings': [
      '1 in 30,940',
      '1 in 3,591',
      '1 in 595',
      '1 in 38.5',
      '1 in 33.1',
      '1 in 21.6',
      '1 in 20.7',
      '1 in 4.3',
      '1 in 2.3',
      '1 in 5.7',
      '133,784,560',
      '4,324',
      '37,260',
      '224,848',
      '3,473,184',
      '4,047,644',
      '6,180,020',
      '6,461,620',
      '31,433,400',
      '58,627,800',
      '23,294,460',
      '43.8%',
      '17.4%',
    ],
    'settling-bets': [
      '500 to 1',
      '50 to 1',
      '10 to 1',
      '3 to 1',
      '3 to 2',
      '1 to 1',
      '17.4%',
      '47.97%',
      '4.07%',
      '82.59%',
      '789215/955604',
      '14.24%',
      '+$65',
      '+$50',
      '+$40',
      '−$60',
      '−$50',
      '2,598,960',
      '1,081',
      '990',
    ],
    'a-full-hand': ['2 Antes', '$20'],
    'expected-value': [
      '2.185%',
      '2.19%',
      '22¢',
      '40.7%',
      '+$11.72',
      '+1.172',
      '+0.569',
      '−2.118',
      '−0.883',
      '−0.02185',
      '33.73%',
      '45.21%',
      '−1330653811/11589087510',
      '−0.1148',
      '−0.2922',
      '−6432686411/15803301150',
      '−0.4070',
      '−50643648973/2317817502000',
      '47.97%',
    ],
    'reading-the-ev-sheet': [
      '+$36.01',
      '+$28.97',
      '+$21.93',
      '−$7.04',
      '−$14.08',
      '0.02',
      '0.10',
      '0.50',
      '0.011',
      '0.023',
      '0.108',
      '1.23',
      '472094411/131098275',
      '3.6011',
      '2.8970',
      '38331809/17479770',
      '2.1929',
      '9.86%',
      '2.19%',
    ],
  };
  for (const [id, list] of Object.entries(pins))
    it(`${id} carries its exact figures`, () => {
      const t = text(id);
      for (const p of list) expect(t, `${id}: ${p}`).toContain(p);
    });
});
