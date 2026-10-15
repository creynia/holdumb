import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine/cards';
import { previewJob } from './preview';
import { toRatio } from './fraction';
import type { DecisionPreview, PreviewRequest } from './types';

function run(req: PreviewRequest): DecisionPreview {
  const g = previewJob(req);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}
const river = (hole: string, board: string): PreviewRequest => ({
  street: 'river',
  hole: parseCards(hole) as [number, number],
  board: parseCards(board),
  blindPaytable: 'blind-standard',
  ante: 1000,
});

describe('river examples', () => {
  it('A7 ace-high', () => {
    const p = run(river('As 7c', 'Kd 9h 5c 3s 2d'));
    expect(p.options.map((o) => toRatio(o.ev))).toEqual(['-1663/990', '-2']);
  });
});
describe('flop example', () => {
  it('A7 on 7K2', () => {
    const t0 = performance.now();
    const p = run({
      street: 'flop',
      hole: parseCards('Ah 7c') as [number, number],
      board: parseCards('7d Ks 2c'),
      blindPaytable: 'blind-standard',
      ante: 1000,
    });
    console.log('flop ms', performance.now() - t0);
    expect(p.options.map((o) => toRatio(o.ev))).toEqual(['178661/178365', '93143/178365']);
  });
});
