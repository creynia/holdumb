import type { ComponentType } from 'preact';
import { StrategyChart } from '../../sim';
import type { ChartBlockData } from '../../content/types';

// The placeholder StrategyChart only takes { strategy, view }; the table-ui version also takes
// `highlight` (ChartBlockData). Typing it by the content shape lets both compile.
const Chart = StrategyChart as unknown as ComponentType<ChartBlockData>;

export function ChartBlock({ chart }: { chart: ChartBlockData }) {
  return (
    <figure class="card chart-block" data-testid="chart-block">
      <Chart {...chart} />
    </figure>
  );
}
