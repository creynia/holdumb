// useSimDriver, useSandboxSync, useBetHandlers and usePreviewBar (useEvSheet has its own file).
import { act, cleanup, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneConfig, SimDriver } from '../../scene';
import { createEvClient } from '../../worker/client';
import { isDecisionStreet } from '../simView';
import { DEFAULT_SIM_SETTINGS } from '../types';
import type { SimSettings, SimulatorProps } from '../types';
import { useBetHandlers } from './useBetHandlers';
import { usePreviewBar } from './usePreviewBar';
import { useSandboxSync, useSimDriver } from './useSimDriver';

const settings = { ...DEFAULT_SIM_SETTINGS, animationSpeed: 'instant' as const };
const sandbox: SceneConfig = { id: 'sandbox', version: 1, seed: 7, bankroll: 50_000 };

let clients: SimulatorProps['evClient'][] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.dispose());
  clients = [];
});

function props(scene: SceneConfig, extra: Partial<SimulatorProps> = {}): SimulatorProps {
  const evClient = createEvClient({ mode: 'inthread' });
  clients.push(evClient);
  return { settings, evClient, scene, ...extra };
}

describe('useSimDriver', () => {
  it('builds one driver, presets the ante, emits ready and disposes on unmount', () => {
    const onEvent = vi.fn();
    const p = props(sandbox, { onEvent });
    const { result, rerender, unmount } = renderHook(() => useSimDriver(p, 'sandbox'));
    const d = result.current.d;
    expect(d.view.state.bets.ante).toBe(1_000);
    expect(onEvent).toHaveBeenCalledWith({ type: 'ready' });
    rerender();
    expect(result.current.d).toBe(d);
    const dispose = vi.spyOn(d, 'dispose');
    unmount();
    expect(dispose).toHaveBeenCalled();
  });

  it('toasts the result when a hand settles and clears it on the next deal', async () => {
    const p = props({
      id: 'sandbox',
      version: 1,
      startAt: { street: 'preflop', deal: { player: ['As', 'Ad'] } },
    });
    const { result } = renderHook(() => useSimDriver(p, 'sandbox'));
    expect(result.current.toast).toBeNull();
    await act(async () => {
      await result.current.act({ type: 'play', multiple: 4 });
    });
    await waitFor(() => expect(result.current.toast).not.toBeNull());
    expect(result.current.toast!.text.length).toBeGreaterThan(0);
    // The spoken line is the plain sentence: no word joiners (I008).
    expect(result.current.toast!.spoken).not.toMatch(/\u2060/);
    await act(async () => {
      await result.current.act({ type: 'deal' });
    });
    expect(result.current.toast).toBeNull();
  });

  it('a fold toast carries the spoken fold announcement; a win has none', async () => {
    const p = props({
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'river',
        deal: {
          player: ['3c', '4d'],
          flop: ['Ah', 'Ks', 'Qd'],
          turn: '9c',
          river: '7h',
          dealer: ['Td', 'Ts'],
        },
      },
    });
    const { result } = renderHook(() => useSimDriver(p, 'sandbox'));
    await act(async () => {
      await result.current.act({ type: 'fold' });
    });
    await waitFor(() => expect(result.current.toast).not.toBeNull());
    expect(result.current.toast!.spoken).toBeTruthy();
  });

  it('act() toasts a rejected action outside scene steps', async () => {
    const p = props(sandbox);
    const { result } = renderHook(() => useSimDriver(p, 'sandbox'));
    let r: Awaited<ReturnType<SimDriver['act']>> | undefined;
    await act(async () => {
      r = await result.current.act({ type: 'check' });
    });
    expect(r?.ok).toBe(false);
    expect(result.current.toast?.tone).toBe('bad');
  });
});

describe('useSandboxSync', () => {
  function mount(scene: SceneConfig, extra: Partial<SimulatorProps> = {}) {
    const base = props(scene, extra);
    return renderHook(
      ({ s }: { s: SimSettings }) => {
        const sim = useSimDriver({ ...base, settings: s }, 'sandbox');
        useSandboxSync(sim, true, scene, s);
        return sim;
      },
      { initialProps: { s: base.settings } },
    );
  }

  it('saves a snapshot on mount and after every action', async () => {
    const onSnapshot = vi.fn();
    const { result } = mount(sandbox, { onSnapshot });
    const before = onSnapshot.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      await result.current.act({ type: 'set-bet', wager: 'trips', amount: 500 });
    });
    await waitFor(() => expect(onSnapshot.mock.calls.length).toBeGreaterThan(before));
    const last = onSnapshot.mock.calls.at(-1)![0] as unknown;
    expect(JSON.stringify(last)).toContain('500');
    expect((last as { evMode: string }).evMode).toBe('before');
  });

  it('saves nothing for a preset (startAt) hand', () => {
    const onSnapshot = vi.fn();
    mount(
      { id: 'sandbox', version: 1, startAt: { street: 'preflop', deal: { player: ['As', 'Ad'] } } },
      { onSnapshot },
    );
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('the table follows the EV-mode setting live', async () => {
    const { result, rerender } = mount(sandbox);
    expect(result.current.d.view.evMode).toBe('before');
    const setEvMode = vi.spyOn(result.current.d, 'setEvMode');
    rerender({ s: { ...settings, evMode: 'after' } });
    await waitFor(() => expect(setEvMode).toHaveBeenLastCalledWith('after'));
    expect(result.current.d.view.evMode).toBe('after');
    rerender({ s: { ...settings, evMode: 'never' } });
    await waitFor(() => expect(setEvMode).toHaveBeenLastCalledWith('never'));
    expect(result.current.d.view.evMode).toBe('never');
    rerender({ s: { ...settings, evMode: 'before' } });
    await waitFor(() => expect(setEvMode).toHaveBeenLastCalledWith('before'));
    expect(result.current.d.view.evMode).toBe('before');
  });
});

describe('useBetHandlers', () => {
  function mount() {
    const p = props(sandbox);
    return renderHook(() => {
      const sim = useSimDriver(p, 'sandbox');
      return { sim, bets: useBetHandlers(sim.d, sim.act, 500) };
    });
  }

  it('a tap on the ante adds the selected chip; Clear resets to the minimum', async () => {
    const { result } = mount();
    expect(result.current.bets.chip).toBe(500);
    await act(() => result.current.bets.setChip(2_500));
    expect(result.current.bets.chip).toBe(2_500);
    await act(() => result.current.bets.onCircle('ante'));
    await waitFor(() => expect(result.current.sim.d.view.state.bets.ante).toBe(3_500));
    await act(() => result.current.bets.onCircle('trips'));
    await waitFor(() => expect(result.current.sim.d.view.state.bets.trips).toBe(2_500));
    await act(() => result.current.bets.clearBets());
    await waitFor(() => expect(result.current.sim.d.view.state.bets.trips).toBe(0));
    const st = result.current.sim.d.view.state;
    expect(st.bets.ante).toBe(st.rules.anteMin);
  });

  it('a tap on the blind or play circle places nothing', async () => {
    const { result } = mount();
    const before = { ...result.current.sim.d.view.state.bets };
    await act(() => result.current.bets.onCircle('blind'));
    await act(() => result.current.bets.onCircle('play'));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.sim.d.view.state.bets).toEqual(before);
  });
});

describe('usePreviewBar', () => {
  const usePreviewBarOf = (v: SimDriver['view']) =>
    usePreviewBar(
      v.preview,
      isDecisionStreet(v.state.street),
      (v.step?.showEV ?? v.scene.showEV) !== false,
    );
  type View = SimDriver['view'];
  const view = (street: string, status: string, showEV?: boolean): View =>
    ({
      state: { street },
      scene: { id: 'x', version: 1, showEV },
      step: undefined,
      preview: { key: null, status, value: status === 'ready' ? { street } : null, progress: 0 },
    }) as unknown as View;

  it('passes the ready preview and status on a decision street', () => {
    const { result } = renderHook(() => usePreviewBarOf(view('flop', 'ready')));
    expect(result.current.barStatus).toBe('ready');
    expect(result.current.showPreviewOnBar).toEqual({ street: 'flop' });
  });
  it('shows pending and error, hides idle', () => {
    expect(
      renderHook(() => usePreviewBarOf(view('river', 'pending'))).result.current.barStatus,
    ).toBe('pending');
    expect(renderHook(() => usePreviewBarOf(view('river', 'error'))).result.current.barStatus).toBe(
      'error',
    );
    expect(
      renderHook(() => usePreviewBarOf(view('river', 'idle'))).result.current.barStatus,
    ).toBeUndefined();
  });
  it('shows nothing between decisions or when EV is hidden', () => {
    const between = renderHook(() => usePreviewBarOf(view('betting', 'ready'))).result.current;
    expect(between.barStatus).toBeUndefined();
    const hidden = renderHook(() => usePreviewBarOf(view('flop', 'ready', false))).result.current;
    expect(hidden.barStatus).toBeUndefined();
    expect(hidden.showPreviewOnBar).toBeNull();
  });
});
