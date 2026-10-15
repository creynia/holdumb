/// <reference types="vite/client" />

declare const __SINGLE_FILE__: boolean;
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;

declare module 'virtual:content' {
  const bundle: import('./content/types').ContentBundle;
  export default bundle;
}

interface Window {
  /** Test hook (WP0 worker smoke test). */
  __holdumb?: {
    client: import('./sim/worker/protocol').EvClient;
    smoke(): Promise<{ mode: 'worker' | 'inthread'; settled: 'resolved' | 'rejected' }>;
  };
}
