// WP0 placeholder. TODO(integration) replaces it with the real container (engine + EvClient + UI + scenes).
import type { SimulatorProps } from './types';

export function Simulator({ scene }: SimulatorProps) {
  return (
    <section class="sim-placeholder" data-testid="simulator" aria-label="Table">
      <h2>Table coming soon</h2>
      <p>{scene ? `Scene: ${scene.id}` : 'Sandbox'}</p>
    </section>
  );
}
