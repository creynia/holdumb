import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { contentPlugin } from './build/vite-plugin-content.ts';
import { seoPlugin } from './build/vite-plugin-seo.ts';
import { swPlugin } from './build/vite-plugin-sw.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    define: {
      __SINGLE_FILE__: JSON.stringify(single),
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
    },
    resolve: {
      alias: {
        // Code splitting per build: lazy screens + on-demand content (PWA) vs static + inlined (single).
        '#screens': fileURLToPath(
          new URL(
            single ? './src/app/screens-static.ts' : './src/app/screens-lazy.tsx',
            import.meta.url,
          ),
        ),
        '#content': fileURLToPath(
          new URL(
            single ? './src/app/content-eager.ts' : './src/app/content-none.ts',
            import.meta.url,
          ),
        ),
        // Worker transport per build: inline (iife, works on file://) vs separate file (Pages/PWA).
        '#ev-worker': fileURLToPath(
          new URL(
            single ? './src/sim/worker/transport-inline.ts' : './src/sim/worker/transport-url.ts',
            import.meta.url,
          ),
        ),
      },
    },
    worker: { format: single ? 'iife' : 'es' },
    plugins: [
      preact(),
      contentPlugin(),
      ...(single ? [viteSingleFile()] : [seoPlugin(), swPlugin()]),
    ],
    publicDir: single ? false : 'public',
    build: { outDir: single ? 'dist-single' : 'dist', target: 'es2022' },
  };
});
