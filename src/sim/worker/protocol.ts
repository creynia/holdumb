// ===== src/sim/worker/protocol.ts — FROZEN (architecture.md §4.2). New job kinds go through main. =====
import type { DecisionPreview, PreviewRequest } from '../math/types';
import type { SimulateRequest, SimulateResult } from '../strategy/types';
import type { Progress } from '../engine/job';

export type { Progress, Job } from '../engine/job'; // WP0: defined in engine so math/strategy can use them

export const PROTOCOL_VERSION = 1;

export interface EvJobs {
  preview: { req: PreviewRequest; res: DecisionPreview }; // EV of every option at a decision
  simulate: { req: SimulateRequest; res: SimulateResult }; // auto-play / multi-session runs
  // more kinds may be added by contract extension (message main first)
}
export type JobKind = keyof EvJobs;

export type ToWorker =
  | { t: 'ping' }
  | { t: 'run'; id: number; kind: JobKind; req: unknown }
  | { t: 'cancel'; id: number };
export type FromWorker =
  | { t: 'pong'; version: number }
  | { t: 'progress'; id: number; p: Progress }
  | { t: 'done'; id: number; res: unknown }
  | { t: 'error'; id: number; message: string };

export interface EvClient {
  run<K extends JobKind>(
    kind: K,
    req: EvJobs[K]['req'],
    opts?: { key?: string; signal?: AbortSignal; onProgress?: (p: Progress) => void },
  ): Promise<EvJobs[K]['res']>; // rejects with AbortError when superseded or aborted
  readonly mode: 'worker' | 'inthread';
  dispose(): void;
}
