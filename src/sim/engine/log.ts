import { applyAction, replay } from './game';
import type { Action, ApplyResult, GameState, LogEntry } from './types';

/** Applies an action and appends it to the log when it succeeds. */
export function applyLogged(
  state: GameState,
  log: readonly LogEntry[],
  action: Action,
): { result: ApplyResult; log: readonly LogEntry[] } {
  const result = applyAction(state, action);
  if (!result.ok) return { result, log };
  return { result, log: [...log, { seq: log.length + 1, action, events: result.events }] };
}

/** Rebuilds the state from the initial state and a log. */
export function replayLog(initial: GameState, log: readonly LogEntry[]): GameState {
  return replay(
    initial,
    log.map((e) => e.action),
  );
}
