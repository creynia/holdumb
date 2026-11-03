import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine/cards';
import { riverFacts } from './alternatives';
import { previewJob } from './preview';
import type { Card } from '../engine/types';

function time(street: 'river' | 'flop', hole: string, board: string): number {
  const t0 = performance.now();
  const g = previewJob({
    street,
    hole: parseCards(hole) as [Card, Card],
    board: parseCards(board),
    blindPaytable: 'blind-standard',
    ante: 1000,
  });
  let s = g.next();
  while (!s.done) s = g.next();
  return performance.now() - t0;
}

describe('performance (D34: flop under 1.5 s at 4x CPU throttle)', () => {
  it('flop and river previews', () => {
    const cold = time('flop', 'Ah 7c', '7d Ks 2c');
    const warm = Array.from({ length: 5 }, () => time('flop', 'Qs Jd', 'Qh 9d 3d')).sort(
      (a, b) => a - b,
    );
    const river = time('river', 'As 7c', 'Kd 9h 5c 3s 2d');
    const median = warm[2]!;
    console.log(
      `[perf] flop cold ${cold.toFixed(1)} ms, warm median ${median.toFixed(1)} ms ` +
        `(node time × 4, estimate: ${(median * 4).toFixed(0)} ms); river ${river.toFixed(2)} ms`,
    );
    expect(median * 4).toBeLessThan(1500);
    expect(river * 4).toBeLessThan(100);
  });

  it('river dealer outs: 990 evaluations (22 spots x 45 unseen cards) under 50 ms', () => {
    const hole = parseCards('Qc 7d') as [Card, Card];
    const board = parseCards('Kd Jh 9s 5c 2d');
    riverFacts(hole, board); // warm
    const t0 = performance.now();
    let total = 0;
    for (let i = 0; i < 22; i++) total += riverFacts(hole, board).outs;
    const ms = performance.now() - t0;
    console.log(`[perf] riverFacts x22 ${ms.toFixed(2)} ms`);
    expect(total).toBe(22 * 19);
    expect(ms).toBeLessThan(50);
  });
});
