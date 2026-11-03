// I078 Watch: the table plays itself with perfect strategy, one readable hand at a time. Each
// decision takes the best option of the exact EV preview (D18: preflop table, flop worker, river
// on device; exact ties go to the smaller wager, decisions.md §3), so this is `perfect` play,
// never an estimate. Framework-free so the loop is tested without a DOM.
import type { Action, Street } from '../engine';
import type { DecisionPreview } from '../math';
import type { OptionKey } from '../scene';
import { optionKeyOf } from './text';

/** The most hands one Watch run plays (I078). */
export const WATCH_MAX_HANDS = 30;
export const WATCH_HAND_OPTIONS = [10, 20, 30] as const;

/** What the loop needs from the SimDriver (a structural subset, so tests can fake it). */
export interface WatchDriver {
  readonly view: { readonly state: { readonly street: Street } };
  act(a: Action): Promise<{ ok: true } | { ok: false; message: string }>;
  currentPreview(): Promise<DecisionPreview | null>;
}

export interface WatchPace {
  /** How long the chosen option stays highlighted before it is played. */
  thinkMs: number;
  /** How long a settled hand stays on the table before the next deal. */
  resultMs: number;
}

export type WatchEnd = 'done' | 'stopped' | 'no-ev' | 'blocked';

export interface WatchProgress {
  /** 1-based number of the hand on the table. */
  hand: number;
  /** Hands finished so far. */
  played: number;
  /** The option about to be played, or null between decisions. */
  option: OptionKey | null;
}

export interface WatchOptions {
  hands: number;
  pace: WatchPace;
  signal: AbortSignal;
  /** Resolves after `ms` (or early when the signal aborts). */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The current animation's length, so a pause starts once the cards have landed. */
  animMs?: () => number;
  onProgress?: (p: WatchProgress) => void;
}

export interface WatchResult {
  played: number;
  end: WatchEnd;
  /** The driver's message when a deal or a move was refused (e.g. not enough chips). */
  message?: string;
}

const isDecision = (s: Street): boolean => s === 'preflop' || s === 'flop' || s === 'river';

/** Clamps a requested hand count to 1…WATCH_MAX_HANDS. */
export function watchHands(n: number): number {
  return Math.max(1, Math.min(WATCH_MAX_HANDS, Math.floor(Number.isFinite(n) ? n : 1)));
}

/** The pause lengths for an animation speed. Reduced motion still gets a readable pause. */
export function watchPace(speed: 'normal' | 'fast' | 'instant'): WatchPace {
  return speed === 'normal' ? { thinkMs: 900, resultMs: 1800 } : { thinkMs: 500, resultMs: 1000 };
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

/**
 * Plays up to `hands` hands. A hand already in progress is finished first and counts as hand 1.
 * Stops at once on abort, when a deal is refused (not enough chips) or when a decision has no exact
 * EV (the loop never guesses).
 */
export async function runWatch(d: WatchDriver, o: WatchOptions): Promise<WatchResult> {
  const total = watchHands(o.hands);
  const anim = () => o.animMs?.() ?? 0;
  let played = 0;
  const stopped = (): WatchResult => ({ played, end: 'stopped' });
  while (played < total) {
    if (o.signal.aborted) return stopped();
    const hand = played + 1;
    if (!isDecision(d.view.state.street)) {
      const r = await d.act({ type: 'deal' });
      if (!r.ok) return { played, end: 'blocked', message: r.message };
    }
    o.onProgress?.({ hand, played, option: null });
    while (isDecision(d.view.state.street)) {
      await o.sleep(anim(), o.signal);
      if (o.signal.aborted) return stopped();
      const pv = await d.currentPreview();
      if (o.signal.aborted) return stopped();
      const best = pv?.exact ? pv.options[pv.bestIndex] : undefined;
      if (!best) return { played, end: 'no-ev' };
      o.onProgress?.({ hand, played, option: optionKeyOf(best.action) });
      await o.sleep(o.pace.thinkMs, o.signal);
      if (o.signal.aborted) return stopped();
      const r = await d.act(best.action);
      if (!r.ok) return { played, end: 'blocked', message: r.message };
    }
    played++;
    o.onProgress?.({ hand, played, option: null });
    if (played < total) await o.sleep(anim() + o.pace.resultMs, o.signal);
  }
  return { played, end: 'done' };
}
