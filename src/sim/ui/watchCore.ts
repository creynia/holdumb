// I078 Watch, the small part the first paint needs: limits, pacing, narration and the shared types.
// The loop itself (watch.ts) is loaded only when Watch starts, to keep the first-paint JS in budget.
import type { Action, Street } from '../engine';
import type { DecisionPreview } from '../math';
import type { OptionKey } from '../scene';
import { OPTION_LABELS } from './text';

/** The most hands one Watch run plays (I078). */
export const WATCH_MAX_HANDS = 30;
export const WATCH_HAND_OPTIONS = [3, 10, 30] as const;
export const WATCH_DEFAULT_HANDS = 10;

/** What the loop needs from the SimDriver (a structural subset, so tests can fake it). */
export interface WatchDriver {
  readonly view: { readonly state: { readonly street: Street } };
  act(a: Action): Promise<{ ok: true } | { ok: false; message: string }>;
  currentPreview(): Promise<DecisionPreview | null>;
  /** Marks the hands as watched, so they stay out of the learner's own record (AC2). */
  setWatching?(on: boolean): void;
}

export interface WatchPace {
  /** How long the chosen option stays highlighted before it is played. */
  thinkMs: number;
  /** How long a settled hand stays on the table before the next deal. */
  resultMs: number;
  /**
   * false: each pause starts once the cards have landed (animation + pause), the readable pace.
   * true: a pause overlaps the animation (the longer of the two), so fast runs stay short.
   */
  overlap: boolean;
}

export type WatchEnd = 'done' | 'stopped' | 'no-ev' | 'blocked';

export interface WatchProgress {
  /** 1-based number of the hand on the table. */
  hand: number;
  /** Hands finished so far. */
  played: number;
  /** The option about to be played, or null between decisions. */
  option: OptionKey | null;
  /** The options played so far in this hand, in order. */
  moves: readonly OptionKey[];
}

export interface WatchOptions {
  hands: number;
  pace: WatchPace;
  signal: AbortSignal;
  /** Resolves after `ms` (or early when the signal aborts). */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The current animation's length, so a pause starts once the cards have landed. */
  animMs?: () => number;
  /** Resolves when the run may go on (Pause holds it here; abort must also resolve it). */
  resume?: () => Promise<void>;
  onProgress?: (p: WatchProgress) => void;
}

export interface WatchResult {
  played: number;
  end: WatchEnd;
  /** The driver's message when a deal or a move was refused (e.g. not enough chips). */
  message?: string;
}

/** Clamps a requested hand count to 1…WATCH_MAX_HANDS. */
export function watchHands(n: number): number {
  return Math.max(1, Math.min(WATCH_MAX_HANDS, Math.floor(Number.isFinite(n) ? n : 1)));
}

/**
 * The pauses for an animation speed (review ruling AC4). Normal keeps the readable 900 ms / 1.8 s
 * after the cards land; fast overlaps short pauses with the animation so 30 hands take well under
 * 45 s; instant (also OS reduced motion) is near-instant.
 */
export function watchPace(speed: 'normal' | 'fast' | 'instant'): WatchPace {
  if (speed === 'normal') return { thinkMs: 900, resultMs: 1800, overlap: false };
  if (speed === 'fast') return { thinkMs: 150, resultMs: 300, overlap: true };
  return { thinkMs: 30, resultMs: 60, overlap: true };
}

/** "Hand 3 of 30: Check, then Bet 2x." — one spoken line per watched hand. */
export function watchNarration(hand: number, of: number, moves: readonly OptionKey[]): string {
  const said = moves.map((k) => OPTION_LABELS[k]).join(', then ');
  return `Hand ${hand} of ${of}: ${said || 'dealt'}.`;
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const done = () => {
      clearTimeout(h);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const h = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });
}
