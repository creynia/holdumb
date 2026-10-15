// Pages / PWA build: the worker is a separate emitted file (precached by the service worker).
import EvWorker from './ev.worker.ts?worker';
import { wrapWorker } from './transport-worker';
import type { TransportFactory } from './transport';

export const createTransport: TransportFactory = () => wrapWorker(new EvWorker());
