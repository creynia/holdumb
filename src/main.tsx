import { render } from 'preact';
import content from 'virtual:content';
import { App } from './app/App';
import { AppProviders } from './app/context';
import { Store } from './app/store';
import { applyTheme } from './app/theme';
import { registerSW } from './pwa/register';
import { UpdateToast } from './pwa/UpdateToast';
import './app/styles/tokens.css';
import './app/styles/app.css';
import './app/test-hook';

const store = new Store();
applyTheme(store.settings);
registerSW();

render(
  <AppProviders content={content} store={store}>
    <App />
    <UpdateToast />
  </AppProviders>,
  document.getElementById('app')!,
);
