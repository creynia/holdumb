import { beforeEach, describe, expect, it } from 'vitest';
import { consumeFreshNav, matchPath, navigate, parseHash } from '../../src/app/router';

describe('parseHash', () => {
  it('parses paths and queries', () => {
    const r = parseHash('#/glossary?term=hard%20way');
    expect(r.path).toBe('/glossary');
    expect(r.query.get('term')).toBe('hard way');
  });
  it('normalises empty and sloppy hashes', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#').path).toBe('/');
    expect(parseHash('#/learn/').path).toBe('/learn');
    expect(parseHash('#learn//x').path).toBe('/learn/x');
  });
  it('does not throw on malformed escapes', () => {
    expect(parseHash('#/learn/%E0%A4%A').path).toBe('/learn/%E0%A4%A');
  });
});

describe('matchPath', () => {
  it('matches params', () => {
    expect(matchPath('/learn/:id', '/learn/pass-line')).toEqual({ id: 'pass-line' });
    expect(matchPath('/', '/')).toEqual({});
  });
  it('rejects mismatches', () => {
    expect(matchPath('/learn/:id', '/learn')).toBeNull();
    expect(matchPath('/learn', '/play')).toBeNull();
    expect(matchPath('/a/:x', '/a/b/c')).toBeNull();
  });
});

describe('navigate', () => {
  beforeEach(() => {
    location.hash = '';
    consumeFreshNav();
  });
  it('sets the hash and flags a fresh navigation once', () => {
    navigate('/play');
    expect(location.hash).toBe('#/play');
    expect(consumeFreshNav()).toBe(true);
    expect(consumeFreshNav()).toBe(false);
  });
});
