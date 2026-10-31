// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSite } from '../../build/seo/pages';
import { BASE_URL, isStaticPath } from '../../build/seo/site';
import { buildContent } from '../../src/content/load';

const root = process.cwd();
const site = generateSite(root);
const content = buildContent(root);
const sitemapUrls = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

describe('static SEO pages (generated)', () => {
  it('has a page for every shipped lesson, plus the index and reference pages', () => {
    const dirs = site.pages.map((p) => p.dir);
    for (const l of content.lessons) expect(dirs).toContain(`learn/${l.id}/`);
    for (const d of ['learn/', 'strategy/', 'bets/', 'glossary/']) expect(dirs).toContain(d);
    for (const w of Object.keys(content.bets)) expect(dirs).toContain(`bets/${w}/`);
    expect(new Set(dirs).size).toBe(dirs.length);
    expect(dirs.every((d) => d.endsWith('/') && isStaticPath(d))).toBe(true);
  });

  it.each(site.pages.map((p) => [p.dir, p] as const))(
    '%s has one h1, title, description, canonical',
    (dir, p) => {
      const h = p.html;
      expect(h.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
      expect(h).toMatch(/<html lang="en">/);
      expect(h.match(/<title>[^<]+<\/title>/g) ?? []).toHaveLength(1);
      expect(h.match(/<meta name="description" content="[^"]+"/g) ?? []).toHaveLength(1);
      expect(h).toContain(`<link rel="canonical" href="${BASE_URL}${dir}" />`);
      expect(h).toContain(`<meta property="og:url" content="${BASE_URL}${dir}" />`);
      expect(h).toContain('https://creynia.com/assets/og/holdumb.jpg');
      expect(h).toContain('1-800-GAMBLER');
      expect(h).not.toMatch(/creynia\.github\.io/);
      expect(p.description.length).toBeGreaterThanOrEqual(100);
      expect(p.description.length).toBeLessThanOrEqual(160);
      // JSON-LD parses and carries a breadcrumb.
      const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(h)?.[1] ?? '';
      const graph = (JSON.parse(ld) as { '@graph': { '@type': unknown }[] })['@graph'];
      expect(graph.some((n) => n['@type'] === 'BreadcrumbList')).toBe(true);
      // No JS, no unrendered lesson syntax, no links into the SPA that skip the relative base.
      expect(h).not.toMatch(/<script(?! type="application\/ld\+json")/);
      expect(h).not.toMatch(/\{\{|\[\[|^:::|```/m);
      expect(h).not.toMatch(/href="#\//);
    },
  );

  it('lesson pages link into the app with a relative hash route', () => {
    for (const l of content.lessons) {
      const p = site.pages.find((x) => x.dir === `learn/${l.id}/`)!;
      expect(p.html).toContain(`href="../../#/learn/${l.id}"`);
      expect(p.title).toContain(l.title);
    }
  });

  it('sitemap lists the SPA root and exactly the emitted pages', () => {
    expect(sitemapUrls(site.sitemap).sort()).toEqual(
      [BASE_URL, ...site.pages.map((p) => BASE_URL + p.dir)].sort(),
    );
    expect(site.sitemap).not.toContain('<lastmod>');
  });

  it('llms.txt links every page and llms-full.txt has no raw lesson syntax', () => {
    expect(site.llms).toMatch(/^# holdumb — Ultimate Texas Hold'em\n\n> /);
    for (const p of site.pages) expect(site.llms).toContain(`(${BASE_URL}${p.dir})`);
    expect(site.llmsFull).not.toMatch(/\{\{|\[\[|^:::|```(scene|quiz|chart)/m);
    for (const l of content.lessons) expect(site.llmsFull).toContain(`## ${l.title}`);
  });

  it('SPA head has canonical, OG, WebApplication JSON-LD and a noscript fallback', () => {
    expect(site.spa.title.length).toBeLessThanOrEqual(65);
    expect(site.spa.head).toContain(`<link rel="canonical" href="${BASE_URL}" />`);
    expect(site.spa.head).toContain('"@type":"WebApplication"');
    expect(site.spa.noscript).toContain('href="./learn/"');
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// Runs against a real `npm run build` (CI runs build:all before tests).
describe.skipIf(!existsSync('dist/sitemap.xml'))('dist static pages', () => {
  it('sitemap URLs == emitted index.html pages (plus the SPA root)', () => {
    const pages = walk('dist')
      .map((f) => relative('dist', f).split('\\').join('/'))
      .filter((f) => f.endsWith('index.html'))
      .map((f) => BASE_URL + f.replace(/index\.html$/, ''));
    expect(sitemapUrls(readFileSync('dist/sitemap.xml', 'utf8')).sort()).toEqual(pages.sort());
    expect(existsSync('dist/llms.txt')).toBe(true);
    expect(existsSync('dist/llms-full.txt')).toBe(true);
  });
  it('the SPA root has the improved head', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).toMatch(/<title>Ultimate Texas Hold'em[^<]*\| holdumb<\/title>/);
    expect(html.match(/<meta name="description"/g) ?? []).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="${BASE_URL}" />`);
    expect(html).toContain('<noscript>');
  });
});
