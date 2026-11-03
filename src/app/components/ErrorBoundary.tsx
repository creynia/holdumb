// App-level error boundary (I074). Wraps only the routed screen, so the Shell and the tab bar stay
// alive when a screen throws while rendering. Also the window-level error toast.
import { Component } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { onUpdateAvailable } from '../../pwa/register';
import { trackError } from '../analytics';

interface Props {
  /** The route path, for the analytics event (no query string, no PII). */
  route: string;
  /** Clear only the sandbox snapshot and remount the screen. */
  onReset: () => void;
  children: ComponentChildren;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    trackError(this.props.route, error instanceof Error ? error.message : String(error));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section class="error-screen" role="alert" data-testid="error-screen">
        <h1>This screen hit a problem</h1>
        <p>
          {this.props.route === '/play'
            ? 'Reload usually fixes it. If it keeps happening, reset the table. That clears the practice table only. Lessons and stats are kept.'
            : 'Your progress is safe. Reloading usually fixes it.'}
        </p>
        <p class="error-actions">
          <button type="button" class="btn" onClick={() => location.reload()}>
            Reload
          </button>
          {this.props.route === '/play' && (
            <button
              type="button"
              class="btn"
              onClick={() => {
                this.props.onReset();
                this.setState({ error: null });
              }}
            >
              Reset table
            </button>
          )}
        </p>
        <p class="error-build">
          Build <span data-testid="error-build-sha">{__BUILD_SHA__}</span>
        </p>
      </section>
    );
  }
}

/** Shows a short notice for uncaught errors and rejected promises outside rendering. */
/** Chrome reports these harmlessly when a ResizeObserver callback needs another frame. */
export const isBenignError = (message: string) => /^ResizeObserver loop/.test(message);

export function ErrorToast({ route }: { route: string }) {
  const [shown, setShown] = useState(false);
  // One top-bar notice at a time: the update toast (I037's Reload target) wins.
  const [updating, setUpdating] = useState(false);
  useEffect(() => onUpdateAvailable(() => setUpdating(true)), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (message: string) => {
      if (isBenignError(message)) return;
      trackError(route, message);
      setShown(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShown(false), 6000);
    };
    const onError = (e: ErrorEvent) => on(e.message || 'error');
    const onRejection = (e: PromiseRejectionEvent) =>
      on(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [route]);
  if (!shown || updating) return null;
  return (
    <div class="toast error-toast" role="status" data-testid="error-toast">
      <span>Something went wrong</span>
    </div>
  );
}
