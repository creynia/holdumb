// Worker entry. Plain-data messages only (architecture.md §4.1).
import { applySixCard } from '../engine/sixcard';
import { provideSixCardRule } from '../strategy/simulate';
import { createHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

interface WorkerScope {
  postMessage(m: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
// I062: the worker bundle carries the Six Card rule itself (it is lazy on the main thread).
provideSixCardRule(applySixCard);
const scope = self as unknown as WorkerScope;
const handle = createHost((m) => scope.postMessage(m), { sliceMs: 50 });
scope.onmessage = (e) => handle(e.data);
