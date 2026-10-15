import { describe, expect, it } from 'vitest';
import { CancelledError, runSliced } from './runner';
import type { Progress } from '../engine/job';

function* count(n: number): Generator<Progress | undefined, number, void> {
  for (let i = 0; i < n; i++) yield { done: i, total: n };
  return n;
}

describe('runSliced', () => {
  it('returns the result and reports progress', async () => {
    const seen: number[] = [];
    const res = await runSliced(count, 5, { sliceMs: 1000, onProgress: (p) => seen.push(p.done) });
    expect(res).toBe(5);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });
  it('yields to the event loop between slices and honours cancel', async () => {
    let yields = 0;
    let cancelled = false;
    const p = runSliced(count, 1_000_000, {
      sliceMs: 0,
      isCancelled: () => cancelled,
      yieldFn: () => {
        yields++;
        if (yields === 3) cancelled = true;
        return Promise.resolve();
      },
    });
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(yields).toBe(3);
  });
});
