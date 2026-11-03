// I078 Watch: the table plays itself with perfect strategy, one readable hand at a time. Each
// decision takes the best option of the exact EV preview (D18: preflop table, flop worker, river
// on device; exact ties go to the smaller wager, decisions.md §3), so this is `perfect` play,
// never an estimate. Framework-free so the loop is tested without a DOM. Loaded on demand.
import type { Street } from '../engine';
import type { OptionKey } from '../scene';
import { optionKeyOf } from './text';
import { watchHands } from './watchCore';
import type { WatchDriver, WatchOptions, WatchResult } from './watchCore';

export * from './watchCore';

const isDecision = (s: Street): boolean => s === 'preflop' || s === 'flop' || s === 'river';

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
