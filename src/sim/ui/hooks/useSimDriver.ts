// The SimDriver holder for the Simulator container: builds the driver once, re-renders on every
// driver change, disposes it on unmount and owns the single toast (simulator.md 3.4, 4.3).
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { SimDriver } from '../../scene';
import type { DriverEvent, SceneConfig } from '../../scene';
import type { LoggedHand } from '../moveLogData';
import { decodeSnapshot, encodeSnapshot } from '../persist';
import { randomSeed, resolveEvMode, resolveEvShown, resolveSpeed } from '../settings';
import { soundOf } from '../soundEvents';
import { foldAnnouncement, handVerdictText, settledToastText, typographic } from '../text';
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
  // D39: in a lesson the scene decides; the driver ignores this outside the sandbox.
  const evMode = resolveEvMode(settings, scene, mode);
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
    evMode,
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
  /** I080: what the confirmed decision was worth; the result toast leads with it if the hand ends. */
  narration: { current: string | null };
  /** Silences table sounds while the table plays itself (Watch). The container sets it. */
  soundMuted: { current: boolean };
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

  const narration = useRef<string | null>(null);
  // Table sounds (I027): the audio module is loaded only while Sounds is on (no first-paint cost).
  const soundMuted = useRef(false);
  const audio = useRef<typeof import('../sound') | null>(null);
  const holder = useRef<SimDriver | null>(null);
  if (!holder.current) {
    holder.current = makeDriver(props, mode, (e) => {
      if (e.type === 'hand-settled') {
        // The decision's narration (I080) leads the result in one toast.
        const lead = narration.current ? `${narration.current} ` : '';
        narration.current = null;
        // I059: one skill-versus-luck sentence rides on the result (never a second toast), unless
        // EV is hidden; a lesson opts in with ui.verdict.
        const dd = holder.current;
        const scene = dd?.view.scene;
        const verdict =
          dd && scene && (mode === 'sandbox' || scene.ui?.verdict === true) ? dd.verdict() : null;
        const tail =
          verdict &&
          resolveEvShown(latest.current.settings, scene!, mode === 'sandbox', dd!.view.step)
            ? ` ${handVerdictText(verdict, lead !== '' || dd!.view.evMode === 'after')}`
            : '';
        // A fold is announced once, from the toast's spoken line (the reveal and Felt stay quiet).
        pushToast(
          typographic(`${lead}${settledToastText(e)}${tail}`),
          e.result.net > 0 ? 'good' : undefined,
          e.result.outcome === 'fold' ? `${lead}${foldAnnouncement(e.result)}${tail}` : undefined,
        );
      } else if (e.type === 'action-confirmed' && e.action.type === 'deal') setToast(null);
      else if (e.type === 'action-rejected' && !holder.current?.view.step)
        pushToast(e.reason, 'bad');
      const sound = latest.current.settings.sounds ? soundOf(e) : null;
      if (sound && !soundMuted.current && audio.current) {
        const scene = holder.current?.view.scene ??
          latest.current.scene ?? { id: 'sandbox', version: 1 };
        if (resolveSpeed(latest.current.settings, scene) !== 'instant')
          audio.current.playSound(sound);
      }
      latest.current.onEvent?.(e);
    });
  }
  const d = holder.current;
  const soundsOn = props.settings.sounds === true;
  useEffect(() => {
    if (!soundsOn) return audio.current?.setSoundsWanted(false);
    let live = true;
    void import('../sound').then((m) => {
      if (!live) return;
      audio.current = m;
      m.setSoundsWanted(true);
      m.armSoundUnlock(); // the audio context is created on the first tap, never before
    });
    return () => {
      live = false;
    };
  }, [soundsOn]);
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
  return { d, latest, toast, setToast, pushToast, narration, soundMuted, act };
}

/**
 * Sandbox sync: saves a snapshot after every driver event (PersistedV1.sandbox, owned by the app
 * store) and keeps the table's EV mode in step with the settings, its source of truth.
 */
export function useSandboxSync(
  h: SimDriverHandle,
  sandbox: boolean,
  baseScene: SceneConfig,
  settings: SimulatorProps['settings'],
  log?: readonly LoggedHand[],
): void {
  const { d, latest } = h;
  const persistable = sandbox && !baseScene.startAt && !!latest.current.onSnapshot;
  useEffect(() => {
    if (persistable) latest.current.onSnapshot?.(encodeSnapshot(d, settings.evMode, log));
  }, [d.view.eventSeq, d.view.session.topUpCents, persistable, d]);
  useEffect(() => {
    if (sandbox) d.setEvMode(resolveEvMode(settings, baseScene, 'sandbox'));
  }, [settings.evMode, sandbox, d]);
}
