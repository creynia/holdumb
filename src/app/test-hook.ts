// Test hook: exposes the EV client to e2e. Required by tests/e2e/single-file.spec.ts.
// Clients are created on first access, so a cold load constructs no worker (I042).
import { parseCards } from '../sim/engine';
import { createEvClient } from '../sim/worker';
import type { EvClient } from '../sim';
import { getEvClient } from './evClient';

let inthread: EvClient | null = null;

window.__holdumb = {
  get client() {
    return getEvClient();
  },
  /** The in-thread fallback client, for perf specs (CDP CPU throttling does not reach workers). */
  get inthread() {
    return (inthread ??= createEvClient({ mode: 'inthread' }));
  },
  // Runs one river preview through the client: the round trip proves the transport, `mode` says
  // which one served it, and `settled` says whether the job resolved.
  async smoke() {
    const client = getEvClient();
    const [a, b, ...board] = parseCards('As Kd Qh Jc 2d 7s 9h') as [number, number, ...number[]];
    let settled: 'resolved' | 'rejected' = 'resolved';
    try {
      await client.run('preview', {
        street: 'river',
        hole: [a, b],
        board,
        blindPaytable: 'blind-standard',
        ante: 1000,
      });
    } catch {
      settled = 'rejected';
    }
    return { mode: client.mode, settled };
  },
};
