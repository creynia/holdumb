/**
 * Long jobs (math, strategy) are synchronous generators that yield progress every few thousand
 * evaluations (architecture.md §4.1). The types live in the lowest layer so math and strategy
 * can name them without importing the worker; worker/protocol.ts re-exports Progress.
 */
export interface Progress {
  done: number;
  total: number;
}
export type Job<Req, Res> = (req: Req) => Generator<Progress | undefined, Res, void>;
