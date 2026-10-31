import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { cardsHtml, isHandClass, splitInline } from '../../src/content/cards';
import { compileLesson, minHeadingDepth } from '../../src/content/compile';
import { buildContent } from '../../src/content/load';

const head = '---\nid: t\ntitle: T\nsummary: S\nminutes: 2\n---\n';
const scene = '```scene\nid: s1\nversion: 1\ntitle: x\n```\n';
const quiz = (body: string) => '```quiz\n' + body + '\n```\n';

describe('compileLesson blocks', () => {
  it('splits prose, math, tip, chart, scene and quiz blocks in order', () => {
    const l = compileLesson(
      head +
        'Hello **world**.\n\n:::tip\nBe nice.\n:::\n\n:::math The math\nx = `1`\n:::\n\n' +
        '```chart\nstrategy: perfect\nview: preflop-grid\nhighlight: ["77", "AKs", "T9o"]\n```\n\n' +
        scene +
        '\n```quiz\n- q: A?\n  options: [a, b]\n  answer: 1\n  explain: because\n- id: custom\n  q: B?\n  options: [a, b]\n  answer: 0\n  explain: e\n```\n',
      't.md',
    );
    expect(l.blocks.map((b) => b.kind)).toEqual([
      'html',
      'tip',
      'math',
      'chart',
      'scene',
      'quiz',
      'quiz',
    ]);
    expect(l.blocks.filter((b) => b.kind === 'quiz').map((b) => b.quiz.id)).toEqual([
      't-q1',
      'custom',
    ]);
    expect(l.blocks[2]).toMatchObject({ kind: 'math', title: 'The math' });
    expect(l.blocks[3]).toMatchObject({
      kind: 'chart',
      chart: { strategy: 'perfect', view: 'preflop-grid', highlight: ['77', 'AKs', 'T9o'] },
    });
  });

  it('does not treat ::: inside ordinary code fences as containers', () => {
    const l = compileLesson(head + '```text\n:::math nope\n```\n', 't.md');
    expect(l.blocks).toHaveLength(1);
  });
});

describe('inline cards', () => {
  it('renders accessible card groups in prose, tips and math boxes', () => {
    const l = compileLesson(
      head + 'You hold {{As Kd}}.\n\n:::tip\n{{Qh}}\n:::\n\n:::math M\n{{2c 2d}}\n:::\n',
      't.md',
    );
    const [p, tip, math] = l.blocks;
    for (const b of [p, tip, math]) {
      const html = b && 'html' in b ? b.html : '';
      expect(html).toContain('class="cards"');
      expect(html).toContain('role="img"');
    }
    expect(p && 'html' in p && p.html).toContain('aria-label="Ace of spades, King of diamonds"');
    // text presentation selector so Android does not paint emoji hearts
    expect(cardsHtml('Ah')).toContain('♥︎');
  });

  it('leaves code spans alone and rejects bad groups', () => {
    const l = compileLesson(head + 'Write `{{As Kd}}` in source.\n', 't.md');
    expect(JSON.stringify(l.blocks)).not.toContain('class=\\"cards\\"');
    expect(() => compileLesson(head + '{{As As}}', 'a.md')).toThrow(/a\.md.*Duplicate/);
    expect(() => compileLesson(head + '{{Zz}}', 'a.md')).toThrow(/Bad card/);
    expect(() => compileLesson(head + '{{}}', 'a.md')).toThrow(/empty/);
  });

  it('splitInline splits text around groups', () => {
    const segs = splitInline('a {{As Kd}} b {{2c}}');
    expect(segs.map((s) => s.t)).toEqual(['text', 'cards', 'text', 'cards']);
  });

  it('validates cards in quiz text, options and explanations', () => {
    const ok = quiz('- q: "Is {{As Kd}} suited?"\n  options: ["{{As Ks}}", "no"]\n  answer: 1\n  explain: "{{Ah}} yes"');
    expect(compileLesson(head + ok, 't.md').blocks).toHaveLength(1);
    for (const field of ['q: "{{As As}}"\n  options: [a, b]\n  answer: 0\n  explain: e',
      'q: x\n  options: ["{{Q}}", b]\n  answer: 0\n  explain: e',
      'q: x\n  options: [a, b]\n  answer: 0\n  explain: "{{9x}}"'])
      expect(() => compileLesson(head + quiz('- ' + field), 't.md')).toThrow();
  });
});

describe('quiz validation (build fails)', () => {
  const bad = (entry: string, re: RegExp) =>
    expect(() => compileLesson(head + quiz(entry), 'q.md')).toThrow(re);
  it('rejects malformed quizzes', () => {
    bad('- q: A?\n  options: [a]\n  answer: 0\n  explain: e', /at least 2/);
    bad('- q: A?\n  options: [a, a]\n  answer: 0\n  explain: e', /distinct/);
    bad('- q: A?\n  options: [a, b]\n  answer: 2\n  explain: e', /answer/);
    bad('- q: A?\n  options: [a, b]\n  answer: "1"\n  explain: e', /answer/);
    bad('- q: A?\n  options: [a, b]\n  answer: 0', /explain/);
    bad('- q: A?\n  options: [a, b]\n  answer: 0\n  explain: e\n- id: t-q1\n  q: B?\n  options: [a, b]\n  answer: 0\n  explain: e', /duplicate quiz id/);
  });
  it('validates the hand field', () => {
    const q = (hand: string) => `- q: A?\n  hand: ${hand}\n  options: [a, b]\n  answer: 0\n  explain: e`;
    const l = compileLesson(head + quiz(q('{ hole: Ah 5c, board: Ad 9s 2c }')), 't.md');
    expect(l.blocks[0]).toMatchObject({
      quiz: { hand: { hole: 'Ah 5c', board: 'Ad 9s 2c' } },
    });
    bad(q('{ hole: Ah }'), /exactly two/);
    bad(q('{ hole: Ah 5c, board: Ad 9s }'), /3 to 5/);
    bad(q('{ hole: Ah 5c, board: Ah 9s 2c }'), /Duplicate/);
    bad(q('{ board: Ad 9s 2c }'), /hole/);
  });
});

describe('chart and scene validation (build fails)', () => {
  it('rejects bad charts', () => {
    const c = (y: string) => '```chart\n' + y + '\n```\n';
    const t = (y: string, re: RegExp) => expect(() => compileLesson(head + c(y), 'c.md')).toThrow(re);
    t('strategy: nope\nview: flop', /unknown strategy/);
    t('strategy: perfect\nview: turn', /unknown view/);
    t('strategy: perfect\nview: flop\nhighlight: ["AKx"]', /invalid hand classes/);
    t('strategy: perfect\nview: flop\nhighlight: ["KAs"]', /invalid hand classes/);
    t('strategy: perfect\nview: flop\nhighlight: AKs', /list/);
  });
  it('accepts valid hand classes only', () => {
    expect(['AA', '22', 'AKs', 'T9o'].every(isHandClass)).toBe(true);
    expect(['AKx', 'AK', 'A', 'KAs', 'AAs', '2Ao', '1Ks'].some(isHandClass)).toBe(false);
  });
  it('rejects invalid scenes and bad cards in step text', () => {
    expect(() => compileLesson(head + '```scene\nid: x\nversion: 2\n```\n', 'a.md')).toThrow(/invalid scene/);
    expect(() => compileLesson(head + '```scene\nversion: 1\n```\n', 'a.md')).toThrow(/invalid scene/);
    expect(() =>
      compileLesson(head + '```scene\nid: x\nversion: 1\nsteps:\n  - id: a\n    completeWhen: { acknowledged: true }\n```\n', 'a.md'),
    ).toThrow(/invalid scene/);
    expect(() =>
      compileLesson(
        head +
          '```scene\nid: x\nversion: 1\nsteps:\n  - id: a\n    text: "{{As As}}"\n    completeWhen: { acknowledged: true }\n```\n',
        'a.md',
      ),
    ).toThrow(/Duplicate/);
    expect(() => compileLesson(head + scene + scene, 'a.md')).toThrow(/duplicate scene id/);
  });
});

describe('scene card validation', () => {
  it('rejects a forced deal that repeats a card', () => {
    const dup =
      '```scene\nid: dup\nversion: 1\nsteps:\n  - id: a\n    text: hi\n    deals: [{ player: [As, As] }]\n    completeWhen: { acknowledged: true }\n```\n';
    expect(() => compileLesson(head + dup, 'd.md')).toThrow(/invalid scene "dup"/);
  });
  it('prefixes scene errors with the scene id', () => {
    expect(() => compileLesson(head + '```scene\nid: named\nversion: 2\n```\n', 'a.md')).toThrow(
      /invalid scene "named"/,
    );
  });
});

describe('structure errors', () => {
  it('names the file in the message', () => {
    expect(() => compileLesson(head + ':::math\nbody\n:::\n', 'a.md')).toThrow(/a\.md.*title/);
    expect(() => compileLesson(head + ':::math T\nbody\n', 'a.md')).toThrow(/unclosed/);
    expect(() => compileLesson(head + ':::weird\nx\n:::\n', 'a.md')).toThrow(/unknown/);
    expect(() => compileLesson(head + '```math\nx\n```\n', 'a.md')).toThrow(/unknown directive/);
    expect(() => compileLesson(head + '```quiz\n- q: x\n', 'a.md')).toThrow(/unclosed/);
    expect(() => compileLesson('no front matter', 'a.md')).toThrow(/id/);
    expect(() => compileLesson('---\nid: x\ntitle: T\nsummary: S\nminutes: 0\n---\n', 'a.md')).toThrow(/minutes/);
  });
  it('resolves glossary links and rejects unknown terms', () => {
    const opts = { glossarySlugs: new Set(['ante']), glossaryTerms: new Map([['ante', 'ante']]) };
    const l = compileLesson(head + 'The [[ante]] is in.', 't.md', opts);
    expect(JSON.stringify(l.blocks[0])).toContain('#/glossary?term=ante');
    expect(() => compileLesson(head + '[[nope]]', 't.md', opts)).toThrow(/nope/);
  });
  it('shifts headings under the page h1', () => {
    const l = compileLesson(head + '### A\n\ntext\n\n#### B\n', 't.md');
    expect(JSON.stringify(l.blocks)).toContain('<h2>A</h2>');
    expect(JSON.stringify(l.blocks)).toContain('<h3>B</h3>');
    expect(minHeadingDepth('no headings')).toBe(7);
  });
});

// A bad lesson must fail the build: vite calls the plugin's `load` for virtual:content.
describe('failing build', () => {
  function project(lesson: string, extra?: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'holdumb-content-'));
    mkdirSync(join(root, 'content', 'lessons'), { recursive: true });
    writeFileSync(join(root, 'content', 'chapters.json'), JSON.stringify([{ id: 'c', title: 'C', summary: '', lessons: ['one'] }]));
    writeFileSync(join(root, 'content', 'lessons', '01-one.md'), lesson);
    for (const [k, v] of Object.entries(extra ?? {})) writeFileSync(join(root, 'content', k), v);
    return root;
  }
  const front = '---\nid: one\ntitle: One\nchapter: c\nsummary: S\nminutes: 1\n---\n';
  const runPlugin = async (root: string) => {
    // build/ is outside the tests tsconfig; load the plugin by path
    const mod = (await import(/* @vite-ignore */ join(process.cwd(), 'build/vite-plugin-content.ts'))) as {
      contentPlugin: () => Plugin;
    };
    const p = mod.contentPlugin();
    (p.configResolved as (c: { root: string }) => void)({ root });
    return (p.load as (id: string) => unknown)('\0virtual:content');
  };

  it('a valid project builds the bundle', async () => {
    const code = String(await runPlugin(project(front + 'Hi {{As Kd}}.\n' + scene)));
    expect(code.startsWith('export default ')).toBe(true);
    expect(buildContent(project(front + 'x')).lessons.map((l) => l.id)).toEqual(['one']);
  });
  it.each([
    ['an invalid scene', front + '```scene\nid: x\nversion: 9\n```\n', /invalid scene/],
    ['an invalid quiz', front + quiz('- q: A?\n  options: [a, b]\n  answer: 5\n  explain: e'), /answer/],
    ['an invalid chart', front + '```chart\nstrategy: perfect\nview: nope\n```\n', /unknown view/],
    ['bad cards', front + '{{As As}}', /Duplicate/],
  ])('fails on %s', async (_n, lesson, re) => {
    await expect(runPlugin(project(lesson))).rejects.toThrow(re);
  });
  it('fails when the lesson id does not match its file or chapter', () => {
    expect(() => buildContent(project(front.replace('id: one', 'id: two')))).toThrow(/must equal/);
    expect(() => buildContent(project(front.replace('chapter: c', 'chapter: z')))).toThrow(/chapter/);
  });
  it('fails on an unlisted lesson', () => {
    const root = project(front);
    writeFileSync(join(root, 'content', 'lessons', '02-two.md'), front.replace('id: one', 'id: two'));
    expect(() => buildContent(root)).toThrow(/not listed/);
  });
});

describe('lesson sources and citations', () => {
  const known = new Map([['woo', { id: 'woo', title: 'Wizard of Odds', url: 'https://example.com/' }]]);
  const withSrc = (fm: string, body: string) => head.replace('minutes: 2\n', `minutes: 2\n${fm}`) + body;

  it('resolves ids and one-off sources, and renders [^n] as a button marker', () => {
    const l = compileLesson(
      withSrc('sources:\n  - woo\n  - { title: One-off, note: n }\n', 'Claim.[^1] Other.[^2]\n'),
      't.md',
      { sources: known },
    );
    expect(l.sources).toEqual([
      { id: 'woo', title: 'Wizard of Odds', url: 'https://example.com/' },
      { title: 'One-off', note: 'n' },
    ]);
    const html = l.blocks[0]!.kind === 'html' ? l.blocks[0]!.html : '';
    expect(html).toContain('<sup class="cite"><button type="button" class="cite-btn" data-cite="1"');
    expect(html).toContain('data-cite="2"');
    expect(html).not.toContain('href="#');
  });
  it('leaves code spans literal', () => {
    const l = compileLesson(withSrc('sources:\n  - woo\n', 'Use `[^9]` here.[^1]\n'), 't.md', {
      sources: known,
    });
    const b = l.blocks[0];
    expect(b && b.kind === 'html' ? b.html : '').not.toContain('data-cite="9"');
  });
  it('rejects an unknown source id', () => {
    expect(() => compileLesson(withSrc('sources:\n  - nope\n', 'x\n'), 't.md', { sources: known })).toThrow(
      /unknown source id "nope"/,
    );
  });
  it('rejects an out-of-range citation, and a citation with no sources', () => {
    expect(() =>
      compileLesson(withSrc('sources:\n  - woo\n', 'x[^2]\n'), 't.md', { sources: known }),
    ).toThrow(/\[\^2\] is out of range/);
    expect(() => compileLesson(head + 'x[^1]\n', 't.md')).toThrow(/needs a `sources:` list/);
  });
  it('rejects a non-https one-off url', () => {
    expect(() =>
      compileLesson(withSrc('sources:\n  - { title: T, url: "http://x.test" }\n', 'x\n'), 't.md'),
    ).toThrow(/https/);
  });
  it('buildContent knows every id in content/sources.json and the real lessons all compile', () => {
    const b = buildContent(process.cwd());
    expect(b.sources.length).toBeGreaterThan(0);
    for (const l of b.lessons) if (l.sources) expect(l.sources.length).toBeGreaterThan(0);
  });
});
