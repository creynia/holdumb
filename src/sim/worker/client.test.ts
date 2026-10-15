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
  it('runs a job end to end; stub jobs reject with their TODO', async () => {
    const client = createEvClient();
    await expect(client.run('preview', req)).rejects.toThrow(/TODO\(math\)/);
    expect(client.mode).toBe('inthread');
    client.dispose();
  });

  it('rejects superseded runs with the same key as AbortError', async () => {
    const client = createEvClient({ mode: 'inthread' });
    const first = client.run('preview', req, { key: 'preview' });
    const second = client.run('preview', { ...req, ante: 2000 }, { key: 'preview' });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).rejects.toThrow(/TODO\(math\)/);
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
    await expect(p).rejects.toThrow(/TODO\(math\)/); // re-run on the in-thread transport
    expect(client.mode).toBe('inthread');
    client.dispose();
  });

  it('falls back when the worker constructor throws', async () => {
    const client = createEvClient({
      createTransport: () => {
        throw new Error('no workers here');
      },
    });
    await expect(client.run('preview', req)).rejects.toThrow(/TODO\(math\)/);
    expect(client.mode).toBe('inthread');
  });
});
