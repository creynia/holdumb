import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// macOS and Windows file systems are case-insensitive: two files under src/ whose paths differ only
// by case cannot both check out there (I096). This fails on such a pair.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe('no case-only path clashes under src/ (I096)', () => {
  it('every file path is unique when lowercased', () => {
    const root = join(process.cwd(), 'src');
    const paths = walk(root).map((p) => relative(process.cwd(), p));
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const p of paths) {
      const key = p.toLowerCase();
      if (seen.has(key)) clashes.push(`${seen.get(key)} <-> ${p}`);
      else seen.set(key, p);
    }
    expect(clashes).toEqual([]);
    expect(paths.length).toBeGreaterThan(50);
  });
  it('the guard catches a real clash (its own logic, on fixture names)', () => {
    const names = ['src/sim/ui/moveLog.ts', 'src/sim/ui/MoveLog.ts'];
    const keys = new Set(names.map((n) => n.toLowerCase()));
    expect(keys.size).toBeLessThan(names.length);
  });
});
