// I078 Watch: runs the perfect-play loop (watch.ts) against the Simulator's driver and keeps the
// state the table needs: whether it is running, the hand on the table and the option about to be
// played (highlighted on the ActionBar). Stops on Stop, on unmount and when the loop ends.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OptionKey } from '../../scene';
import { runWatch, sleep, watchHands } from '../watch';
import type { WatchDriver, WatchEnd, WatchPace } from '../watch';

export interface WatchState {
  running: boolean;
  /** Hands requested for the current (or last) run. */
  of: number;
  hand: number;
  played: number;
  option: OptionKey | null;
  /** How the last run ended (null before the first run and while running). */
  end: WatchEnd | null;
  message?: string;
}

export interface WatchHandle extends WatchState {
  start: (hands: number) => void;
  stop: () => void;
}

const IDLE: WatchState = { running: false, of: 0, hand: 0, played: 0, option: null, end: null };

export function useWatch(
  d: WatchDriver,
  pace: WatchPace,
  animMs: () => number,
  /** For tests: the pause function (defaults to a real timer). */
  pause: typeof sleep = sleep,
): WatchHandle {
  const [s, setS] = useState<WatchState>(IDLE);
  const ac = useRef<AbortController | null>(null);
  const latest = useRef({ pace, animMs });
  latest.current = { pace, animMs };
  useEffect(() => () => ac.current?.abort(), []);

  const start = (hands: number) => {
    if (ac.current) return;
    const ctl = new AbortController();
    ac.current = ctl;
    const of = watchHands(hands);
    setS({ running: true, of, hand: 1, played: 0, option: null, end: null });
    void runWatch(d, {
      hands: of,
      pace: latest.current.pace,
      signal: ctl.signal,
      sleep: pause,
      animMs: () => latest.current.animMs(),
      onProgress: (p) => {
        if (!ctl.signal.aborted) setS((cur) => ({ ...cur, ...p }));
      },
    }).then(
      (r) => {
        // A run that was stopped (and maybe replaced by a new one) no longer owns the state.
        if (ac.current !== ctl) return;
        ac.current = null;
        setS((cur) => ({
          ...cur,
          running: false,
          option: null,
          played: r.played,
          end: r.end,
          message: r.message,
        }));
      },
      () => {
        if (ac.current !== ctl) return;
        ac.current = null;
        setS((cur) => ({ ...cur, running: false, option: null, end: 'blocked' }));
      },
    );
  };
  const stop = () => {
    ac.current?.abort();
    ac.current = null;
    setS((cur) => (cur.running ? { ...cur, running: false, option: null, end: 'stopped' } : cur));
  };
  return { ...s, start, stop };
}
