import { useEffect, useReducer, useRef } from 'preact/hooks';
import { UpdateToast, type UpdateSubscribe } from './components/UpdateToast';
import { Shell } from './components/Shell';
import { useStore } from './context';
import { consumeFreshNav, useRoute } from './router';
import { renderRoute } from './routes';
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

export function App(props: { onUpdateAvailable?: UpdateSubscribe }) {
  const route = useRoute();
  const store = useStore();
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
  // Move focus to the page after a route change (not on first load).
  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route.path]);

  // Remember scroll per hash; top on new navigation, restore on back/forward into a lesson.
  useEffect(() => {
    const hash = route.hash;
    const fresh = consumeFreshNav();
    const saved = readScroll()[hash];
    const y = !fresh && route.path.startsWith('/learn/') && saved ? saved : 0;
    if (route.query.get('term') === null) window.scrollTo?.(0, y);
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
      {props.onUpdateAvailable && <UpdateToast subscribe={props.onUpdateAvailable} />}
    </Shell>
  );
}
