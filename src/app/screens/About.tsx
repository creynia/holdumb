import { useState } from 'preact/hooks';
import { Link } from '../components/Link';
import { UPDATE_MESSAGE, checkForUpdates } from '../update';
import type { UpdateCheck } from '../update';

export function About(props: { check?: () => Promise<UpdateCheck> }) {
  const check = props.check ?? checkForUpdates;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>About</h1>
      <dl class="facts">
        <div>
          <dt>Version</dt>
          <dd data-testid="version">{__APP_VERSION__}</dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd data-testid="build-sha">{__BUILD_SHA__}</dd>
        </div>
      </dl>
      <button
        type="button"
        class="btn"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMsg('Checking...');
          void check()
            .catch((): UpdateCheck => 'failed')
            .then((r) => {
              setMsg(UPDATE_MESSAGE[r]);
              setBusy(false);
            });
        }}
      >
        Check for updates
      </button>
      <p role="status" class="muted">
        {msg}
      </p>
      <p class="muted">
        holdumb is MIT licensed. It is a practice tool: no real money, ever. Odds are for the
        standard rules shown in Paytables. Please gamble responsibly. If gambling is causing you or
        someone you know harm, call 1-800-GAMBLER (US) or find your national problem-gambling
        helpline.
      </p>
      <p class="muted">
        Ultimate Texas Hold&apos;em&reg; is a registered trademark of Bally Gaming, Inc. (Light
        &amp; Wonder); the game was invented by Roger Snow at Shuffle Master. holdumb is not
        affiliated with or endorsed by its owner.
      </p>
      <p class="muted">
        Rules, figures and strategies come from published sources, credited on the{' '}
        <Link to="/sources">Sources</Link> screen.
      </p>
    </div>
  );
}
