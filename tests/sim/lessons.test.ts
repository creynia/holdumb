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
import type { DriverEvent, SceneConfig } from '../../src/sim/scene';
import { createEvClient } from '../../src/sim/worker';
import { optionKeyOfAction } from '../../src/sim/scene';
import { CONFIRM_ON, EV_MODES, resolveEvMode } from '../../src/sim/ui/settings';
import { DEFAULT_SIM_SETTINGS } from '../../src/sim/ui/types';
import type { SimSettings } from '../../src/sim/ui/types';

const client = createEvClient({ mode: 'inthread' });
afterAll(() => client.dispose());

const bundle = buildContent(process.cwd());
const scenes = bundle.lessons.flatMap((l) =>
  l.blocks.flatMap((b) => (b.kind === 'scene' ? [{ lesson: l.id, scene: b.scene }] : [])),
);

const rat = (f?: { num: bigint; den: bigint }): number => (f ? Number(f.num) / Number(f.den) : 0);
const results = new Map<string, { bustRate: number; meanFinal: number }>();
const simCache = new Map<string, Promise<{ series: { bustRate: number; meanFinal: number }[] }>>();

/** D39: every user setting combination (3 evModes x 4 confirmOn). */
const COMBOS: SimSettings[] = EV_MODES.flatMap((evMode) =>
  CONFIRM_ON.map((confirmOn) => ({ ...DEFAULT_SIM_SETTINGS, evMode, confirmOn })),
);

/** What a lesson run looks like from outside: steps, actions, outcomes and the per-step modes. */
interface Trace {
  events: DriverEvent[];
  sig: string[];
}

async function script(
  scene: SceneConfig,
  settings: SimSettings = DEFAULT_SIM_SETTINGS,
): Promise<Trace> {
  const events: DriverEvent[] = [];
  const sig: string[] = [];
  // Exactly what the container hands the driver for a lesson, from the user's settings.
  const d = new SimDriver({
    scene,
    mode: 'scene',
    seed: 1,
    evMode: resolveEvMode(settings, scene, 'scene'),
    preview: (req, o) => client.run('preview', req, o),
    onEvent: (e) => {
      events.push(e);
      if (e.type === 'step-started' || e.type === 'step-completed')
        sig.push(`${e.type}:${e.stepId}`);
      else if (e.type === 'action-confirmed') sig.push(`act:${JSON.stringify(e.action)}`);
      else if (e.type === 'action-rejected') sig.push(`rej:${JSON.stringify(e.action)}`);
      else if (e.type === 'hand-settled') sig.push(`settled:${e.result.outcome}:${e.result.net}`);
      else if (e.type === 'scene-completed') sig.push('done');
    },
  });
  const fired = new Set<string>();
  for (let i = 0; i < 600 && !d.view.rt.done; i++) {
    const v = d.view;
    const mode = `mode:${v.rt.stepIndex}:${v.evMode}:${v.confirmOn}`;
    if (sig.at(-1) !== mode) sig.push(mode);
    if (v.pendingStart) {
      d.nextHand();
      continue;
    }
    const step = v.step!;
    const before = v.version;
    // 1. things the learner does besides playing: previews, taps, auto-play runs
    let did = false;
    const meta = leaves(step.completeWhen);
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
        // The real run, with the scene's stake and seed, exactly as the panel requests it.
        const ap = scene.autoPlay!;
        const spec = ap.defaultStrategy!;
        const hands = ap.handOptions?.[0] ?? 30;
        const sessions = ap.sessions?.[0] ?? 1;
        if (!simCache.has(scene.id))
          simCache.set(
            scene.id,
            client.run('simulate', {
              strategy: spec,
              hands,
              sessions,
              seed: scene.seed ?? 1,
              bankroll: scene.bankroll ?? 50_000,
              rules: { tripsPaytable: 'trips-8-6-5' },
              compare: ap.compare?.map((c) => ({ ...c })),
            }),
          );
        const res = await simCache.get(scene.id)!;
        results.set(scene.id, res.series[0]!);
        d.autoPlayCompleted(hands, spec.id);
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
      const street = st;
      const pv = await d.currentPreview();
      const keys = gatedOptions(gate, street);
      const ranked = [...keys].sort((a, b) => {
        const ev = (k: typeof a) =>
          pv ? rat(pv.options.find((o) => optionKeyOfAction(o.action) === k)?.regret) : 0;
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
  return { events, sig };
}

describe('every lesson scene completes (30)', () => {
  it('finds all 30 scenes and they validate', () => {
    expect(scenes).toHaveLength(30);
    for (const { scene } of scenes) expect(validateScene(scene).ok, scene.id).toBe(true);
  });
  for (const { lesson, scene } of scenes) {
    it(`${lesson} / ${scene.id}`, { timeout: 120_000 }, async () => {
      const { events } = await script(scene);
      const done = events.filter((e) => e.type === 'step-completed').map((e) => e.stepId);
      expect(done).toEqual((scene.steps ?? []).map((s) => s.id));
      expect(events.some((e) => e.type === 'scene-completed')).toBe(true);
      if (scene.autoPlay?.enabled)
        expect(events.some((e) => e.type === 'auto-play-completed')).toBe(true);
    });
  }
  it('l17-s2 busts about as often as its copy promises (roughly a third, about 37%)', () => {
    const r = results.get('l17-s2');
    expect(r, 'l17-s2 ran before this test').toBeDefined();
    expect(Math.abs(r!.bustRate - 0.37)).toBeLessThan(0.06);
  });
});

describe('lessons do not depend on the user settings (D39, 12 combinations)', () => {
  for (const { lesson, scene } of scenes) {
    it(`${lesson} / ${scene.id}`, { timeout: 300_000 }, async () => {
      const ref = await script(scene, COMBOS[0]);
      expect(ref.sig.at(-1)).toBe('done');
      for (const u of COMBOS.slice(1)) {
        const t = await script(scene, u);
        expect(t.sig, `${u.evMode}/${u.confirmOn}`).toEqual(ref.sig);
      }
    });
  }
});
