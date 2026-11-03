// The auto-play panel inside the Simulator: folded in a <details> in the sandbox, bare in a scene.
import type { SceneConfig, SimDriver } from '../scene';
import type { StrategyId } from '../strategy';
import { AutoPlayPanel } from './AutoPlayPanel';
import type { SimulatorProps } from './types';

export interface SimAutoPlayProps {
  d: SimDriver;
  scene: SceneConfig;
  sandbox: boolean;
  settings: SimulatorProps['settings'];
  evClient: SimulatorProps['evClient'];
}

export function SimAutoPlay({ d, scene, sandbox, settings, evClient }: SimAutoPlayProps) {
  const ap = scene.autoPlay;
  const autoPanel =
    ap?.enabled || (sandbox && scene.ui?.showSettings) ? (
      <AutoPlayPanel
        evClient={evClient}
        settings={settings}
        defaultStrategy={ap?.defaultStrategy}
        compare={ap?.compare}
        bankroll={scene.bankroll}
        seed={scene.seed}
        sixCard={sandbox ? d.view.sixCard.setting : null}
        handOptions={ap?.handOptions}
        sessionOptions={ap?.sessions}
        onEvent={(e) => {
          if (e.type === 'auto-play-completed')
            d.autoPlayCompleted(e.hands, e.strategy as StrategyId);
        }}
      />
    ) : null;
  return sandbox && autoPanel ? (
    <details class="sim-autoplay" open={!!ap?.defaultStrategy}>
      <summary>Auto-play</summary>
      {autoPanel}
    </details>
  ) : (
    autoPanel
  );
}
