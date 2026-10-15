// WP0 stub: signatures from simulator.md §1.2. TODO(engine) replaces the bodies.
import { todo } from './todo';
import type {
  Action,
  ApplyResult,
  Cents,
  DecisionStreet,
  ForcedDeal,
  GameState,
  PlayMultiple,
  TableRules,
  VisibleView,
} from './types';

export interface CreateGameOptions {
  rules?: Partial<TableRules>;
  bankroll?: Cents; // default 50_000
  seed?: number; // UI seeds once from crypto.getRandomValues
  bets?: { ante?: Cents; trips?: Cents };
  forcedDeals?: ForcedDeal[];
  /** Start mid-hand (lessons, drill "play it out", ?street= URLs). Deal must cover the visible cards. */
  startAt?: { street: DecisionStreet; deal: ForcedDeal; play?: PlayMultiple };
}

export function createGame(_opts?: CreateGameOptions): GameState {
  return todo('engine', 'createGame');
}
export function applyAction(_state: GameState, _action: Action): ApplyResult {
  return todo('engine', 'applyAction');
}
export function replay(_initial: GameState, _actions: readonly Action[]): GameState {
  return todo('engine', 'replay');
}
export function visibleView(_state: GameState): VisibleView {
  return todo('engine', 'visibleView');
}
export function equity(_state: GameState): Cents {
  return todo('engine', 'equity');
}
export function legalActions(_state: GameState): Action[] {
  return todo('engine', 'legalActions');
}
