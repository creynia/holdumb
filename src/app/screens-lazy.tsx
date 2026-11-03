// PWA build: every screen except Play and Home (the first-paint screens, kept in the entry
// chunk) is its own chunk, loaded on first visit and precached by the service worker (I039).
// vite.config.ts aliases `#screens` here; the single-file build uses ./screens-static instead.
import { lazyScreen } from './lazy';

export { Home } from './screens/Home';
export const Drill = lazyScreen(() => import('./screens/Drill').then((m) => m.Drill), true);
export const Learn = lazyScreen(() => import('./screens/Learn').then((m) => m.Learn), true);
export const LessonView = lazyScreen(
  () => import('./screens/Lesson').then((m) => m.LessonView),
  true,
);
export const Strategy = lazyScreen(
  () => import('./screens/Strategy').then((m) => m.Strategy),
  true,
);
export const Hands = lazyScreen(() => import('./screens/Hands').then((m) => m.Hands), true);
export const BetsList = lazyScreen(() => import('./screens/Bets').then((m) => m.BetsList), true);
export const BetDetail = lazyScreen(() => import('./screens/Bets').then((m) => m.BetDetail), true);
export const Glossary = lazyScreen(
  () => import('./screens/Glossary').then((m) => m.Glossary),
  true,
);
export const Sources = lazyScreen(() => import('./screens/Sources').then((m) => m.Sources), true);
export const Settings = lazyScreen(() => import('./screens/Settings').then((m) => m.Settings));
export const About = lazyScreen(() => import('./screens/About').then((m) => m.About));
export const More = lazyScreen(() => import('./screens/More').then((m) => m.More));
