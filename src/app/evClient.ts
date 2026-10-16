import { createEvClient } from '../sim';
import type { EvClient } from '../sim';

let client: EvClient | null = null;
/** One EV client per page, created on first use (the worker only starts when a screen needs it). */
export function getEvClient(): EvClient {
  return (client ??= createEvClient());
}
