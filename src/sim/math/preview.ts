// WP0 stub (simulator.md §2.3). TODO(math) replaces the body. Generator: yields progress.
import { todo } from '../engine/todo';
import type { DecisionPreview, PreviewRequest } from './types';
import type { Progress } from '../engine/job';

export function previewJob(
  _req: PreviewRequest,
): Generator<Progress | undefined, DecisionPreview, void> {
  return todo('math', 'previewJob');
}
