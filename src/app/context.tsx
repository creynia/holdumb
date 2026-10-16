import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useReducer } from 'preact/hooks';
import type { ContentBundle } from '../content/types';
import { Store } from './store';

const ContentCtx = createContext<ContentBundle | null>(null);
const StoreCtx = createContext<Store | null>(null);
/** Bumped on every store change so consumers re-render even when `children` is the same vnode. */
const VersionCtx = createContext(0);

export function AppProviders(props: {
  content: ContentBundle;
  store: Store;
  children: ComponentChildren;
}) {
  const [version, tick] = useReducer((n: number) => n + 1, 0);
  const bump = () => tick(0);
  useEffect(() => {
    const off = props.store.subscribe(bump);
    const flush = () => props.store.flush();
    // Android often skips pagehide when the tab is backgrounded, so flush on hidden too.
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      off();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [props.store]);
  return (
    <ContentCtx.Provider value={props.content}>
      <StoreCtx.Provider value={props.store}>
        <VersionCtx.Provider value={version}>{props.children}</VersionCtx.Provider>
      </StoreCtx.Provider>
    </ContentCtx.Provider>
  );
}

export function useContent(): ContentBundle {
  const c = useContext(ContentCtx);
  if (!c) throw new Error('useContent outside AppProviders');
  return c;
}

/** The store; the provider re-renders the tree on every change, so reads are always fresh. */
export function useStore(): Store {
  const s = useContext(StoreCtx);
  useContext(VersionCtx); // subscribe to store changes
  if (!s) throw new Error('useStore outside AppProviders');
  return s;
}
