import { createTransport as createDefaultTransport } from '#ev-worker';
import { createTransport as createInThreadTransport } from './transport-inthread';
import type { Progress } from '../engine/job';
import type { EvClient, EvJobs, FromWorker, JobKind } from './protocol';
import type { Transport, TransportFactory } from './transport';

export interface EvClientOptions {
  /** Force a transport. Default: the build's worker transport, falling back to in-thread. */
  mode?: 'worker' | 'inthread';
  /** Test hook: override the worker transport factory. */
  createTransport?: TransportFactory;
  /** No pong within this many ms switches to in-thread. Default 1500. */
  pingTimeoutMs?: number;
  cacheSize?: number;
}

interface Pending {
  id: number;
  kind: JobKind;
  req: unknown;
  key?: string;
  cacheKey: string;
  resolve(res: unknown): void;
  reject(err: unknown): void;
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/** Stable JSON that survives bigint and typed arrays; used for the memo key only. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, function (this: unknown, _k: string, v: unknown) {
    if (typeof v === 'bigint') return `${v}n`;
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      return Array.from(v as unknown as ArrayLike<number>);
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(o)
          .sort()
          .map((k) => [k, o[k]]),
      );
    }
    return v;
  });
}

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

export function createEvClient(opts: EvClientOptions = {}): EvClient {
  const pingTimeoutMs = opts.pingTimeoutMs ?? 1500;
  const cacheSize = opts.cacheSize ?? 64;
  const cache = new Map<string, unknown>(); // insertion order = LRU order
  const pending = new Map<number, Pending>();
  const byKey = new Map<string, number>();
  let nextId = 1;
  let transport: Transport | null = null;
  let healthy = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function attach(t: Transport): void {
    transport = t;
    t.onMessage((m: FromWorker) => {
      if (transport !== t) return; // stale transport
      if (m.t === 'pong') {
        healthy = true;
        clearTimeout(timer);
      } else {
        const p = pending.get(m.id);
        if (!p) return;
        if (m.t === 'progress') p.onProgress?.(m.p);
        else if (m.t === 'done') settle(p, () => p.resolve(m.res), m.res);
        else settle(p, () => p.reject(new Error(m.message)));
      }
    });
    t.onError(() => {
      if (transport === t && t.kind === 'worker') fallback();
    });
    t.post({ t: 'ping' });
  }

  function settle(p: Pending, fn: () => void, result?: unknown): void {
    pending.delete(p.id);
    if (p.key && byKey.get(p.key) === p.id) byKey.delete(p.key);
    if (p.signal && p.onAbort) p.signal.removeEventListener('abort', p.onAbort);
    if (result !== undefined) {
      cache.delete(p.cacheKey);
      cache.set(p.cacheKey, result);
      if (cache.size > cacheSize) cache.delete(cache.keys().next().value as string);
    }
    fn();
  }

  function fallback(): void {
    if (disposed || transport?.kind === 'inthread') return;
    clearTimeout(timer);
    transport?.terminate();
    healthy = true;
    attach(createInThreadTransport());
    for (const p of pending.values()) {
      transport?.post({ t: 'run', id: p.id, kind: p.kind, req: p.req });
    }
  }

  function ensure(): Transport {
    if (transport) return transport;
    if (opts.mode === 'inthread') {
      attach(createInThreadTransport());
      healthy = true;
    } else {
      try {
        attach((opts.createTransport ?? createDefaultTransport)());
        timer = setTimeout(() => {
          if (!healthy) fallback();
        }, pingTimeoutMs);
      } catch {
        attach(createInThreadTransport());
        healthy = true;
      }
    }
    return transport as unknown as Transport;
  }

  return {
    run<K extends JobKind>(
      kind: K,
      req: EvJobs[K]['req'],
      o?: { key?: string; signal?: AbortSignal; onProgress?: (p: Progress) => void },
    ): Promise<EvJobs[K]['res']> {
      if (disposed) return Promise.reject(new Error('EvClient disposed'));
      if (o?.signal?.aborted) return Promise.reject(abortError());
      const cacheKey = `${kind}:${canonicalJson(req)}`;
      if (cache.has(cacheKey)) {
        const hit = cache.get(cacheKey);
        cache.delete(cacheKey);
        cache.set(cacheKey, hit);
        return Promise.resolve(hit as EvJobs[K]['res']);
      }
      const t = ensure();
      return new Promise<EvJobs[K]['res']>((resolve, reject) => {
        const id = nextId++;
        const p: Pending = {
          id,
          kind,
          req,
          key: o?.key,
          cacheKey,
          resolve,
          reject,
          onProgress: o?.onProgress,
          signal: o?.signal,
        };
        const cancel = (why: Pending): void => {
          settle(why, () => why.reject(abortError()));
          transport?.post({ t: 'cancel', id: why.id });
        };
        if (p.key) {
          const prev = byKey.get(p.key);
          const prevP = prev === undefined ? undefined : pending.get(prev);
          if (prevP) cancel(prevP);
          byKey.set(p.key, id);
        }
        if (p.signal) {
          p.onAbort = () => cancel(p);
          p.signal.addEventListener('abort', p.onAbort);
        }
        pending.set(id, p);
        t.post({ t: 'run', id, kind, req });
      });
    },
    get mode() {
      return transport ? transport.kind : opts.mode === 'inthread' ? 'inthread' : 'worker';
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      transport?.terminate();
      for (const p of [...pending.values()]) settle(p, () => p.reject(abortError()));
    },
  };
}
