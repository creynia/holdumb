import { createEvClient } from '../sim/worker/client';
import type { EvClient } from '../sim/worker/protocol';

let client: EvClient | null = null;
/** One EV client per page, created on first use (the worker only starts when a screen needs it). */
export function getEvClient(): EvClient {
  return (client ??= createEvClient());
}
