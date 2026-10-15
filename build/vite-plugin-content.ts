import type { Plugin } from 'vite';

const VIRTUAL = 'virtual:content';
const RESOLVED = '\0' + VIRTUAL;

/**
 * WP0 stub: `virtual:content` is an empty bundle. TODO(app) replaces the body with crappy's
 * (buildContent from src/content/load.ts, HMR on content/**); vite.config.ts does not change.
 */
export function contentPlugin(): Plugin {
  return {
    name: 'holdumb-content',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      const empty = { chapters: [], lessons: [], glossary: [], bets: {}, hands: {}, strategy: {} };
      return `export default ${JSON.stringify(empty)};`;
    },
  };
}
