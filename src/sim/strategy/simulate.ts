// WP0 stub (simulator.md §5.3). TODO(strategy) replaces the body.
import { todo } from '../engine/todo';
import type { Progress } from '../engine/job';
import type { SimulateRequest, SimulateResult } from './types';

export function simulateJob(
  _req: SimulateRequest,
): Generator<Progress | undefined, SimulateResult, void> {
  return todo('strategy', 'simulateJob');
}
