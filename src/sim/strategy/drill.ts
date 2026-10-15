// WP0 stub (simulator.md §5.2 drill.ts). TODO(strategy) replaces the bodies.
import { todo } from '../engine/todo';
import type { RngState } from '../engine/types';
import type { DrillFilter, DrillSpot } from './types';

export function nextSpot(_rng: RngState, _filter: DrillFilter): [DrillSpot, RngState] {
  return todo('strategy', 'nextSpot');
}
export function spotCode(_spot: Omit<DrillSpot, 'code'>): string {
  return todo('strategy', 'spotCode');
}
export function spotFromCode(_code: string): DrillSpot {
  return todo('strategy', 'spotFromCode');
}
