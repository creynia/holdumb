import type { FromWorker, ToWorker } from './protocol';

export interface Transport {
  readonly kind: 'worker' | 'inthread';
  post(msg: ToWorker): void;
  onMessage(cb: (m: FromWorker) => void): void;
  /** Worker script failed to load/run, or similar. Fires at most a few times. */
  onError(cb: (reason: string) => void): void;
  terminate(): void;
}
export type TransportFactory = () => Transport;
