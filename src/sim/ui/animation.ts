// Animation timing (simulator.md 3.5). The engine resolves instantly; this only decides when the
// visuals appear. `instant` (or OS reduced motion) yields zero delays and an empty timeline.
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { GameEvent } from '../engine';

export type Speed = 'normal' | 'fast' | 'instant';

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** OS reduced motion forces instant; otherwise the user's setting (default normal). */
export function effectiveSpeed(
  setting: Speed | undefined,
  reducedMotion: boolean = prefersReducedMotion(),
): Speed {
  return reducedMotion ? 'instant' : (setting ?? 'normal');
}

interface Timing {
  deal: number;
  flop: number;
  turnRiver: number;
  reveal: number;
  chips: number;
  /** Duration of one card's own fade/flip. */
  card: number;
}
const TIMING: Record<Exclude<Speed, 'instant'>, Timing> = {
  normal: { deal: 180, flop: 150, turnRiver: 200, reveal: 400, chips: 400, card: 220 },
  fast: { deal: 80, flop: 70, turnRiver: 90, reveal: 180, chips: 180, card: 110 },
};

export interface SlotDelays {
  player: [number, number];
  dealer: [number, number];
  flop: [number, number, number];
  turn: number;
  river: number;
  /** When the dealer's cards flip (after any board cards in the same step). */
  reveal: [number, number];
  /** When chips start moving. */
  chips: number;
}
export interface Timeline {
  delays: SlotDelays;
  /** One card's own animation length in ms. */
  cardMs: number;
  totalMs: number;
}

const ZERO: SlotDelays = {
  player: [0, 0],
  dealer: [0, 0],
  flop: [0, 0, 0],
  turn: 0,
  river: 0,
  reveal: [0, 0],
  chips: 0,
};

/** Builds the card timeline from the events of one action. Instant gives all zeros. */
export function buildTimeline(events: readonly GameEvent[], speed: Speed): Timeline {
  if (speed === 'instant') return { delays: { ...ZERO }, cardMs: 0, totalMs: 0 };
  const T = TIMING[speed];
  const d: SlotDelays = { ...ZERO, flop: [0, 0, 0], player: [0, 0], dealer: [0, 0] };
  let t = 0;
  for (const e of events) {
    if (e.type === 'player-dealt') {
      d.player = [t, t + T.deal];
      t += 2 * T.deal;
    } else if (e.type === 'dealer-dealt') {
      d.dealer = [t, t + T.deal];
      t += 2 * T.deal;
    } else if (e.type === 'board-dealt') {
      if (e.street === 'flop') {
        d.flop = [t, t + T.flop, t + 2 * T.flop];
        t += 3 * T.flop;
      } else {
        d.turn = t;
        d.river = t + T.turnRiver;
        t += 2 * T.turnRiver;
      }
    } else if (e.type === 'dealer-revealed') {
      d.reveal = [t, t + T.reveal / 4];
      t += T.reveal;
    } else if (e.type === 'wager-settled' && d.chips === 0) {
      d.chips = t;
    }
  }
  const hasChips = events.some((e) => e.type === 'wager-settled');
  if (hasChips) t += T.chips;
  return { delays: d, cardMs: T.card, totalMs: t };
}

/**
 * Tracks whether a timeline is still playing. Any tap can call `skip()`, which flushes the visuals
 * at once (the engine state is already final). A new `key` restarts it.
 */
export function useSkippableMotion(key: unknown, totalMs: number) {
  const [skippedKey, setSkippedKey] = useState<unknown>(null);
  const [doneKey, setDoneKey] = useState<unknown>(null);
  useEffect(() => {
    if (totalMs <= 0) return;
    const h = setTimeout(() => setDoneKey(key), totalMs + 50);
    return () => clearTimeout(h);
  }, [key, totalMs]);
  const skip = useCallback(() => setSkippedKey(key), [key]);
  const skipped = skippedKey === key;
  const playing = totalMs > 0 && !skipped && doneKey !== key;
  return { playing, skipped, skip };
}
