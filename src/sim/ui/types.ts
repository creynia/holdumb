import type { EvClient } from '../worker/protocol';
import type { DecisionPreview } from '../math/types';
import type { Action, GameEvent, GameState, HandResult, PaytablePresetId } from '../engine/types';
import type { SceneConfig } from '../scene/types';

/** The settings the simulator reads (decisions.md D30). The app's Settings extends this. */
export interface SimSettings {
  animationSpeed: 'normal' | 'fast' | 'instant';
  fourColorDeck: boolean;
  /** Trips paytable preset (D23, D30). */
  paytable: PaytablePresetId;
  /** Cents per ante unit; per-hour lines scale by it (D30). */
  anteUnitCents: number;
  handsPerHour: number;
  /** When the table shows decision EVs: before you choose, only after, or never (D11, D39). */
  evMode: EvMode;
  /** Which decision tiers ask for a confirm step before acting (D24, D39). */
  confirmOn: ConfirmOn;
}

/** EV visibility (D11, D39). */
export type EvMode = 'before' | 'after' | 'never';
/** Confirm policy (D24, D39): every bet, costly + blunder, blunder only, or no confirm step. */
export type ConfirmOn = 'all' | 'costly' | 'blunder' | 'never';

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  animationSpeed: 'normal',
  fourColorDeck: false,
  paytable: 'trips-8-6-5',
  anteUnitCents: 1_000,
  handsPerHour: 30,
  evMode: 'before',
  confirmOn: 'never',
};

/** simulator.md §4.3 */
export type SimulatorEvent =
  | { type: 'ready' }
  | { type: 'previewed'; preview: DecisionPreview; option: string }
  | {
      type: 'action-confirmed';
      action: Action;
      events: GameEvent[];
      state: GameState;
      preview?: DecisionPreview;
    }
  | { type: 'action-rejected'; action: Action; reason: string }
  | { type: 'hand-settled'; result: HandResult; state: GameState }
  | { type: 'step-started'; stepId: string }
  | { type: 'step-completed'; stepId: string }
  | { type: 'scene-completed'; sceneId: string }
  | { type: 'auto-play-completed'; hands: number; strategy: string };

export interface SimulatorProps {
  scene?: SceneConfig;
  mode?: 'sandbox' | 'scene';
  settings: SimSettings;
  /** Injected; the app creates one EvClient per page. */
  evClient: EvClient;
  onEvent?: (e: SimulatorEvent) => void;
  persistKey?: string;
  /** Sandbox only: a saved snapshot to restore (the app keeps it in PersistedV1.sandbox). */
  snapshot?: unknown;
  /** Sandbox only: called with a JSON-safe snapshot after every action. */
  onSnapshot?: (snapshot: unknown) => void;
  /** Sandbox: the table's Practice checkbox (on = EV after). The app writes evMode to settings. */
  onPracticeChange?: (on: boolean) => void;
}
