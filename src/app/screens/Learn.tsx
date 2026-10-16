import { Link } from '../components/Link';
import { useContent, useStore } from '../context';
import { FINAL_EXAM_ID, hasPerfectStrategyBadge } from '../store';

const MARK = { done: '✓', progress: '◐', new: '○' } as const;
const WORD = { done: 'Complete', progress: 'In progress', new: 'New' } as const;

export function Learn() {
  const content = useContent();
  const store = useStore();
  const badge = hasPerfectStrategyBadge(content, store);
  const byId = new Map(content.lessons.map((l) => [l.id, l]));
  return (
    <div class="page">
      <h1>Learn</h1>
      <Link to="/strategy" class="card tile strategy-card">
        <strong>Strategy charts</strong>
        <span class="muted">
          The cheat sheet: what to bet with every starting hand, flop and river.
        </span>
      </Link>
      {content.chapters.map((ch) => {
        const ls = ch.lessons.map((id) => byId.get(id)).filter((l) => l !== undefined);
        const done = ls.filter((l) => store.status(l.id) === 'done').length;
        return (
          <section key={ch.id} class="chapter" data-chapter={ch.id}>
            <header>
              <h2>{ch.title}</h2>
              <span class="muted">
                {done}/{ls.length} complete
              </span>
            </header>
            {ch.summary && <p class="muted">{ch.summary}</p>}
            <progress
              class="bar"
              max={ls.length || 1}
              value={done}
              aria-label={`${ch.title} progress`}
            />
            <ol class="lesson-list">
              {ls.map((l) => {
                const st = store.status(l.id);
                return (
                  <li key={l.id}>
                    <Link to={`/learn/${l.id}`} class={`lesson-row st-${st}`}>
                      <span class="mark" aria-hidden="true">
                        {MARK[st]}
                      </span>
                      <span class="lesson-main">
                        <strong>
                          {l.title}
                          {badge && l.id === FINAL_EXAM_ID && (
                            <span class="badge tier-fair"> Perfect Strategy</span>
                          )}
                        </strong>
                        <span class="muted">{l.summary}</span>
                      </span>
                      <span class="muted nowrap">
                        {l.minutes} min<span class="sr"> , {WORD[st]}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
