// The SimDriver holder for the Simulator container: builds the driver once, re-renders on every
// driver change, disposes it on unmount and owns the single toast (simulator.md 3.4, 4.3).
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { SimDriver } from '../../scene';
import type { DriverEvent, SceneConfig } from '../../scene';
import { decodeSnapshot, encodeSnapshot } from '../persist';
import { randomSeed, resolvePractice } from '../settings';
import { describeResult, foldAnnouncement } from '../text';
import type { SimulatorProps } from '../types';

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'good' | 'bad';
  spoken?: string;
}

export type SimMode = 'sandbox' | 'scene';
export type DriverAction = Parameters<SimDriver['act']>[0];

export function makeDriver(
  props: SimulatorProps,
  mode: SimMode,
  onEvent: (e: DriverEvent) => void,
): SimDriver {
  const { settings, evClient } = props;
  let scene: SceneConfig = props.scene ?? { id: 'sandbox', version: 1 };
  const sandbox = mode === 'sandbox';
  const practice = resolvePractice(settings, scene);
  let restore: ConstructorParameters<typeof SimDriver>[0]['restore'];
  if (sandbox && props.snapshot !== undefined && !scene.startAt) {
    const dec = decodeSnapshot(props.snapshot, settings.paytable);
    if (dec) {
      restore = dec.restore;
    }
  }
  if (sandbox && !restore && !scene.bets && !scene.startAt) {
    const bank = scene.bankroll ?? 50_000;
    const ante = Math.min(settings.anteUnitCents, Math.floor(bank / 2 / 100) * 100);
    if (ante >= 500) scene = { ...scene, bets: { ante } };
  }
  return new SimDriver({
    scene,
    mode,
    seed: sandbox ? randomSeed() : 1,
    paytable: settings.paytable,
    practice,
    restore,
    onEvent,
    preview: (req, o) => evClient.run('preview', req, o),
  });
}

export interface SimDriverHandle {
  d: SimDriver;
  /** Always the latest props, for callbacks that outlive a render. */
  latest: { current: SimulatorProps };
  toast: Toast | null;
  setToast: (t: Toast | null) => void;
  pushToast: (text: string, tone?: Toast['tone'], spoken?: string) => void;
  /** Runs a driver action and toasts a rejection outside scene steps. */
  act: (a: DriverAction) => ReturnType<SimDriver['act']>;
}

export function useSimDriver(props: SimulatorProps, mode: SimMode): SimDriverHandle {
  const latest = useRef(props);
  latest.current = props;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastId = useRef(0);
  const pushToast = (text: string, tone?: Toast['tone'], spoken?: string): void =>
    setToast({ id: ++toastId.current, text, tone, spoken });

  const holder = useRef<SimDriver | null>(null);
  if (!holder.current) {
    holder.current = makeDriver(props, mode, (e) => {
      if (e.type === 'hand-settled')
        // A fold is announced once, from the toast's spoken line (the reveal and Felt stay quiet).
        pushToast(
          describeResult(e.result, e.state.hand?.deal),
          e.result.net > 0 ? 'good' : undefined,
          e.result.outcome === 'fold' ? foldAnnouncement(e.result) : undefined,
        );
      else if (e.type === 'action-confirmed' && e.action.type === 'deal') setToast(null);
      else if (e.type === 'action-rejected' && !holder.current?.view.step)
        pushToast(e.reason, 'bad');
      latest.current.onEvent?.(e);
    });
  }
  const d = holder.current;
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = d.subscribe(() => force(0));
    force(0);
    latest.current.onEvent?.({ type: 'ready' });
    return () => {
      off();
      d.dispose();
    };
  }, [d]);

  const act = async (a: DriverAction) => {
    const r = await d.act(a);
    if (!r.ok && !d.view.step) pushToast(r.message, 'bad');
    return r;
  };
  return { d, latest, toast, setToast, pushToast, act };
}

/**
 * Sandbox sync: saves a snapshot after every driver event (PersistedV1.sandbox, owned by the app
 * store) and keeps the table's practice mode in step with the settings, its source of truth.
 */
export function useSandboxSync(
  h: SimDriverHandle,
  sandbox: boolean,
  baseScene: SceneConfig,
  settings: SimulatorProps['settings'],
): void {
  const { d, latest } = h;
  const persistable = sandbox && !baseScene.startAt && !!latest.current.onSnapshot;
  useEffect(() => {
    if (persistable) latest.current.onSnapshot?.(encodeSnapshot(d, settings.evMode));
  }, [d.view.eventSeq, persistable, d]);
  useEffect(() => {
    if (sandbox) d.setPractice(resolvePractice(settings, baseScene));
  }, [settings.evMode, sandbox, d]);
}
