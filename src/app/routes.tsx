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
