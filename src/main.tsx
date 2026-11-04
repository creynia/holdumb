import { render } from 'preact';
import { HASH } from './app/demo-heavy';
(window as unknown as { __demo: number }).__demo = HASH;
import content from '#content';
import { Announcer } from './app/announcer';
import { App } from './app/App';
import { AppProviders } from './app/context';
import { Store } from './app/store';
import { applyTheme } from './app/theme';
import { registerSW } from './pwa/register';
import './app/styles/tokens.css';
import './app/styles/app.css';

const store = new Store();
applyTheme(store.settings);
registerSW();
// The e2e test hook loads after first paint, so its EV clients stay out of Home's JS (I095).
void import('./app/test-hook');

render(
  <AppProviders content={content} store={store}>
    <App />
    <Announcer />
  </AppProviders>,
  document.getElementById('app')!,
);
