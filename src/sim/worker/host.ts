import { JOBS } from './jobs';
import { PROTOCOL_VERSION } from './protocol';
import type { FromWorker, JobKind, ToWorker } from './protocol';
import { CancelledError, runSliced } from './runner';
import type { Job } from '../engine/job';

export interface HostOptions {
  sliceMs: number;
  yieldFn?: () => Promise<void>;
}

/**
 * The message handler behind both transports: the Web Worker feeds it `onmessage` data and
 * posts `send`; the in-thread transport calls it directly.
 */
export function createHost(send: (m: FromWorker) => void, opts: HostOptions) {
  const cancelled = new Set<number>();
  return function handle(msg: ToWorker): void {
    if (msg.t === 'ping') {
      send({ t: 'pong', version: PROTOCOL_VERSION });
    } else if (msg.t === 'cancel') {
      cancelled.add(msg.id);
    } else {
      const { id, kind, req } = msg;
      const job = (JOBS as Record<JobKind, Job<unknown, unknown>>)[kind];
      void runSliced(job, req, {
        sliceMs: opts.sliceMs,
        yieldFn: opts.yieldFn,
        isCancelled: () => cancelled.has(id),
        onProgress: (p) => send({ t: 'progress', id, p }),
      })
        .then((res) => send({ t: 'done', id, res }))
        .catch((e: unknown) => {
          if (e instanceof CancelledError) return; // the client already rejected it
          send({ t: 'error', id, message: e instanceof Error ? e.message : String(e) });
        })
        .finally(() => cancelled.delete(id));
    }
  };
}
