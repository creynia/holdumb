import { describe, expect, it } from 'vitest';
import { routeName } from '../../src/app/routes';
import type { ParsedHash } from '../../src/app/router';

const at = (path: string): ParsedHash => ({ path, query: new URLSearchParams() });
const lessons: Record<string, string> = { welcome: 'Welcome to the table' };
const lessonTitle = (id: string) => lessons[id];

describe('document titles per route', () => {
  it('every screen has a non-empty, distinct name; Home keeps the SEO title', () => {
    const paths: [string, string | undefined][] = [
      ['/', undefined],
      ['/learn', 'Learn'],
      ['/learn/welcome', 'Welcome to the table · Learn'],
      ['/play', 'Practice table'],
      ['/drill', 'Drill'],
      ['/strategy', 'Strategy charts'],
      ['/hands', 'Hand rankings'],
      ['/bets', 'Paytables'],
      ['/bets/some-bet', 'Paytable detail'],
      ['/glossary', 'Glossary'],
      ['/settings', 'Settings'],
      ['/sources', 'Sources'],
      ['/about', 'About'],
      ['/more', 'More'],
    ];
    for (const [path, want] of paths) expect(routeName(at(path), lessonTitle), path).toBe(want);
    const named = paths.map(([p]) => routeName(at(p), lessonTitle)).filter(Boolean);
    expect(new Set(named).size).toBe(named.length);
  });
  it('an unknown lesson falls back to Learn; an unknown path is Not found', () => {
    expect(routeName(at('/learn/nope'), lessonTitle)).toBe('Learn');
    expect(routeName(at('/nowhere'), lessonTitle)).toBe('Not found');
  });
});
