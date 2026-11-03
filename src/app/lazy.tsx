import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ContentBundle } from '../content/types';
import { ContentProvider, useProvidedContent } from './context';

// Route-level code splitting. In the PWA build each screen (and the compiled lesson bundle,
// `virtual:content`) is its own chunk, precached by the service worker. The single-file build
// inlines dynamic imports, so it stays one file and works from file://.

type Loader<P> = () => Promise<ComponentType<P>>;

interface Entry<P> {
  load: Loader<P>;
  needsContent: boolean;
  done?: ComponentType<P>;
  pending?: Promise<ComponentType<P>>;
}

const entries: Entry<never>[] = [];
let contentPromise: Promise<ContentBundle> | undefined;
let contentDone: ContentBundle | undefined;

function loadContent(): Promise<ContentBundle> {
  contentPromise ??= import('virtual:content').then((m) => (contentDone = m.default));
  return contentPromise;
}

function start<P>(e: Entry<P>): Promise<ComponentType<P>> {
  e.pending ??= e.load().then((c) => (e.done = c));
  return e.pending;
}

/** Resolves every lazy screen and the content bundle (tests, and warming after first paint). */
export async function preloadRoutes(withContent = true): Promise<void> {
  await Promise.all([...(withContent ? [loadContent()] : []), ...entries.map((e) => start(e))]);
}

/** A route component loaded on first use. `needsContent` screens read `useContent()`. */
export function lazyScreen<P extends object>(
  load: Loader<P>,
  needsContent = false,
): ComponentType<P> {
  const entry: Entry<P> = { load, needsContent };
  entries.push(entry as Entry<never>);
  function Lazy(props: P) {
    const provided = useProvidedContent();
    const content = provided ?? (needsContent ? contentDone : null) ?? null;
    const [, force] = useState(0);
    const ready = !!entry.done && (!needsContent || !!content);
    useEffect(() => {
      if (ready) return;
      let live = true;
      const jobs: Promise<unknown>[] = [start(entry)];
      if (needsContent && !provided) jobs.push(loadContent());
      void Promise.all(jobs).then(() => live && force((n) => n + 1));
      return () => {
        live = false;
      };
    }, [ready]);
    if (!ready || !entry.done) {
      // Reserves roughly a screen of height so the tab bar and scroll position do not jump.
      return <div class="route-loading" aria-busy="true" style={{ minHeight: '70vh' }} />;
    }
    const C = entry.done;
    const body = <C {...props} />;
    return provided || !content ? (
      body
    ) : (
      <ContentProvider content={content}>{body}</ContentProvider>
    );
  }
  return Lazy;
}

/**
 * The content bundle for code outside a lazy screen: the provided one (tests), else the lazily
 * loaded one once `wanted`. Null until it arrives.
 */
export function useRouteContent(provided: ContentBundle | null, wanted: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (provided || !wanted || contentDone) return;
    let live = true;
    void loadContent().then(() => live && force((n) => n + 1));
    return () => {
      live = false;
    };
  }, [provided, wanted]);
  return provided ?? contentDone ?? null;
}
