import { render } from 'preact';
import './app/styles/tokens.css';
import './app/test-hook';

// WP0 shell. TODO(app) replaces it with the real app (router, store, screens).
render(
  <main>
    <h1>holdumb</h1>
    <p>Ultimate Texas Hold&apos;em, from zero to perfect strategy. Under construction.</p>
  </main>,
  document.getElementById('app')!,
);
