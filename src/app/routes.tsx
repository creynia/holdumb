import type { VNode } from 'preact';
import { matchPath } from './router';
import type { ParsedHash } from './router';
import { BetDetail, BetsList } from './screens/Bets';
import { Drill } from './screens/Drill';
import { Glossary } from './screens/Glossary';
import { Hands } from './screens/Hands';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { LessonView } from './screens/Lesson';
import { More } from './screens/More';
import { NotFound } from './screens/NotFound';
import { Play } from './screens/Play';
import { Settings } from './screens/Settings';
import { About } from './screens/About';
import { Sources } from './screens/Sources';
import { Strategy } from './screens/Strategy';

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
