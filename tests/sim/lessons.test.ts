// Scripts EVERY lesson scene (from the real content) to completion through the real driver,
// the in-thread EV client and the engine: forced deals as written, expected or best actions.
import { afterAll, describe, expect, it } from 'vitest';
import { buildContent } from '../../src/content/load';
import {
  SimDriver,
  STREET_OPTIONS,
  actionOfOption,
  gatedOptions,
  leaves,
  validateScene,
} from '../../src/sim/scene';
import type { Condition, DriverEvent, SceneConfig } from '../../src/sim/scene';
import { createEvClient } from '../../src/sim/worker';
import { optionKeyOfAction } from '../../src/sim/scene';
import type { DecisionStreet } from '../../src/sim/engine';

const client = createEvClient({ mode: 'inthread' });
afterAll(() => client.dispose());

const bundle = buildContent(process.cwd());
const scenes = bundle.lessons.flatMap((l) =>
  l.blocks.flatMap((b) => (b.kind === 'scene' ? [{ lesson: l.id, scene: b.scene }] : [])),
);

async function script(scene: SceneConfig): Promise<DriverEvent[]> {
  const events: DriverEvent[] = [];
  const d = new SimDriver({
    scene,
    mode: 'scene',
    seed: 1,
    speculate: false,
    preview: (req, o) => client.run('preview', req, o),
    onEvent: (e) => events.push(e),
  });
  const fired = new Set<string>();
  for (let i = 0; i < 600 && !d.view.rt.done; i++) {
    const v = d.view;
    if (v.pendingStart) {
      d.nextHand();
      continue;
    }
    const step = v.step!;
    const before = v.version;
    // 1. things the learner does besides playing: previews, taps, auto-play runs
    let did = false;
    const meta = leaves(step.completeWhen as Condition);
    for (const l of meta) {
      const k = `${v.rt.stepIndex}:${JSON.stringify(l)}`;
      if (fired.has(k) && !('tapped' in l)) continue;
      if ('previewed' in l && !fired.has(k)) {
        fired.add(k);
        const street = v.state.street;
        const opt =
          l.previewed.option ??
          (street === 'preflop' || street === 'flop' || street === 'river'
            ? STREET_OPTIONS[street][0]
            : undefined);
        if (opt) {
          await d.currentPreview();
          d.previewed(opt, !!l.previewed.whyOpened);
          did = true;
        }
      } else if ('tapped' in l && !fired.has(k)) {
        fired.add(k);
        d.tap(l.tapped);
        did = true;
      } else if ('autoPlayCompleted' in l && !fired.has(k)) {
        fired.add(k);
        d.autoPlayCompleted(
          l.autoPlayCompleted.minHands ?? 1,
          l.autoPlayCompleted.strategy ?? 'expert',
        );
        did = true;
      }
      if (did && d.view.version !== before) break;
    }
    if (did && (d.view.rt.stepIndex !== v.rt.stepIndex || d.view.rt.done)) continue;
    // 2. play
    const st = d.view.state.street;
    const gate = d.view.gate;
    if (st === 'betting' || st === 'settled') {
      if (!d.view.dealLocked) {
        const r = await d.act({ type: 'deal' });
        if (r.ok) continue;
      }
    } else {
      const street = st as DecisionStreet;
      const pv = await d.currentPreview();
      const keys = gatedOptions(gate, street);
      const ranked = [...keys].sort((a, b) => {
        const ev = (k: typeof a) =>
          pv
            ? Number(pv.options.find((o) => optionKeyOfAction(o.action) === k)?.regret.num ?? 0n)
            : 0;
        return ev(a) - ev(b);
      });
      let moved = false;
      for (const k of ranked) {
        const r = await d.act(actionOfOption(k));
        if (r.ok) {
          moved = true;
          break;
        }
      }
      if (moved) continue;
    }
    // 3. the Next button
    if (d.view.showNext) {
      d.acknowledge();
      continue;
    }
    if (d.view.version === before && !did)
      throw new Error(`stuck in ${scene.id} step "${step.id}" on ${st}`);
  }
  d.dispose();
  return events;
}

describe('every lesson scene completes (30)', () => {
  it('finds all 30 scenes and they validate', () => {
    expect(scenes).toHaveLength(30);
    for (const { scene } of scenes) expect(validateScene(scene).ok, scene.id).toBe(true);
  });
  for (const { lesson, scene } of scenes) {
    it(`${lesson} / ${scene.id}`, { timeout: 120_000 }, async () => {
      const events = await script(scene);
      const done = events.filter((e) => e.type === 'step-completed').map((e) => e.stepId);
      expect(done).toEqual((scene.steps ?? []).map((s) => s.id));
      expect(events.some((e) => e.type === 'scene-completed')).toBe(true);
      if (scene.autoPlay?.enabled)
        expect(events.some((e) => e.type === 'auto-play-completed')).toBe(true);
    });
  }
});
