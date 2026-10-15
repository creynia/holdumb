// Single-file build: the worker is inlined as a string (worker.format 'iife' so it works on file://).
import EvWorker from './ev.worker.ts?worker&inline';
import { wrapWorker } from './transport-worker';
import type { TransportFactory } from './transport';

export const createTransport: TransportFactory = () => wrapWorker(new EvWorker());
