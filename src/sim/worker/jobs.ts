import { previewJob } from '../math/preview';
import { simulateJob } from '../strategy/simulate';
import type { Job } from '../engine/job';
import type { EvJobs, JobKind } from './protocol';

/** Wires each job kind to its generator. Add a line per new kind in protocol.ts. */
export const JOBS: { [K in JobKind]: Job<EvJobs[K]['req'], EvJobs[K]['res']> } = {
  preview: previewJob,
  simulate: simulateJob,
};
