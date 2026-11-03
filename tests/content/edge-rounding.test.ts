import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPct } from '../../src/sim/engine';
import { GAME_EDGE } from '../../src/sim/math/edges';
import { expandNumbers } from '../../src/content/compile';

const root = process.cwd();

/** every .md and .json file under content/, recursively */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(md|json)$/.test(e.name) ? [p] : [];
  });
const files = walk(join(root, 'content'));
const text = (id: string): string => expandNumbers(readFileSync(files.find((f) => f.endsWith(`/lessons/${id}.md`) || f.endsWith(`-${id}.md`))!, 'utf8'));

describe('perfect-play edge rounding (decisions §4: 2.18497%)', () => {
  it('formats the exact edge as 2.18% to two decimals and 2.185% to three', () => {
    expect(formatPct(GAME_EDGE, 2)).toBe('2.18%');
    expect(formatPct(GAME_EDGE, 3)).toBe('2.185%');
  });

  it('no content file prints the double-rounded 2.19% or the 2.184% mis-rounding', () => {
    for (const f of files) {
      const t = expandNumbers(readFileSync(f, 'utf8'));
      expect(t, f).not.toContain('2.19%');
      expect(t, f).not.toContain('2.184%');
    }
  });

  it('the two-decimal mention is present where a lesson uses it (test can fail)', () => {
    expect(text('strategy-lowest-edge')).toContain(`${formatPct(GAME_EDGE, 2)} of the Ante`);
    expect(text('costly-habits')).toContain('| Perfect play | 2.18% |');
  });
});
