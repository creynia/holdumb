import { Link } from '../components/Link';
import { useContent, useStore } from '../context';
import { STATUS_WORD, SKILL_WINDOW, skillRow } from '../skills';
import { lensStats } from '../storage';
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
      {content.skills.length > 0 && (
        <section class="card skills" aria-labelledby="skills-h" data-testid="skills">
          <h2 id="skills-h">Your skills</h2>
          <p class="muted">
            From your last {SKILL_WINDOW} Drill answers in each area. It is a guide to what to
            practise next, not a score.
          </p>
          <ul class="skill-list">
            {content.skills.map((sk) => {
              const r = skillRow(sk, lensStats(store.drill));
              return (
                <li key={sk.id} class="skill-row" data-skill={sk.id} data-status={r.status}>
                  <span class="skill-main">
                    <strong>{sk.title}</strong>{' '}
                    <span
                      class={`badge ${r.status === 'solid' ? 'tier-good' : r.status === 'practising' ? 'tier-fair' : ''}`}
                    >
                      {STATUS_WORD[r.status]}
                    </span>
                  </span>
                  <span class="muted skill-detail">
                    {r.accuracy === null
                      ? `${r.answers} of 5 answers so far`
                      : `${Math.round(r.accuracy * 100)}% of your last ${r.answers}`}
                  </span>
                  {r.status !== 'solid' && (
                    <span class="skill-links">
                      {r.status === 'practising' && (
                        <Link to={`/learn/${sk.lessonId}`}>Review the lesson</Link>
                      )}
                      <Link to={`/drill?category=${r.drillCategory}`}>Practise in Drill</Link>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
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
