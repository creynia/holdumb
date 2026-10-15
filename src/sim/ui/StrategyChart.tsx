// WP0 placeholder. TODO(table-ui) replaces it (data from src/sim/strategy).
import type { StrategyId } from '../strategy/types';

export function StrategyChart({ strategy, view }: { strategy: StrategyId; view: string }) {
  return (
    <div class="strategy-chart" data-testid="strategy-chart">
      {strategy} / {view}
    </div>
  );
}
