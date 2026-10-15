import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './protocol';
import type { EvJobs, FromWorker, ToWorker } from './protocol';
import { canonicalJson } from './client';
import type { DecisionPreview, Fraction } from '../math/types';
import type { SimulateResult } from '../strategy/types';

const f = (num: bigint, den: bigint): Fraction => ({ num, den });

// Every payload type must survive structuredClone (bigint, typed arrays, no class instances).
describe('protocol payloads survive structuredClone', () => {
  it('DecisionPreview with bigint fractions', () => {
    const preview: EvJobs['preview']['res'] = {
      street: 'river',
      options: [
        {
          action: { type: 'play', multiple: 1 },
          label: 'Bet 1x',
          ev: f(-23n, 90n),
          evCents: f(-230n, 9n),
          regret: f(0n, 1n),
          tier: 'best',
          assumesBestLater: false,
          why: {
            rows: [
              {
                id: 'win-q',
                label: 'You win, dealer qualifies',
                count: 611n,
                outOf: 990n,
                probability: f(611n, 990n),
                netAnte: f(2n, 1n),
                contribution: f(611n, 495n),
              },
            ],
            casesLabel: 'dealer hands',
            formula: '611/990 x 2 = ...',
          },
        },
      ],
      bestIndex: 0,
      exact: true,
      source: 'enumeration',
      showdowns: 990,
    } satisfies DecisionPreview;
    expect(structuredClone(preview)).toEqual(preview);
  });

  it('SimulateResult with typed arrays', () => {
    const result: SimulateResult = {
      series: [
        {
          strategy: { id: 'basic', ante: 1000, trips: 0 },
          equity: Int32Array.from([50000, 49000]),
          expected: Float64Array.from([50000, 49976.1]),
          finals: Int32Array.from([49000]),
          meanFinal: 49000,
          meanFinalCi95: 0,
          bustRate: 0,
          probAhead: 0,
          handsPlayed: 1,
          outcomes: { win: 0, lose: 1, tie: 0, fold: 0 },
          byCategory: new Int32Array(10),
          blindBonusHits: 0,
          tripsHits: 0,
        },
      ],
      ms: 1,
    };
    const clone = structuredClone(result);
    expect(clone).toEqual(result);
    expect(clone.series[0]?.equity).toBeInstanceOf(Int32Array);
  });

  it('messages', () => {
    const msgs: (ToWorker | FromWorker)[] = [
      { t: 'ping' },
      { t: 'run', id: 1, kind: 'preview', req: { hole: [1, 2] } },
      { t: 'cancel', id: 1 },
      { t: 'pong', version: PROTOCOL_VERSION },
      { t: 'progress', id: 1, p: { done: 1, total: 2 } },
      { t: 'done', id: 1, res: { num: 1n, den: 2n } },
      { t: 'error', id: 1, message: 'x' },
    ];
    for (const m of msgs) expect(structuredClone(m)).toEqual(m);
  });

  it('canonicalJson is bigint-safe and key-order independent', () => {
    expect(canonicalJson({ b: 1n, a: [1, 2] })).toBe(canonicalJson({ a: [1, 2], b: 1n }));
    expect(canonicalJson({ a: 1n })).not.toBe(canonicalJson({ a: 2n }));
  });
});
