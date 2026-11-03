// The one place the app speaks to screen readers (I036). Components call `announce()` instead of
// owning an aria-live region; the app renders two hidden regions (polite, assertive) from it.
// Framework-free so the sim, the app and (through a window event) the PWA layer can share it.
import { useEffect } from 'preact/hooks';

export type Politeness = 'polite' | 'assertive';
export interface AnnounceOptions {
  politeness?: Politeness;
  /** A later message with the same key replaces an earlier one still waiting to be spoken. */
  dedupeKey?: string;
  /** Speak even while muted (the start and the summary of an auto-play run). */
  force?: boolean;
}

export const ANNOUNCE_EVENT = 'holdumb:announce';
/** Messages inside this window are spoken together as one update. */
export const COALESCE_MS = 250;

type Listener = (politeness: Politeness, text: string) => void;
interface Pending {
  key: string | undefined;
  text: string;
}

const listeners = new Set<Listener>();
const queue: Record<Politeness, Pending[]> = { polite: [], assertive: [] };
const timers: Partial<Record<Politeness, ReturnType<typeof setTimeout>>> = {};
let muted = 0;
let seq = 0;

function flush(p: Politeness): void {
  timers[p] = undefined;
  const text = queue[p].map((m) => m.text).join(' ');
  queue[p] = [];
  if (text) listeners.forEach((l) => l(p, text));
}

export function announce(text: string, opts: AnnounceOptions = {}): void {
  const t = text.trim();
  if (!t || (muted > 0 && !opts.force)) return;
  const p = opts.politeness ?? 'polite';
  const key = opts.dedupeKey;
  const q = queue[p];
  const i = key === undefined ? -1 : q.findIndex((m) => m.key === key);
  if (i >= 0) q[i] = { key, text: t };
  else q.push({ key: key ?? `#${++seq}`, text: t });
  timers[p] ??= setTimeout(() => flush(p), COALESCE_MS);
}

/** Silences everything not `force`d until the returned function is called (auto-play runs). */
export function muteAnnouncements(): () => void {
  muted++;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      muted--;
    }
  };
}

export function subscribeAnnouncements(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Tests: speak what is queued now, or drop everything. */
export function flushAnnouncements(): void {
  for (const p of ['polite', 'assertive'] as const) {
    if (timers[p]) clearTimeout(timers[p]);
    flush(p);
  }
}
export function resetAnnouncer(): void {
  for (const p of ['polite', 'assertive'] as const) {
    if (timers[p]) clearTimeout(timers[p]);
    timers[p] = undefined;
    queue[p] = [];
  }
  muted = 0;
}

/** Renders nothing; announces `text` when it appears or changes (for conditionally shown notes). */
export function Say(props: { text: string | null | undefined } & AnnounceOptions): null {
  const { text, ...opts } = props;
  useAnnounce(text, opts);
  return null;
}

/** Announces `text` whenever it changes to something non-empty. */
export function useAnnounce(text: string | null | undefined, opts: AnnounceOptions = {}): void {
  useEffect(() => {
    if (text) announce(text, opts);
  }, [text]);
}
