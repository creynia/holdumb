import { registerSW } from './pwa/register';
import { UpdateToast } from './pwa/UpdateToast';
import { render } from 'preact';
import './app/styles/tokens.css';
import './app/test-hook';

registerSW();

// WP0 shell. TODO(app) replaces it with the real app (router, store, screens).
render(
  <main>
    <UpdateToast />
    <h1>holdumb</h1>
    <p>Ultimate Texas Hold&apos;em, from zero to perfect strategy. Under construction.</p>
  </main>,
  document.getElementById('app')!,
);
