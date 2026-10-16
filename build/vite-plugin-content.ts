import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { buildContent } from '../src/content/load';

const VIRTUAL = 'virtual:content';
const RESOLVED = '\0' + VIRTUAL;

/**
 * `virtual:content` is the compiled lesson bundle (src/content/load.ts). Any invalid lesson,
 * scene, quiz or chart throws from `load`, which fails the build. HMR reloads on content/**.
 */
export function contentPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'holdumb-content',
    configResolved(c) {
      root = c.root;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      return `export default ${JSON.stringify(buildContent(root))};`;
    },
    configureServer(server) {
      const dir = resolve(root, 'content');
      server.watcher.add(dir);
      const onChange = (file: string) => {
        if (!resolve(file).startsWith(dir)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      for (const ev of ['change', 'add', 'unlink'] as const) server.watcher.on(ev, onChange);
    },
  };
}
