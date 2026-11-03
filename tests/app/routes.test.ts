import { describe, expect, it } from 'vitest';
import { routeName } from '../../src/app/routes';
import { wagerName } from '../../src/app/screens/Bets';
import type { ParsedHash } from '../../src/app/router';

const at = (path: string): ParsedHash => ({ path, query: new URLSearchParams() });
const lessons: Record<string, string> = { welcome: 'Welcome to the table' };
const ctx = {
  lessonTitle: (id: string) => lessons[id],
  wagerName: (id: string) => wagerName(id, {}),
};

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
      ['/bets/ante', 'Ante'],
      ['/glossary', 'Glossary'],
      ['/settings', 'Settings'],
      ['/sources', 'Sources'],
      ['/about', 'About'],
      ['/more', 'More'],
    ];
    for (const [path, want] of paths) expect(routeName(at(path), ctx), path).toBe(want);
    const named = paths.map(([p]) => routeName(at(p), ctx)).filter(Boolean);
    expect(new Set(named).size).toBe(named.length);
  });
  it('an unknown lesson falls back to Learn; an unknown path is Not found', () => {
    expect(routeName(at('/learn/nope'), ctx)).toBe('Learn');
    expect(routeName(at('/nowhere'), ctx)).toBe('Not found');
  });
  it('a bet page is named after its wager; two wagers differ; an unknown wager is Not found', () => {
    const ante = routeName(at('/bets/ante'), ctx);
    const trips = routeName(at('/bets/trips'), ctx);
    expect(ante).toBe('Ante');
    expect(trips).toBe('Trips');
    expect(ante).not.toBe(trips);
    expect(routeName(at('/bets/nope'), ctx)).toBe('Not found');
  });
});
