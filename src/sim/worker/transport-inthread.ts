// No worker: runs the host on the main thread with short slices. Used by Vitest and as the
// runtime fallback when workers are blocked (WebViews, embedding hosts).
import { createHost } from './host';
import type { FromWorker } from './protocol';
import type { Transport, TransportFactory } from './transport';

function messageChannelYield(): () => Promise<void> {
  if (typeof MessageChannel === 'undefined') {
    return () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const { port1, port2 } = new MessageChannel();
  const waiting: (() => void)[] = [];
  port1.onmessage = () => waiting.shift()?.();
  (port1 as unknown as { unref?: () => void }).unref?.(); // don't keep Node alive
  return () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
      port2.postMessage(0);
    });
}

export const createTransport: TransportFactory = (): Transport => {
  const listeners: ((m: FromWorker) => void)[] = [];
  const handle = createHost((m) => listeners.forEach((l) => l(m)), {
    sliceMs: 8,
    yieldFn: messageChannelYield(),
  });
  let dead = false;
  return {
    kind: 'inthread',
    // Replies are asynchronous, as with a real worker.
    post: (msg) => {
      queueMicrotask(() => {
        if (!dead) handle(msg);
      });
    },
    onMessage: (cb) => {
      listeners.push(cb);
    },
    onError: () => {
      /* cannot fail to start */
    },
    terminate: () => {
      dead = true;
    },
  };
};
