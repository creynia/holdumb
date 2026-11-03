// I012: the slots every real lesson step gives its buttons. A step that allows one bet (lesson 3's
// "Bet 4x" step allows only play-4) must get that bet across b + c, never a lone narrow column.
import { describe, expect, it } from 'vitest';
import { buildContent } from '../../content/load';
import type { OptionKey } from '../scene';
import { optionsFor, slotOf } from './ActionBar';

const bundle = buildContent(process.cwd());
const steps = bundle.lessons.flatMap((l) =>
  l.blocks.flatMap((b) =>
    b.kind === 'scene'
      ? (b.scene.steps ?? []).map((s) => ({ lesson: l.id, scene: b.scene.id, step: s }))
      : [],
  ),
);
const BETS = new Set<OptionKey>(['play-1', 'play-2', 'play-3', 'play-4']);

describe('lesson steps and the action slots (I012)', () => {
  it("lesson 3's gated Bet 4x step spans b + c", () => {
    const s = steps.find((x) => x.scene === 'l03-s1' && x.step.id === 'bet');
    expect(s, 'l03-s1 / bet exists').toBeTruthy();
    const keys = optionsFor('preflop', s!.step.allowedOptions);
    expect(keys.map((k) => [k, slotOf(k, keys)])).toEqual([['play-4', 'bc']]);
  });
  it('every step that leaves one bet on a street spans it across b + c', () => {
    let checked = 0;
    for (const { scene, step } of steps) {
      if (!step.allowedOptions) continue;
      for (const street of ['preflop', 'flop', 'river'] as const) {
        const keys = optionsFor(street, step.allowedOptions);
        const bets = keys.filter((k) => BETS.has(k));
        if (bets.length !== 1) continue;
        checked++;
        expect(slotOf(bets[0]!, keys), `${scene}/${step.id} ${street}`).toBe('bc');
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
