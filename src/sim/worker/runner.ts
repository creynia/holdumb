import type { Job, Progress } from '../engine/job';

export interface RunOptions {
  /** Time slice before yielding to the event loop (ms). */
  sliceMs: number;
  onProgress?: (p: Progress) => void;
  isCancelled?: () => boolean;
  /** Yields to the event loop. Default: setTimeout(0). */
  yieldFn?: () => Promise<void>;
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

const defaultYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Steps a generator job in time slices, yielding to the event loop between slices so `cancel`
 * messages and UI frames get through. Shared by both transports.
 */
export async function runSliced<Req, Res>(
  job: Job<Req, Res>,
  req: Req,
  { sliceMs, onProgress, isCancelled, yieldFn = defaultYield }: RunOptions,
): Promise<Res> {
  const gen = job(req);
  let sliceStart = Date.now();
  for (;;) {
    if (isCancelled?.()) throw new CancelledError();
    const step = gen.next();
    if (step.done) return step.value;
    if (step.value) onProgress?.(step.value);
    if (Date.now() - sliceStart >= sliceMs) {
      await yieldFn();
      sliceStart = Date.now();
    }
  }
}
