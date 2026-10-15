import type { Transport } from './transport';
import type { FromWorker, ToWorker } from './protocol';

/** Wraps a real Worker (either build flavour). */
export function wrapWorker(w: Worker): Transport {
  return {
    kind: 'worker',
    post: (msg: ToWorker) => w.postMessage(msg),
    onMessage: (cb) => {
      w.addEventListener('message', (e: MessageEvent<FromWorker>) => cb(e.data));
    },
    onError: (cb) => {
      w.addEventListener('error', (e) => cb(e.message || 'worker error'));
      w.addEventListener('messageerror', () => cb('worker messageerror'));
    },
    terminate: () => w.terminate(),
  };
}
