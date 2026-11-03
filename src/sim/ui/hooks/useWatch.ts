// I078 Watch: runs the perfect-play loop (watch.ts) against the Simulator's driver and keeps the
// state the table needs: whether it is running or paused, the hand on the table, the option about
// to be played (highlighted on the ActionBar) and the moves of the hand (narrated once it settles).
// Marks the driver's hands as watched while it runs. Stops on Stop, on unmount and at the end.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OptionKey } from '../../scene';
import { sleep, watchHands } from '../watchCore';
import type { WatchDriver, WatchEnd, WatchPace } from '../watchCore';

export interface WatchState {
  running: boolean;
  paused: boolean;
  /** Hands requested for the current (or last) run. */
  of: number;
  hand: number;
  played: number;
  option: OptionKey | null;
  /** Options played so far in the hand on the table. */
  moves: readonly OptionKey[];
  /** How the last run ended (null before the first run and while running). */
  end: WatchEnd | null;
  message?: string;
}

export interface WatchHandle extends WatchState {
  start: (hands: number) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

const IDLE: WatchState = {
  running: false,
  paused: false,
  of: 0,
  hand: 0,
  played: 0,
  option: null,
  moves: [],
  end: null,
};

export function useWatch(
  d: WatchDriver,
  pace: WatchPace,
  animMs: () => number,
  /** For tests: the pause function (defaults to a real timer). */
  wait: typeof sleep = sleep,
): WatchHandle {
  const [s, setS] = useState<WatchState>(IDLE);
  const ac = useRef<AbortController | null>(null);
  const hold = useRef<{ paused: boolean; waiters: (() => void)[] }>({ paused: false, waiters: [] });
  const latest = useRef({ pace, animMs });
  latest.current = { pace, animMs };

  const release = () => {
    hold.current.paused = false;
    const w = hold.current.waiters;
    hold.current.waiters = [];
    w.forEach((f) => f());
  };
  const finish = (ctl: AbortController, patch: Partial<WatchState>) => {
    // A run that was stopped (and maybe replaced by a new one) no longer owns the state.
    if (ac.current !== ctl) return;
    ac.current = null;
    release();
    d.setWatching?.(false);
    setS((cur) => ({ ...cur, running: false, paused: false, option: null, ...patch }));
  };
  const stop = () => {
    const ctl = ac.current;
    if (!ctl) return;
    ctl.abort();
    finish(ctl, { end: 'stopped' });
  };
  useEffect(() => () => stop(), []);

  const start = (hands: number) => {
    if (ac.current) return;
    const ctl = new AbortController();
    ac.current = ctl;
    const of = watchHands(hands);
    d.setWatching?.(true);
    setS({ ...IDLE, running: true, of, hand: 1 });
    // The loop is loaded on demand (first-paint budget); Stop before it arrives just ends the run.
    void import('../watch')
      .then(({ runWatch }) => {
        if (ctl.signal.aborted) return { played: 0, end: 'stopped' as const };
        return runWatch(d, {
          hands: of,
          pace: latest.current.pace,
          signal: ctl.signal,
          sleep: wait,
          animMs: () => latest.current.animMs(),
          resume: () =>
            hold.current.paused && !ctl.signal.aborted
              ? new Promise<void>((r) => hold.current.waiters.push(r))
              : Promise.resolve(),
          onProgress: (p) => {
            if (!ctl.signal.aborted) setS((cur) => ({ ...cur, ...p }));
          },
        });
      })
      .then(
        (r) => finish(ctl, { played: r.played, end: r.end, message: r.message }),
        () => finish(ctl, { end: 'blocked' }),
      );
  };
  const pause = () => {
    if (!ac.current || hold.current.paused) return;
    hold.current.paused = true;
    setS((cur) => ({ ...cur, paused: true }));
  };
  const resume = () => {
    if (!hold.current.paused) return;
    release();
    setS((cur) => ({ ...cur, paused: false }));
  };
  return { ...s, start, stop, pause, resume };
}
