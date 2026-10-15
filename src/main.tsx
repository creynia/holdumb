import { render } from 'preact';
import './app/styles/tokens.css';
import { createEvClient } from './sim/worker';
import { parseCards } from './sim/engine';

// WP0 shell. TODO(app) replaces it with the real app (router, store, screens).
const client = createEvClient();
window.__holdumb = {
  client,
  // Runs one river preview through the client. The job is a stub until the math WP lands, so
  // it may reject; either way the round trip proves the transport, and `mode` says which one.
  async smoke() {
    const [a, b, ...board] = parseCards('As Kd Qh Jc 2d 7s 9h') as [
      number,
      number,
      ...number[],
    ];
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

render(
  <main>
    <h1>holdumb</h1>
    <p>Ultimate Texas Hold&apos;em, from zero to perfect strategy. Under construction.</p>
  </main>,
  document.getElementById('app')!,
);
