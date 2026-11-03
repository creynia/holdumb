import type { VNode } from 'preact';
import { matchPath } from './router';
import type { ParsedHash } from './router';
import { Drill } from './screens/Drill';
import { NotFound } from './screens/NotFound';
import { Play } from './screens/Play';
import { lazyScreen } from './lazy';

// Play and Drill are the first-paint screens and stay in the entry chunk; the rest load on demand.
const Home = lazyScreen(() => import('./screens/Home').then((m) => m.Home), true);
const Learn = lazyScreen(() => import('./screens/Learn').then((m) => m.Learn), true);
const LessonView = lazyScreen(() => import('./screens/Lesson').then((m) => m.LessonView), true);
const Strategy = lazyScreen(() => import('./screens/Strategy').then((m) => m.Strategy), true);
const Hands = lazyScreen(() => import('./screens/Hands').then((m) => m.Hands), true);
const BetsList = lazyScreen(() => import('./screens/Bets').then((m) => m.BetsList), true);
const BetDetail = lazyScreen(() => import('./screens/Bets').then((m) => m.BetDetail), true);
const Glossary = lazyScreen(() => import('./screens/Glossary').then((m) => m.Glossary), true);
const Sources = lazyScreen(() => import('./screens/Sources').then((m) => m.Sources), true);
const Settings = lazyScreen(() => import('./screens/Settings').then((m) => m.Settings));
const About = lazyScreen(() => import('./screens/About').then((m) => m.About));
const More = lazyScreen(() => import('./screens/More').then((m) => m.More));

type Render = (p: Record<string, string>, r: ParsedHash) => VNode;

export const ROUTES: { pattern: string; render: Render }[] = [
  { pattern: '/', render: () => <Home /> },
  { pattern: '/learn', render: () => <Learn /> },
  { pattern: '/learn/:lessonId', render: (p) => <LessonView id={p.lessonId!} /> },
  { pattern: '/play', render: (_p, r) => <Play query={r.query} /> },
  { pattern: '/drill', render: (_p, r) => <Drill query={r.query} /> },
  { pattern: '/strategy', render: (_p, r) => <Strategy query={r.query} /> },
  { pattern: '/hands', render: () => <Hands /> },
  { pattern: '/bets', render: () => <BetsList /> },
  { pattern: '/bets/:wagerId', render: (p) => <BetDetail id={p.wagerId!} /> },
  { pattern: '/glossary', render: (_p, r) => <Glossary query={r.query} /> },
  { pattern: '/settings', render: () => <Settings /> },
  { pattern: '/sources', render: () => <Sources /> },
  { pattern: '/about', render: () => <About /> },
  { pattern: '/more', render: () => <More /> },
];

export function renderRoute(route: ParsedHash): VNode {
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, route.path);
    if (params) return r.render(params, route);
  }
  return <NotFound />;
}
