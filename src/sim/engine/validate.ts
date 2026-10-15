// WP0 stub (simulator.md §1.4). TODO(engine) replaces the body.
import { todo } from './todo';
import type { Action, GameState, Validation } from './types';

export function validateAction(_state: GameState, _action: Action): Validation {
  return todo('engine', 'validateAction');
}
