// I078 Watch: the table plays itself with perfect strategy, one readable hand at a time. Each
// decision takes the best option of the exact EV preview (D18: preflop table, flop worker, river
// on device; exact ties go to the smaller wager, decisions.md §3), so this is `perfect` play,
// never an estimate. Framework-free so the loop is tested without a DOM.
import type { Action, Street } from '../engine';
import type { DecisionPreview } from '../math';
import type { OptionKey } from '../scene';
import { OPTION_LABELS, optionKeyOf } from './text';

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

const isDecision = (s: Street): boolean => s === 'preflop' || s === 'flop' || s === 'river';

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

/**
 * Plays up to `hands` hands. A hand already in progress is finished first and counts as hand 1.
 * Stops at once on abort, when a deal is refused (not enough chips) or when a decision has no exact
 * EV (the loop never guesses). Pause holds it before the next move or deal.
 */
export async function runWatch(d: WatchDriver, o: WatchOptions): Promise<WatchResult> {
  const total = watchHands(o.hands);
  const anim = () => o.animMs?.() ?? 0;
  const pause = (ms: number) =>
    o.sleep(o.pace.overlap ? Math.max(anim(), ms) : anim() + ms, o.signal);
  let played = 0;
  const stopped = (): WatchResult => ({ played, end: 'stopped' });
  const held = async (): Promise<boolean> => {
    if (o.resume) await o.resume();
    return o.signal.aborted;
  };
  while (played < total) {
    if (await held()) return stopped();
    const hand = played + 1;
    const moves: OptionKey[] = [];
    if (!isDecision(d.view.state.street)) {
      const r = await d.act({ type: 'deal' });
      if (!r.ok) return { played, end: 'blocked', message: r.message };
    }
    o.onProgress?.({ hand, played, option: null, moves: [] });
    while (isDecision(d.view.state.street)) {
      // Readable pace: the move is named once the cards have landed.
      if (!o.pace.overlap) await o.sleep(anim(), o.signal);
      if (o.signal.aborted) return stopped();
      const pv = await d.currentPreview();
      if (o.signal.aborted) return stopped();
      const best = pv?.exact ? pv.options[pv.bestIndex] : undefined;
      if (!best) return { played, end: 'no-ev' };
      const key = optionKeyOf(best.action);
      o.onProgress?.({ hand, played, option: key, moves: [...moves] });
      await o.sleep(o.pace.overlap ? Math.max(anim(), o.pace.thinkMs) : o.pace.thinkMs, o.signal);
      if (await held()) return stopped();
      const r = await d.act(best.action);
      if (!r.ok) return { played, end: 'blocked', message: r.message };
      moves.push(key);
    }
    played++;
    o.onProgress?.({ hand, played, option: null, moves: [...moves] });
    if (played < total) await pause(o.pace.resultMs);
  }
  return { played, end: 'done' };
}
