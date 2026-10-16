import { describe, expect, it } from 'vitest';
import { createEvClient } from './client';
import type { PreviewRequest } from '../math/types';
import type { Transport } from './transport';

const req: PreviewRequest = {
  street: 'river',
  hole: [51, 46],
  board: [40, 36, 30, 24, 20],
  blindPaytable: 'blind-standard',
  ante: 1000,
};

describe('EvClient (in-thread transport via the vitest alias)', () => {
  it('runs a job end to end', async () => {
    const client = createEvClient();
    const res = await client.run('preview', req);
    expect(res.street).toBe('river');
    expect(res.options).toHaveLength(2);
    expect(res.options[0]!.ev.den).toBeGreaterThan(0n);
    expect(client.mode).toBe('inthread');
    client.dispose();
  });

  it('rejects superseded runs with the same key as AbortError', async () => {
    const client = createEvClient({ mode: 'inthread' });
    const first = client.run('preview', req, { key: 'preview' });
    const second = client.run('preview', { ...req, ante: 2000 }, { key: 'preview' });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toMatchObject({ street: 'river' });
    client.dispose();
  });

  it('rejects on an aborted signal', async () => {
    const client = createEvClient({ mode: 'inthread' });
    const ac = new AbortController();
    ac.abort();
    await expect(client.run('preview', req, { signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    client.dispose();
  });

  it('falls back to in-thread when the worker never answers the ping', async () => {
    const silent: Transport = {
      kind: 'worker',
      post: () => undefined,
      onMessage: () => undefined,
      onError: () => undefined,
      terminate: () => undefined,
    };
    const client = createEvClient({ createTransport: () => silent, pingTimeoutMs: 20 });
    const p = client.run('preview', req);
    await expect(p).resolves.toMatchObject({ street: 'river' }); // re-run on the in-thread transport
    expect(client.mode).toBe('inthread');
    client.dispose();
  });

  it('falls back when the worker constructor throws', async () => {
    const client = createEvClient({
      createTransport: () => {
        throw new Error('no workers here');
      },
    });
    await expect(client.run('preview', req)).resolves.toMatchObject({ street: 'river' });
    expect(client.mode).toBe('inthread');
  });

  it('runs the chunked flop job with progress, and cancels it', async () => {
    const client = createEvClient({ mode: 'inthread' });
    const flop: PreviewRequest = { ...req, street: 'flop', hole: [26, 8], board: [24, 45, 3] };
    const seen: number[] = [];
    const res = await client.run('preview', flop, { onProgress: (p) => seen.push(p.done) });
    expect(res.showdowns).toBe(1_070_190);
    expect(seen.length).toBeGreaterThan(5);
    const ac = new AbortController();
    const slow = client.run('preview', { ...flop, ante: 2000 }, { signal: ac.signal });
    ac.abort();
    await expect(slow).rejects.toMatchObject({ name: 'AbortError' });
    client.dispose();
  });
});
