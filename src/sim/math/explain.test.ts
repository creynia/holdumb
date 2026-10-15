import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine/cards';
import { riverPreview } from './preview';
import type { Card } from '../engine/types';

describe('why formulas', () => {
  const p = riverPreview({
    street: 'river',
    hole: parseCards('As 7c') as [Card, Card],
    board: parseCards('Kd 9h 5c 3s 2d'),
    blindPaytable: 'blind-standard',
    ante: 1000,
  });
  it('river raise formula is exact and readable', () => {
    expect(p.options[0]!.why.formula).toBe(
      '14/45 \u00d7 1 + 125/198 \u00d7 (\u22123) + 8/165 \u00d7 (\u22122) = \u22121663/990 \u2248 \u22121.680 antes',
    );
    expect(p.options[0]!.why.casesLabel).toBe('dealer hands');
  });
  it('fold formula', () => {
    expect(p.options[1]!.why.formula).toBe('1 × (−2) = −2 ≈ −2.000 antes');
  });
});
