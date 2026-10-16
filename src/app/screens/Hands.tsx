import { HAND_CATEGORIES } from '../../sim/engine';
import { Cards } from '../components/Cards';
import { Link } from '../components/Link';
import { useContent } from '../context';

/** D8: the always-available hand-ranking card (More -> Hand rankings, and from the table). */
export function Hands() {
  const { hands } = useContent();
  const order = [...HAND_CATEGORIES].reverse();
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Hand rankings</h1>
      <p class="muted">Strongest first. Suits never break ties.</p>
      <ol class="rankings">
        {order.map((c, i) => {
          const h = hands[c];
          return (
            <li key={c} class="card rank-row" data-category={c}>
              <span class="rank-n" aria-hidden="true">
                {i + 1}
              </span>
              <div class="rank-main">
                <strong>{h?.name ?? c}</strong>
                {h && <Cards cards={h.example} />}
                {h?.summary && <span class="muted">{h.summary}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
