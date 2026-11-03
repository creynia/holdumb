import { useEffect, useReducer, useRef } from 'preact/hooks';
import { pagePath, trackPage } from './analytics';
import { Shell } from './components/Shell';
import { useContent, useStore } from './context';
import { consumeFreshNav, useRoute } from './router';
import { renderRoute, routeName } from './routes';
import { wagerName } from './screens/Bets';
import { applyTheme, onReducedMotionChange } from './theme';

const SCROLL_KEY = 'holdumb:scroll';

function readScroll(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function writeScroll(hash: string, y: number) {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ ...readScroll(), [hash]: y }));
  } catch {
    /* ignore */
  }
}

/** The SEO title from index.html: Home keeps it. */
const HOME_TITLE = typeof document === 'undefined' ? '' : document.title;

export function App() {
  const route = useRoute();
  const store = useStore();
  const content = useContent();
  const { theme, animationSpeed, reduceMotion, fourColorDeck } = store.settings;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => applyTheme(store.settings), [theme, animationSpeed, reduceMotion, fourColorDeck]);
  // OS reduced-motion preference can change while the app is open.
  useEffect(
    () =>
      onReducedMotionChange(() => {
        applyTheme(store.settings);
        rerender(0);
      }),
    [store],
  );
  // The document title names the screen, so tabs, history and screen readers can tell pages apart.
  // Runs before the page view, which records document.title.
  useEffect(() => {
    const name = routeName(route, {
      lessonTitle: (id) => content.lessons.find((l) => l.id === id)?.title,
      wagerName: (id) => wagerName(id, content.bets),
    });
    document.title = name ? `${name} · holdumb` : HOME_TITLE;
  }, [route.path, content]);
  // One anonymous page view per route (path only; query strings are dropped).
  useEffect(() => trackPage(pagePath(location.pathname, route.path)), [route.path]);
  // Move focus to the page after a route change (not on first load).
  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    // A strategy view target focuses its own section heading (Strategy.tsx); keep that focus.
    const view = route.query.get('view');
    if (route.path === '/strategy' && (view === 'flop' || view === 'river')) return;
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route.path]);

  // Remember scroll per hash; top on new navigation, restore on back/forward into a lesson.
  useEffect(() => {
    const hash = route.hash;
    const fresh = consumeFreshNav();
    const saved = readScroll()[hash];
    const y = !fresh && route.path.startsWith('/learn/') && saved ? saved : 0;
    // A strategy `view` target (Drill's "See the chart") scrolls itself; don't reset it here.
    const view = route.query.get('view');
    const viewTarget = route.path === '/strategy' && (view === 'flop' || view === 'river');
    if (route.query.get('term') === null && !viewTarget) window.scrollTo?.(0, y);
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => writeScroll(hash, window.scrollY));
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, [route.hash]);

  return (
    <Shell
      path={route.path}
      banner={
        store.persistent ? undefined : (
          <p class="banner" role="status">
            Progress will not be saved in this copy. Use Settings, then Export, to keep it.
          </p>
        )
      }
    >
      {renderRoute(route)}
    </Shell>
  );
}
