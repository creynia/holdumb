// useSimDriver, useBetHandlers and usePreviewBar (useEvSheet has its own file).
import { act, cleanup, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneConfig, SimDriver } from '../../scene';
import { createEvClient } from '../../worker/client';
import { DEFAULT_SIM_SETTINGS } from '../types';
import type { SimulatorProps } from '../types';
import { useBetHandlers } from './useBetHandlers';
import { usePreviewBar } from './usePreviewBar';
import { useSimDriver } from './useSimDriver';

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
    const { result, rerender, unmount } = renderHook(() =>
      useSimDriver(props(sandbox, { onEvent }), 'sandbox'),
    );
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
    const { result } = renderHook(() =>
      useSimDriver(
        props({
          id: 'sandbox',
          version: 1,
          startAt: { street: 'preflop', deal: { player: ['As', 'Ad'] } },
        }),
        'sandbox',
      ),
    );
    expect(result.current.toast).toBeNull();
    await act(async () => {
      await result.current.act({ type: 'play', multiple: 4 });
    });
    await waitFor(() => expect(result.current.toast).not.toBeNull());
    expect(result.current.toast!.text.length).toBeGreaterThan(0);
    await act(async () => {
      await result.current.act({ type: 'deal' });
    });
    expect(result.current.toast).toBeNull();
  });

  it('act() toasts a rejected action outside scene steps', async () => {
    const { result } = renderHook(() => useSimDriver(props(sandbox), 'sandbox'));
    let r: Awaited<ReturnType<SimDriver['act']>> | undefined;
    await act(async () => {
      r = await result.current.act({ type: 'check' });
    });
    expect(r?.ok).toBe(false);
    expect(result.current.toast?.tone).toBe('bad');
  });
});

describe('useBetHandlers', () => {
  function mount() {
    return renderHook(() => {
      const sim = useSimDriver(props(sandbox), 'sandbox');
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
  type View = SimDriver['view'];
  const view = (street: string, status: string, showEV?: boolean): View =>
    ({
      state: { street },
      scene: { id: 'x', version: 1, showEV },
      step: undefined,
      preview: { key: null, status, value: status === 'ready' ? { street } : null, progress: 0 },
    }) as unknown as View;

  it('passes the ready preview and status on a decision street', () => {
    const { result } = renderHook(() => usePreviewBar(view('flop', 'ready')));
    expect(result.current.barStatus).toBe('ready');
    expect(result.current.showPreviewOnBar).toEqual({ street: 'flop' });
  });
  it('shows pending and error, hides idle', () => {
    expect(renderHook(() => usePreviewBar(view('river', 'pending'))).result.current.barStatus).toBe(
      'pending',
    );
    expect(renderHook(() => usePreviewBar(view('river', 'error'))).result.current.barStatus).toBe(
      'error',
    );
    expect(
      renderHook(() => usePreviewBar(view('river', 'idle'))).result.current.barStatus,
    ).toBeUndefined();
  });
  it('shows nothing between decisions or when EV is hidden', () => {
    const between = renderHook(() => usePreviewBar(view('betting', 'ready'))).result.current;
    expect(between.barStatus).toBeUndefined();
    const hidden = renderHook(() => usePreviewBar(view('flop', 'ready', false))).result.current;
    expect(hidden.barStatus).toBeUndefined();
    expect(hidden.showPreviewOnBar).toBeNull();
  });
});
