import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * Emits `sw.js` (from src/pwa/sw.ts) with a precache list of every built file, and
 * injects the manifest + apple-touch-icon links. Only added to non-single builds.
 */
export function swPlugin(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'holdumb-sw',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      root = config.root;
    },
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: { rel: 'manifest', href: './manifest.webmanifest' },
          injectTo: 'head',
        },
        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' },
          injectTo: 'head',
        },
      ];
    },
    // closeBundle runs after Vite has written bundle files and copied public/.
    closeBundle: {
      order: 'post',
      handler() {
        if (this.environment && this.environment.config.build.ssr) return;
        const files = walk(outDir)
          .map((f) => relative(outDir, f).split('\\').join('/'))
          .filter((f) => f !== 'sw.js' && f !== 'holdumb.html' && !f.endsWith('.map'))
          .sort();
        const precache = ['./', ...files.map((f) => './' + f)];
        const src = readFileSync(resolve(root, 'src/pwa/sw.ts'), 'utf8');
        const hash = createHash('sha256').update(src);
        for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
        const version = hash.digest('hex').slice(0, 12);

        const js = ts.transpileModule(src, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText;
        const out = js
          .replace(/__PRECACHE__/g, JSON.stringify(precache))
          .replace(/__VERSION__/g, JSON.stringify(version));
        writeFileSync(join(outDir, 'sw.js'), out);
      },
    },
  };
}
