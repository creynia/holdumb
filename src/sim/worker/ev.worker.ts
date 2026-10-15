// Worker entry. Plain-data messages only (architecture.md §4.1).
import { createHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

interface WorkerScope {
  postMessage(m: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const handle = createHost((m) => scope.postMessage(m), { sliceMs: 50 });
scope.onmessage = (e) => handle(e.data);
