import type { Plugin } from 'vite';
import { generateSite } from './seo/pages';
import type { SeoSite } from './seo/pages';

/**
 * Search/LLM discoverability for the hosted build (not added to `build:single`):
 * - fills the SPA head (title, description, canonical, Open Graph, JSON-LD) and a <noscript> block;
 * - emits JS-free pages at real paths (learn/, learn/<id>/, strategy/, bets/, bets/<id>/,
 *   glossary/) from the same content bundle the app ships, plus sitemap.xml, llms.txt and
 *   llms-full.txt. The service worker leaves all of these to the network (build/seo/site.ts).
 */
export function seoPlugin(): Plugin {
  let root = process.cwd();
  let site: SeoSite | undefined;
  const get = () => (site ??= generateSite(root));
  return {
    name: 'holdumb-seo',
    configResolved(c) {
      root = c.root;
    },
    buildStart() {
      site = undefined; // fresh content on every build (and in watch mode)
    },
    transformIndexHtml(html) {
      const { spa } = get();
      return {
        html: html
          .replace(/<title>[^<]*<\/title>/, `<title>${spa.title.replace(/&/g, '&amp;')}</title>`)
          .replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, '')
          .replace('</title>', `</title>\n    ${spa.head}`)
          .replace(/<body>/, `<body>\n    ${spa.noscript}`),
        tags: [],
      };
    },
    generateBundle() {
      if (this.environment && this.environment.config.build.ssr) return;
      const s = get();
      const emit = (fileName: string, source: string) =>
        this.emitFile({ type: 'asset', fileName, source });
      for (const p of s.pages) emit(`${p.dir}index.html`, p.html);
      emit('sitemap.xml', s.sitemap);
      emit('llms.txt', s.llms);
      emit('llms-full.txt', s.llmsFull);
    },
  };
}
