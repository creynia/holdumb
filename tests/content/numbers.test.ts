// I064: computed number tokens. The registry is exact (one rounding of an exact fraction), every
// figure in it is used through {{num:…}} in lesson prose, and no lesson types a registry value by hand.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileLesson, expandNumbers } from '../../src/content/compile';
import { buildContent } from '../../src/content/load';
import { D36_EV, NUMBERS, decimal, money } from '../../src/content/numbers';
import { frac } from '../../src/sim/strategy/fraction';

const DIR = join(process.cwd(), 'content/lessons');
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));

describe('number registry', () => {
  it('covers the figures the item lists, rounded once from exact fractions', () => {
    expect(NUMBERS).toMatchObject({
      'perfect-edge-2': '2.18%', // I023: 2.184966% rounds to 2.18, never 2.19
      'perfect-edge-3': '2.185%',
      'perfect-eor-2': '0.53%',
      'perfect-eor-3': '0.526%',
      'perfect-wager': '4.15',
      'dealer-qualify': '82.6%',
      'perfect-per-hour': '$6.55',
      'expert-per-hour': '$6.81',
      'basic-per-hour': '$7.14',
      'simple-per-hour': '$8.12',
      // decisions.md §4: cost vs perfect per hour at $10 and 30 hands
      'expert-extra-per-hour': '$0.26',
      'basic-extra-per-hour': '$0.59',
      'simple-extra-per-hour': '$1.57',
      'trips-8-6-5-edge': '1.90%',
      'trips-9-7-4-edge': '0.90%',
      'trips-8-7-4-edge': '3.50%',
      'trips-7-6-5-edge': '4.50%',
      'trips-8-6-4-edge': '6.52%',
      'd36-edge-2': '50.04%',
    });
    // D36 is the pinned exact fraction (decisions.md D36).
    expect(D36_EV).toEqual(frac(-69584314001n, 139069050120n));
  });
  it('rounds half away from zero exactly, once', () => {
    expect(decimal(frac(1n, 8n), 2)).toBe('0.13');
    expect(decimal(frac(-1n, 8n), 2)).toBe('-0.13');
    expect(decimal(frac(1n, 3n), 0)).toBe('0');
    expect(decimal(frac(-1n, 1000n), 2)).toBe('0.00');
    expect(money(frac(2499n, 2n))).toBe('$12.50'); // 1249.5 cents -> 1250
    expect(money(frac(124900n))).toBe('$1,249');
    expect(money(frac(65549n, 100n))).toBe('$6.55');
  });
});

describe('{{num:…}} tokens', () => {
  const head = '---\nid: t\ntitle: T\nsummary: S\nminutes: 2\n---\n';
  it('expand in prose, tables and quizzes to the registry text', () => {
    const l = compileLesson(
      head +
        'Edge **{{num:perfect-edge-3}}**.\n\n| a | b |\n|---|---|\n| x | {{num:basic-per-hour}} |\n\n' +
        '```quiz\n- q: "Edge?"\n  options: ["{{num:perfect-edge-2}}", "5%"]\n  answer: 0\n  explain: "It is {{num:perfect-edge-3}}."\n```\n',
      't.md',
    );
    const html = JSON.stringify(l.blocks);
    expect(html).toContain('<strong>2.185%</strong>');
    expect(html).toContain('<td>$7.14</td>');
    expect(html).toContain('"2.18%"');
    expect(html).toContain('It is 2.185%.');
    expect(html).not.toContain('{{num:');
  });
  it('an unknown id fails the build with the lesson and line', () => {
    expect(() => compileLesson(head + 'ok\n\nsee {{num:nope}}\n', 'lesson-x.md')).toThrow(
      /lesson-x\.md: line 9: unknown number token "\{\{num:nope\}\}"/,
    );
    expect(() => expandNumbers('{{num:}}')).toThrow(/unknown number token/);
  });
});

describe('lessons use the tokens', () => {
  // Quiz options are scanned too: a correct answer, or a distractor that quotes the real figure,
  // uses the token. Only text that merely matches a figure is allowed, entry by entry: a quoted
  // outside source keeps its own wording even when it matches a computed figure.
  const ALLOW: { file: string; includes: string }[] = [
    { file: '15-edge-vs-risk.md', includes: 'Treasury Brisbane gaming guide quotes' },
  ];
  const exempt = (file: string, line: string) =>
    ALLOW.some((a) => a.file === file && line.includes(a.includes));
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  it('no lesson types a registry value outside a {{num:…}} token', () => {
    const hits: string[] = [];
    for (const f of files) {
      const lines = readFileSync(join(DIR, f), 'utf8').split('\n');
      const fmEnd = lines.indexOf('---', 1);
      lines.forEach((line, i) => {
        if (i <= fmEnd || exempt(f, line)) return;
        for (const [id, v] of Object.entries(NUMBERS))
          if (new RegExp(`(?<![\\d.])${esc(v)}(?!\\d)`).test(line)) hits.push(`${f}:${i + 1} ${id} ${v}`);
      });
    }
    expect(hits).toEqual([]);
  });
  it('the scan catches a hand-typed copy, options included (the check can fail)', () => {
    const line = '  options: ["About 2.18% of the Ante", "5%"]';
    expect(exempt('05-expected-value.md', line)).toBe(false);
    expect(Object.values(NUMBERS).some((v) => new RegExp(`(?<![\\d.])${esc(v)}(?!\\d)`).test(line))).toBe(true);
  });
  it('chapters.json summaries use the tokens and expand them', () => {
    const raw = readFileSync(join(process.cwd(), 'content/chapters.json'), 'utf8');
    for (const v of Object.values(NUMBERS))
      expect(new RegExp(`(?<![\\d.])${esc(v)}(?!\\d)`).test(raw), v).toBe(false);
    const ch = buildContent(process.cwd()).chapters.find((c) => c.summary.includes('optimum'))!;
    expect(ch.summary).toBe('Every decision, played to the exact optimum: 2.18% of the Ante.');
  });
  it('every token in the lessons names a registry id', () => {
    const ids = files.flatMap((f) =>
      [...readFileSync(join(DIR, f), 'utf8').matchAll(/\{\{num:([^}]*)\}\}/g)].map((m) => m[1]!),
    );
    expect(ids.length).toBeGreaterThanOrEqual(60);
    for (const id of ids) expect(NUMBERS[id], id).toBeDefined();
  });
});
