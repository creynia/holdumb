import { Link } from '../components/Link';
import { OfflineLink } from '../components/OfflineLink';

export function More() {
  return (
    <div class="page">
      <h1>More</h1>
      <div class="grid">
        <Link to="/strategy" class="card tile">
          <strong>Strategy charts</strong>
          <span class="muted">What to bet with every hand</span>
        </Link>
        <Link to="/hands" class="card tile">
          <strong>Hand rankings</strong>
          <span class="muted">Best to worst, with examples</span>
        </Link>
        <Link to="/bets" class="card tile">
          <strong>Paytables</strong>
          <span class="muted">Blind and Trips payouts</span>
        </Link>
        <Link to="/glossary" class="card tile">
          <strong>Glossary</strong>
          <span class="muted">Poker words, explained</span>
        </Link>
        <Link to="/sources" class="card tile">
          <strong>Sources</strong>
          <span class="muted">Where the rules, figures and strategies come from</span>
        </Link>
        <Link to="/settings" class="card tile">
          <strong>Settings</strong>
          <span class="muted">Table, theme, your progress</span>
        </Link>
        <Link to="/about" class="card tile">
          <strong>About</strong>
          <span class="muted">Version and updates</span>
        </Link>
      </div>
      <OfflineLink />
    </div>
  );
}
