import { Link } from '../components/Link';
import { OfflineLink } from '../components/OfflineLink';
import { ProgressRing } from '../components/ProgressRing';
import { useContent, useStore } from '../context';
import { hasPerfectStrategyBadge, nextLesson, overallProgress } from '../store';

export function Home() {
  const content = useContent();
  const store = useStore();
  const next = nextLesson(content, store);
  const nextL = content.lessons.find((l) => l.id === next);
  const { done, total } = overallProgress(content, store);
  const badge = hasPerfectStrategyBadge(content, store);
  const started = done > 0 || content.lessons.some((l) => store.status(l.id) === 'progress');
  return (
    <div class="page">
      <section class="hero">
        <ProgressRing done={done} total={total} />
        <div>
          <h1>Learn Ultimate Texas Hold&apos;em</h1>
          <p class="muted">Lessons, odds and a practice table. Nothing here costs real money.</p>
        </div>
      </section>
      {badge && (
        <p class="card badge-card">
          <span class="badge tier-fair">Perfect Strategy</span> You passed the final exam with 80%
          or better.
        </p>
      )}
      {nextL ? (
        <Link to={`/learn/${nextL.id}`} class="btn btn-big">
          {started ? 'Continue' : 'Start'}: {nextL.title}
        </Link>
      ) : total > 0 ? (
        <p class="card">All lessons complete. Head to the practice table.</p>
      ) : (
        <p class="card">No lessons yet.</p>
      )}
      <div class="grid">
        <Link to="/learn" class="card tile">
          <strong>Learn</strong>
          <span class="muted">All lessons, by chapter</span>
        </Link>
        <Link to="/play" class="card tile">
          <strong>Play</strong>
          <span class="muted">Practice table with EV</span>
        </Link>
        <Link to="/drill" class="card tile">
          <strong>Drill</strong>
          <span class="muted">Quick-fire decisions</span>
        </Link>
        <Link to="/strategy" class="card tile">
          <strong>Strategy charts</strong>
          <span class="muted">What to do with every hand</span>
        </Link>
      </div>
      <OfflineLink />
    </div>
  );
}
