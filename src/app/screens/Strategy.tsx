import { Html } from '../components/Html';
import { Link } from '../components/Link';
import { ChartBlock } from '../components/ChartBlock';
import { useContent } from '../context';
import { navigate } from '../router';
import type { ChartBlockData } from '../../content/types';

type Lens = 'perfect' | 'practical' | 'fun';
const LENSES: { id: Lens; label: string; strategy: ChartBlockData['strategy'] }[] = [
  { id: 'perfect', label: 'Lowest edge', strategy: 'perfect' },
  { id: 'practical', label: 'Practical', strategy: 'basic' },
  { id: 'fun', label: 'Fun per dollar', strategy: 'perfect' },
];
const VIEWS: { view: ChartBlockData['view']; label: string }[] = [
  { view: 'preflop-grid', label: 'Before the flop' },
  { view: 'flop', label: 'On the flop' },
  { view: 'river', label: 'On the river' },
];

/** `#/strategy?lens=perfect|practical|fun&highlight=AKs` (D4: no tab; reached from Learn, More, Drill). */
export function Strategy({ query }: { query: URLSearchParams }) {
  const content = useContent();
  const raw = query.get('lens');
  const lens = LENSES.find((l) => l.id === raw) ?? LENSES[0]!;
  const hl = query.get('highlight');
  const highlight = hl ? hl.split(',').filter(Boolean) : undefined;
  const copy = content.strategy[lens.strategy];
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Strategy charts</h1>
      <div class="segmented" role="group" aria-label="Strategy lens">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            class="seg"
            aria-pressed={l.id === lens.id}
            onClick={() => navigate(`/strategy?lens=${l.id}`)}
          >
            {l.label}
          </button>
        ))}
      </div>
      {copy && (
        <section>
          <h2>{copy.title}</h2>
          <p class="muted">{copy.summary}</p>
          <ul class="rules">
            {copy.rules.map((r, i) => (
              <li key={i}>
                <Html html={r} />
              </li>
            ))}
          </ul>
          {lens.id === 'practical' && (
            <p class="muted source-credit">
              Basic strategy as published by the Wizard of Odds (Michael Shackleford), flop and
              river rules after James Grosjean; every EV recomputed by holdumb.{' '}
              <Link to="/sources">See Sources</Link>.
            </p>
          )}
        </section>
      )}
      {VIEWS.map((v) => (
        <section key={v.view} data-view={v.view}>
          <h2>{v.label}</h2>
          <ChartBlock
            chart={{ strategy: lens.strategy, view: v.view, ...(highlight ? { highlight } : {}) }}
          />
        </section>
      ))}
    </div>
  );
}
