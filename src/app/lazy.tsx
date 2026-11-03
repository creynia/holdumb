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

// A failed chunk load (offline before the SW cached it, a flaky network) must not be cached:
// the rejected promise is dropped so the next attempt (Retry, or the next visit) starts afresh.
function loadContent(): Promise<ContentBundle> {
  contentPromise ??= import('virtual:content').then(
    (m) => (contentDone = m.default),
    (err: unknown) => {
      contentPromise = undefined;
      throw err;
    },
  );
  return contentPromise;
}

function start<P>(e: Entry<P>): Promise<ComponentType<P>> {
  e.pending ??= e.load().then(
    (c) => (e.done = c),
    (err: unknown) => {
      e.pending = undefined;
      throw err;
    },
  );
  return e.pending;
}

/**
 * Browsers remember a failed dynamic import of the same URL, so a plain re-import cannot recover;
 * a reload re-requests everything and the hash keeps the route.
 */
function retry(): void {
  location.reload();
}

export const LOAD_FAILED = "Couldn't load this page.";
export const LOAD_FAILED_HELP = 'Check your connection and try again.';

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
    const [failed, setFailed] = useState(false);
    const ready = !!entry.done && (!needsContent || !!content);
    useEffect(() => {
      if (ready || failed) return;
      let live = true;
      const jobs: Promise<unknown>[] = [start(entry)];
      if (needsContent && !provided) jobs.push(loadContent());
      Promise.all(jobs).then(
        () => live && force((n) => n + 1),
        () => live && setFailed(true),
      );
      return () => {
        live = false;
      };
    }, [ready, failed]);
    if (failed) {
      return (
        <div class="page route-failed" data-testid="route-failed">
          <h1>{LOAD_FAILED}</h1>
          <p class="muted">{LOAD_FAILED_HELP}</p>
          <button type="button" class="btn" onClick={retry}>
            Retry
          </button>
        </div>
      );
    }
    if (!ready || !entry.done) {
      // A visible skeleton that reserves roughly a screen, so nothing blank flashes and the tab
      // bar and scroll position do not jump. Not a live region: it is silent.
      return (
        <div class="page route-loading" aria-busy="true">
          <p class="muted">Loading…</p>
          <span class="skel-block" aria-hidden="true" />
          <span class="skel-block" aria-hidden="true" />
        </div>
      );
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
    // A failed load leaves the placeholders; the next visit tries again (see loadContent).
    loadContent().then(
      () => live && force((n) => n + 1),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [provided, wanted]);
  return provided ?? contentDone ?? null;
}
