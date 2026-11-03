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
/** The screen's name for the document title; undefined keeps the SEO title (Home). */
/** What a route name can look up in the loaded content. */
export interface NameContext {
  lessonTitle(id: string): string | undefined;
  wagerName(id: string): string | undefined;
}
type Name = (p: Record<string, string>, c: NameContext) => string | undefined;

export const ROUTES: { pattern: string; render: Render; name: Name }[] = [
  { pattern: '/', render: () => <Home />, name: () => undefined },
  { pattern: '/learn', render: () => <Learn />, name: () => 'Learn' },
  {
    pattern: '/learn/:lessonId',
    render: (p) => <LessonView id={p.lessonId!} />,
    name: (p, c) =>
      c.lessonTitle(p.lessonId!) ? `${c.lessonTitle(p.lessonId!)} · Learn` : 'Learn',
  },
  { pattern: '/play', render: (_p, r) => <Play query={r.query} />, name: () => 'Practice table' },
  { pattern: '/drill', render: (_p, r) => <Drill query={r.query} />, name: () => 'Drill' },
  {
    pattern: '/strategy',
    render: (_p, r) => <Strategy query={r.query} />,
    name: () => 'Strategy charts',
  },
  { pattern: '/hands', render: () => <Hands />, name: () => 'Hand rankings' },
  { pattern: '/bets', render: () => <BetsList />, name: () => 'Paytables' },
  {
    pattern: '/bets/:wagerId',
    render: (p) => <BetDetail id={p.wagerId!} />,
    name: (p, c) => c.wagerName(p.wagerId!) ?? 'Not found',
  },
  { pattern: '/glossary', render: (_p, r) => <Glossary query={r.query} />, name: () => 'Glossary' },
  { pattern: '/settings', render: () => <Settings />, name: () => 'Settings' },
  { pattern: '/sources', render: () => <Sources />, name: () => 'Sources' },
  { pattern: '/about', render: () => <About />, name: () => 'About' },
  { pattern: '/more', render: () => <More />, name: () => 'More' },
];

export function renderRoute(route: ParsedHash): VNode {
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, route.path);
    if (params) return r.render(params, route);
  }
  return <NotFound />;
}

/**
 * The screen name for the document title ("Drill · holdumb"), or undefined on Home, which keeps
 * the SEO title. Unknown paths name the not-found screen.
 */
export function routeName(route: ParsedHash, c: NameContext): string | undefined {
  for (const r of ROUTES) {
    const params = matchPath(r.pattern, route.path);
    if (params) return r.name(params, c);
  }
  return 'Not found';
}
