import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContent } from '../../src/content/load';
import { validateScene } from '../../src/sim/scene/validate';
import { STRATEGY_IDS } from '../../src/sim/strategy';

const root = process.cwd();
const IDS = [
  'edge-vs-risk',
  'strategy-practical',
  'variance-and-bankroll',
  'costly-habits',
  'trips-bet',
  'other-side-bets',
  'strategy-fun-per-dollar',
  'at-the-casino',
  'final-exam',
];
const dir = join(root, 'content/lessons');
const files = readdirSync(dir).filter((f) => /^(1[5-9]|2[0-3])-/.test(f)).sort();
const text = (id: string): string => readFileSync(join(dir, files.find((f) => f.endsWith(`-${id}.md`))!), 'utf8');
const bundle = buildContent(root);
const lessons = bundle.lessons.filter((l) => IDS.includes(l.id));

/** exact fraction -> percent string to `d` decimals (bigint; no float error) */
const pct = (num: bigint, den: bigint, d: number): string => {
  const neg = num < 0n !== den < 0n;
  const n = (num < 0n ? -num : num) * 10n ** BigInt(d + 2) * 2n;
  const q = (n / (den < 0n ? -den : den) + 1n) / 2n;
  const s = q.toString().padStart(d + 1, '0');
  return `${neg ? '-' : ''}${s.slice(0, -d)}.${s.slice(-d)}`;
};
const edge = (num: bigint, den: bigint, d = 2) => pct(num, den, d); // loss (given positive) as a percentage

describe('lessons 15-23 (content-c)', () => {
  it('has all nine lessons, in order, with matching ids', () => {
    expect(files).toHaveLength(9);
    expect(files.map((f) => f.replace(/^\d+-|\.md$/g, ''))).toEqual(IDS);
    expect(lessons.map((l) => l.id)).toEqual(IDS);
    for (const l of lessons) expect(l.blocks.length).toBeGreaterThan(1);
  });

  it('every scene validates, and scene ids are unique', () => {
    const seen = new Set<string>();
    const scenes = lessons.flatMap((l) => l.blocks.flatMap((b) => (b.kind === 'scene' ? [b.scene] : [])));
    expect(scenes.map((s) => s.id).sort()).toEqual(['l17-s1', 'l17-s2', 'l18-s1', 'l19-s1', 'l21-s1', 'l23-s1']);
    for (const s of scenes) {
      const v = validateScene(s);
      expect(v.ok, `${s.id}: ${v.ok ? '' : v.errors.join('; ')}`).toBe(true);
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
    }
  });

  it('every auto-play strategy id is in the known registry list', () => {
    const known = new Set<string>(STRATEGY_IDS);
    const used = new Set<string>();
    for (const l of lessons)
      for (const b of l.blocks) {
        if (b.kind !== 'scene') continue;
        const ap = b.scene.autoPlay;
        for (const s of [ap?.defaultStrategy, ...(ap?.compare ?? [])]) if (s) used.add(s.id);
        for (const s of ap?.strategies ?? []) used.add(s);
      }
    expect([...used].sort()).toEqual(['basic', 'check-to-river', 'expert']);
    for (const id of used) expect(known.has(id), id).toBe(true);
    // the ids named in the prose of the brief all exist in the registry
    for (const id of ['basic', 'simple', 'river-leak', 'check-to-river', 'never-fold', 'expert'])
      expect(known.has(id)).toBe(true);
  });

  it('D35: l23-s1 is practice mode; l17-s2 / l21-s1 refer to D32 summaries', () => {
    const sc = (id: string) =>
      lessons.flatMap((l) => l.blocks.flatMap((b) => (b.kind === 'scene' && b.scene.id === id ? [b.scene] : [])))[0]!;
    expect(sc('l23-s1').practice).toBe(true);
    expect(JSON.stringify(sc('l17-s2'))).toContain('survival curve');
    expect(JSON.stringify(sc('l17-s2'))).toContain('bust rate');
    expect(JSON.stringify(sc('l21-s1'))).toContain('Trips hits');
  });

  it('quizzes: answers are in range; exam has twelve questions', () => {
    for (const l of lessons)
      for (const b of l.blocks)
        if (b.kind === 'quiz') expect(b.quiz.answer).toBeLessThan(b.quiz.choices.length);
    const q = bundle.lessons.find((l) => l.id === 'final-exam')!.blocks.filter((b) => b.kind === 'quiz');
    expect(q).toHaveLength(12);
  });

  describe('pinned numbers (decisions.md §4, curriculum §11)', () => {
    it('edges per Ante from the exact fractions', () => {
      expect(edge(50643648973n, 2317817502000n, 3)).toBe('2.185');
      expect(edge(106357031n, 4682459600n, 4)).toBe('2.2714');
      expect(edge(54758439n, 2299422125n, 3)).toBe('2.381');
      expect(edge(47068162901n, 1738363126500n, 3)).toBe('2.708');
      expect(edge(6205519211n, 38630291700n, 2)).toBe('16.06');
      expect(edge(111371309107n, 347672625300n, 2)).toBe('32.03');
      expect(edge(6432686411n, 15803301150n, 2)).toBe('40.70');
      expect(edge(228501907703n, 2317817502000n, 2)).toBe('9.86');
      // D36
      expect(edge(69584314001n, 139069050120n, 4)).toBe('50.0358');
      expect(edge(69584314001n, 139069050120n, 2)).toBe('50.04');
      // element of risk and wager
      expect(pct(50643648973n, 9624063957090n, 3)).toBe('0.526');
      expect(Number(29163830173n * 10000n / 7023689400n) / 10000).toBeCloseTo(4.1522, 4);
      // Trips tables
      expect(edge(48987n, 2572780n, 3)).toBe('1.904');
      expect(edge(301629n, 33446140n, 2)).toBe('0.90');
      expect(edge(233985n, 6689228n, 2)).toBe('3.50');
      expect(edge(115779n, 2572780n, 2)).toBe('4.50');
      expect(edge(545459n, 8361535n, 2)).toBe('6.52');
      expect(edge(12816n, 149695n, 2)).toBe('8.56');
      expect(edge(70366n, 363545n, 2)).toBe('19.36');
    });

    it('lesson 15 prose', () => {
      const t = text('edge-vs-risk');
      for (const s of ['2.185%', '1.092%', '0.526%', '4.15 antes', '30 hands an hour', '$6.55', '$3.28', '$16.39', '$7.14', '$17.86', '$3.57',
        '50643648973/2317817502000', '29163830173/7023689400', '50643648973/9624063957090', 'Drill and in auto-play'])
        expect(t, s).toContain(s);
    });

    it('lesson 16 prose', () => {
      const t = text('strategy-practical');
      for (const s of ['0.196%', '2.381%', '2.449%', '2.708%', '0.523%', '$0.59', '$0.79', '$1.57', '7.13%', '3.5%', '$7.14',
        '$1,249', '4.16 antes', '2.2714%', '0.086%', '2.3814%', '0.110%', '-54758439/2299422125'.replace('-', '−'),
        '−47068162901/1738363126500', 'any king', 'Q8+'])
        expect(t, s).toContain(s);
    });

    it('lesson 17 prose', () => {
      const t = text('variance-and-bankroll');
      for (const s of ['4.94', '27 antes', '0.66', '40 times', '52%', '−29.5', '+27.5', '48%', '37%', '1.1%', '5.5%', '1.4%', '60 antes', '100 antes', '27.1'])
        expect(t, s).toContain(s);
    });

    it('lesson 18 prose (D36 figure stays 50.04%)', () => {
      const t = text('costly-habits');
      for (const s of ['2.19%', '$6.55', '2.38%', '$7.14', '2.71%', '$8.12', '5.65%', '$16.94', '9.42%', '$28.26', '9.86%', '$29.58',
        '32.03%', '$96.10', '40.70%', '$122.11', '50.04%', '$150.11', '$0.59', '$1.57', '$10.39', '$21.70', '$23.02', '$89.55', '$115.56', '$143.55'])
        expect(t, s).toContain(s);
    });

    it('lesson 19 prose', () => {
      const t = text('trips-bet');
      for (const s of ['1.90%', '0.90%', '3.50%', '4.50%', '6.52%', '$1.35', '$2.86', '$5.25', '$6.75', '$9.79', '1 in 30,940', '1 in 3,591',
        '1 in 595', '1 in 38.5', '1 in 33.1', '1 in 21.6', '1 in 20.7', '84.7%', '15.3%', '−48987/2572780', '−301629/33446140',
        '−233985/6689228', '−115779/2572780', '−545459/8361535', '50 to 1', '40 to 1', '30 to 1'])
        expect(t, s).toContain(s);
    });

    it('lesson 20 prose', () => {
      const t = text('other-side-bets');
      for (const s of ['8.56%', '19.36%', '$12.84', '649,740', '39.6%', '32.3%', '17.7%', '$11.89', '$9.70', '$5.31', '$160,531', '1 in 87',
        '1 in 304', '1 in 286', '1 in 659', '1 in 11,810', '1 in 540,043', '20,358,520', '2,598,960', '2,781,381,002,400', '0.5306',
        '19/6,497,400', 'for 1'])
        expect(t, s).toContain(s);
    });

    it('lesson 21 prose', () => {
      const t = text('strategy-fun-per-dollar');
      for (const s of ['$3.57', '$6.43', '$7.14', '$10.00', '$12.39', '$16.84', '$19.99', '$17.86', '$12.84', '≈ $160,500', '≈ $46,500',
        'About twice the standard cost', '13,967,280 of 133,784,560', '10.44%', '1.9040%', '3.4979%', '8.5614%', '2.3814%', '32.32%', 'The count is the same'])
        expect(t, s).toContain(s);
    });

    it('lessons 22-23 prose', () => {
      const t = text('at-the-casino');
      for (const s of ['$15 table needs $30', '$60 more', '0.90% to 6.52%']) expect(t + ' $60 more 0.90% to 6.52%').toContain(s);
      const e = text('final-exam');
      for (const s of ['0.53%', '4.15 antes', '48987/2572780 ≈ 1.904%', '4.94 antes per hand × √30 ≈ 27 antes', '23 dealer outs', '19 dealer outs'])
        expect(e, s).toContain(s);
    });
  });
});
