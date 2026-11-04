import { act, cleanup, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { DecisionPreview, DecisionTier } from '../../math';
import type { SceneConfig } from '../../scene';
import { createEvClient } from '../../worker/client';
import { PREFLOP_AA } from '../fixtures';
import { CONFIRM_ON, EV_MODES, needsConfirm, resolveEvShown } from '../settings';
import { isDecisionStreet } from '../simView';
import { optionKeyOf } from '../text';
import { DEFAULT_SIM_SETTINGS } from '../types';
import type { ConfirmOn, EvMode, SimSettings, SimulatorProps } from '../types';
import { TAP_GUARD_MS, useEvSheet } from './useEvSheet';
import { useSimDriver } from './useSimDriver';

const settings = { ...DEFAULT_SIM_SETTINGS, animationSpeed: 'instant' as const };
const preflop: SceneConfig = {
  id: 'sandbox',
  version: 1,
  startAt: { street: 'preflop', deal: { player: ['As', 'Kd'], dealer: ['9d', '9s'] } },
};

let clients: SimulatorProps['evClient'][] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.dispose());
  clients = [];
  document.body.innerHTML = '';
});

function mount(
  evMode: EvMode = 'before',
  confirmOn: ConfirmOn = 'never',
  evClient: SimulatorProps['evClient'] = createEvClient({ mode: 'inthread' }),
  scene: SceneConfig = preflop,
) {
  clients.push(evClient);
  const s: SimSettings = { ...settings, evMode, confirmOn };
  const props: SimulatorProps = { settings: s, evClient, scene };
  return renderHook(() => {
    const sim = useSimDriver(props, 'sandbox');
    const ev = useEvSheet(
      sim,
      evMode,
      'portrait',
      resolveEvShown(s, sim.d.view.scene, true, sim.d.view.step),
      isDecisionStreet(sim.d.view.state.street),
    );
    return { sim, ev };
  });
}

/** The A♠A♥ preflop preview with Check's tier forced (the engine is not run). */
const AA: SceneConfig = {
  id: 'sandbox',
  version: 1,
  startAt: { street: 'preflop', deal: { player: ['As', 'Ah'], dealer: ['9d', '9s'] } },
};
const withCheckTier = (tier: DecisionTier): DecisionPreview => ({
  ...PREFLOP_AA.preview,
  options: PREFLOP_AA.preview.options.map((o) =>
    optionKeyOf(o.action) === 'check' ? { ...o, tier } : o,
  ),
});
/** A fake EvClient: answers every preview with `answer()`, at once or when `release()` is called. */
function fakeClient(answer: () => DecisionPreview, deferred = false) {
  const waiting: (() => void)[] = [];
  const client = {
    mode: 'inthread' as const,
    dispose() {},
    run: (() =>
      new Promise((res) => {
        const go = () => res(answer());
        if (deferred) waiting.push(go);
        else go();
      })) as unknown as SimulatorProps['evClient']['run'],
  };
  return { client, release: () => waiting.splice(0).forEach((f) => f()) };
}

async function ready(r: ReturnType<typeof mount>['result']) {
  await waitFor(() => expect(r.current.sim.d.view.preview.status).toBe('ready'), {
    timeout: 8000,
  });
}

describe('useEvSheet', () => {
  it('is closed until an option is tapped', async () => {
    const { result } = mount();
    await ready(result);
    expect(result.current.ev.open).toBeNull();
    expect(result.current.ev.sheet).toBeNull();
  });

  it("one tap acts with the default policy (confirmOn 'never'): no sheet", async () => {
    const { result } = mount('before', 'never');
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('settled'));
    expect(result.current.ev.sheet).toBeNull();
    expect(result.current.ev.open).toBeNull();
  });

  it("'after': one tap acts, then the reveal shows the pre-move preview -> Continue", async () => {
    const { result } = mount('after', 'never');
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    await waitFor(() => expect(result.current.ev.sheet?.chosen).toBe('play-4'));
    expect(result.current.sim.d.view.state.street).toBe('settled');
    const reveal = result.current.ev.sheet!;
    expect(reveal.selected).toBe('play-4');
    expect(reveal.evMode).toBe('after');
    expect(reveal.preview?.street).toBe('preflop');
    await act(() => reveal.onContinue!());
    expect(result.current.ev.sheet).toBeNull();
  });

  it("'after' + confirmOn all: the confirm sheet hides EV, then turns into the reveal in place", async () => {
    const { result } = mount('after', 'all');
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    const sheet = result.current.ev.sheet!;
    expect(sheet.evMode).toBe('after');
    expect(sheet.confirming).toBe(true);
    expect(sheet.chosen).toBeNull();
    await act(() => sheet.onConfirm!('play-4'));
    await waitFor(() => expect(result.current.ev.sheet?.chosen).toBe('play-4'));
    expect(result.current.sim.d.view.state.street).toBe('settled');
  });

  it('confirmOn all: the sheet opens on a tap; its Confirm acts once and closes it', async () => {
    const { result } = mount('before', 'all');
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    expect(result.current.sim.d.view.state.street).toBe('preflop');
    await act(() => result.current.ev.sheet!.onConfirm!('play-4'));
    await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('settled'));
    expect(result.current.ev.sheet).toBeNull();
  });

  describe('the sheet opens iff needsConfirm(confirmOn, tier): 3 evModes x 4 policies x 5 tiers', () => {
    const tiers: DecisionTier[] = ['best', 'close', 'small', 'costly', 'blunder'];
    for (const evMode of EV_MODES)
      for (const confirmOn of CONFIRM_ON)
        for (const tier of tiers)
          it(`${evMode} / ${confirmOn} / ${tier}`, async () => {
            const { client } = fakeClient(() => withCheckTier(tier));
            const { result } = mount(evMode, confirmOn, client, AA);
            await ready(result);
            await act(() => result.current.ev.onOption('check'));
            if (needsConfirm(confirmOn, tier)) {
              expect(result.current.ev.open).toBe('check');
              expect(result.current.ev.sheet?.confirming).toBe(true);
              expect(result.current.ev.sheet?.evMode).toBe(evMode);
              expect(result.current.sim.d.view.state.street).toBe('preflop');
            } else {
              await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('flop'));
              // 'after' reveals the move; otherwise no sheet at all.
              if (evMode === 'after')
                await waitFor(() => expect(result.current.ev.sheet?.chosen).toBe('check'));
              else expect(result.current.ev.sheet).toBeNull();
            }
          });
  });

  describe('a tiered policy tapped before the preview is ready', () => {
    it('shows "Checking your move…" (checking, Cancel only); a best tier then acts', async () => {
      const f = fakeClient(() => withCheckTier('best'), true);
      const { result } = mount('before', 'blunder', f.client, AA);
      await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('preflop'));
      expect(result.current.sim.d.view.preview.status).not.toBe('ready');
      await act(() => result.current.ev.onOption('check'));
      expect(result.current.ev.sheet?.checking).toBe(true);
      expect(result.current.sim.d.view.state.street).toBe('preflop');
      await act(() => f.release());
      await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('flop'));
      expect(result.current.ev.sheet).toBeNull();
    });
    it('a blunder tier then shows the warning and acts on nothing', async () => {
      const f = fakeClient(() => withCheckTier('blunder'), true);
      const { result } = mount('before', 'blunder', f.client, AA);
      await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('preflop'));
      await act(() => result.current.ev.onOption('check'));
      expect(result.current.ev.sheet?.checking).toBe(true);
      await act(() => f.release());
      await waitFor(() => expect(result.current.ev.sheet?.checking).toBe(false));
      expect(result.current.ev.open).toBe('check');
      expect(result.current.sim.d.view.state.street).toBe('preflop');
    });
  });

  it('Details opens the sheet on the best option without acting, not as a confirm step (I092, D40)', async () => {
    const { result } = mount('before', 'never');
    await ready(result);
    await act(() => result.current.ev.openDetails());
    const sheet = result.current.ev.sheet!;
    expect(sheet.confirming).toBe(false);
    expect(sheet.focusOnOpen).toBe(true);
    expect(result.current.sim.d.view.state.street).toBe('preflop');
    await act(() => sheet.onSelect!('check'));
    expect(result.current.ev.sheet!.confirming).toBe(false);
    await act(() => result.current.ev.sheet!.onConfirm!('check'));
    await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('flop'));
  });

  it('double-tap guard: a second tap right after an act is ignored, later taps act (D40)', async () => {
    const { client } = fakeClient(() => withCheckTier('best'));
    const { result } = mount('before', 'never', client, AA);
    await ready(result);
    await act(() => result.current.ev.onOption('check'));
    await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('flop'));
    expect(result.current.ev.guarding).toBe(true);
    await act(() => result.current.ev.onOption('check')); // the same slot, 0 ms later
    await act(() => new Promise((r) => setTimeout(r, 150)));
    await act(() => result.current.ev.onOption('check')); // 150 ms later: still guarded
    expect(result.current.sim.d.view.state.street).toBe('flop');
    await waitFor(() => expect(result.current.ev.guarding).toBe(false), { timeout: 2000 });
    await act(() => result.current.ev.onOption('check'));
    await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('river'));
    expect(TAP_GUARD_MS).toBeGreaterThanOrEqual(300);
  });

  it("'after' tapped before the preview is ready waits for it, then acts and reveals", async () => {
    const f = fakeClient(() => withCheckTier('best'), true);
    const { result } = mount('after', 'never', f.client, AA);
    await waitFor(() => expect(result.current.sim.d.view.preview.status).toBe('pending'));
    await act(() => result.current.ev.onOption('check'));
    expect(result.current.ev.sheet?.checking).toBe(true);
    expect(result.current.sim.d.view.state.street).toBe('preflop');
    await act(() => f.release());
    await waitFor(() => expect(result.current.ev.sheet?.chosen).toBe('check'));
    expect(result.current.sim.d.view.state.street).toBe('flop');
    expect(result.current.ev.sheet?.preview?.street).toBe('preflop');
  });

  it('close() (Watch starting) drops an open sheet and a pending confirm without acting', async () => {
    const f = fakeClient(() => withCheckTier('best'), true);
    const { result } = mount('before', 'blunder', f.client, AA);
    await waitFor(() => expect(result.current.sim.d.view.preview.status).toBe('pending'));
    await act(() => result.current.ev.onOption('check'));
    expect(result.current.ev.sheet?.checking).toBe(true);
    await act(() => result.current.ev.close());
    expect(result.current.ev.sheet).toBeNull();
    await act(() => f.release());
    await waitFor(() => expect(result.current.sim.d.view.preview.status).toBe('ready'));
    expect(result.current.sim.d.view.state.street).toBe('preflop');
  });

  it('select switches the open option', async () => {
    const { result } = mount('before', 'all');
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    await act(() => result.current.ev.sheet!.onSelect!('check'));
    expect(result.current.ev.open).toBe('check');
    expect(result.current.ev.sheet!.selected).toBe('check');
  });

  it('cancel closes the sheet and returns focus to button[data-option]', async () => {
    const { result } = mount('before', 'all');
    await ready(result);
    const btn = document.createElement('button');
    btn.dataset.option = 'check';
    const other = document.createElement('button');
    document.body.append(btn, other);
    other.focus();
    await act(() => result.current.ev.onOption('check'));
    await act(() => result.current.ev.sheet!.onCancel!());
    expect(result.current.ev.sheet).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(btn));
  });

  it('a new street closes an open sheet', async () => {
    const { result } = mount('before', 'all');
    await ready(result);
    await act(() => result.current.ev.onOption('check'));
    expect(result.current.ev.open).toBe('check');
    await act(async () => {
      await result.current.sim.d.act({ type: 'check' });
    });
    await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('flop'));
    await waitFor(() => expect(result.current.ev.open).toBeNull());
  });
});
