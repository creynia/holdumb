import { act, cleanup, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { SceneConfig } from '../../scene';
import { createEvClient } from '../../worker/client';
import { DEFAULT_SIM_SETTINGS } from '../types';
import type { SimulatorProps } from '../types';
import { useEvSheet } from './useEvSheet';
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

function mount(practice: boolean) {
  const evClient = createEvClient({ mode: 'inthread' });
  clients.push(evClient);
  const props: SimulatorProps = { settings, evClient, scene: preflop };
  return renderHook(() => {
    const sim = useSimDriver(props, 'sandbox');
    const ev = useEvSheet(sim, { settings, sandbox: true, practice, orientation: 'portrait' });
    return { sim, ev };
  });
}

async function ready(r: ReturnType<typeof mount>['result']) {
  await waitFor(() => expect(r.current.sim.d.view.preview.status).toBe('ready'), {
    timeout: 8000,
  });
}

describe('useEvSheet', () => {
  it('is closed until an option is tapped', async () => {
    const { result } = mount(false);
    await ready(result);
    expect(result.current.ev.open).toBeNull();
    expect(result.current.ev.sheet).toBeNull();
  });

  it('practice: open -> confirm -> reveal -> continue', async () => {
    const { result } = mount(true);
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    expect(result.current.ev.open).toBe('play-4');
    const sheet = result.current.ev.sheet!;
    expect(sheet.selected).toBe('play-4');
    expect(sheet.hideEv).toBe(true);
    expect(sheet.chosen).toBeNull();
    expect(sheet.variant).toBe('sheet');

    await act(() => sheet.onConfirm!('play-4'));
    await waitFor(() => expect(result.current.ev.sheet?.chosen).toBe('play-4'));
    expect(result.current.sim.d.view.state.street).toBe('settled');
    // The reveal keeps the sheet up on the hand's next street, with the pre-move preview.
    const reveal = result.current.ev.sheet!;
    expect(reveal).not.toBeNull();
    expect(reveal.chosen).toBe('play-4');
    expect(reveal.selected).toBe('play-4');
    expect(reveal.preview?.street).toBe('preflop');

    await act(() => reveal.onContinue!());
    expect(result.current.ev.sheet).toBeNull();
    expect(result.current.ev.open).toBeNull();
  });

  it('without practice, confirm closes the sheet at once', async () => {
    const { result } = mount(false);
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    await act(() => result.current.ev.sheet!.onConfirm!('play-4'));
    await waitFor(() => expect(result.current.sim.d.view.state.street).toBe('settled'));
    expect(result.current.ev.sheet).toBeNull();
  });

  it('select switches the open option', async () => {
    const { result } = mount(false);
    await ready(result);
    await act(() => result.current.ev.onOption('play-4'));
    await act(() => result.current.ev.sheet!.onSelect!('check'));
    expect(result.current.ev.open).toBe('check');
    expect(result.current.ev.sheet!.selected).toBe('check');
  });

  it('cancel closes the sheet and returns focus to button[data-option]', async () => {
    const { result } = mount(false);
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
    const { result } = mount(false);
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
