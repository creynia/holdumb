// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LESSON_SEO, generateSite, relatedDirs } from '../../build/seo/pages';
import {
  fourXRangeText,
  fourXShare,
  headline,
  strategyRows,
  tripsRows,
} from '../../build/seo/numbers';
import { BASE_URL, isStaticPath } from '../../build/seo/site';
import { TRIPS_EDGE } from '../../src/app/bets';
import { buildContent } from '../../src/content/load';
import { BLIND_PAYTABLES, TRIPS_PAYTABLES, formatPct } from '../../src/sim/engine';
import {
  DEALER_QUALIFY_PROBABILITY,
  GAME_EDGE,
  GAME_ELEMENT_OF_RISK,
  tripsEdge,
} from '../../src/sim/math/edges';
import { STRATEGY_CONSTANTS, strategyChart } from '../../src/sim/strategy';

const root = process.cwd();
const site = generateSite(root);
const content = buildContent(root);
const sitemapUrls = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

describe('static SEO pages (generated)', () => {
  it('has a page for every shipped lesson, plus the index and reference pages', () => {
    const dirs = site.pages.map((p) => p.dir);
    for (const l of content.lessons) expect(dirs).toContain(`learn/${l.id}/`);
    for (const d of ['learn/', 'strategy/', 'house-edge/', 'bets/', 'glossary/'])
      expect(dirs).toContain(d);
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
      // One cookieless GoatCounter pixel for the page's own path.
      expect(h.match(/creynia\.goatcounter\.com\/count/g) ?? []).toHaveLength(1);
      expect(h).toContain(`count?p=${encodeURIComponent(`/holdumb/${dir}`)}"`);
    },
  );

  it('lesson pages link into the app with a relative hash route', () => {
    for (const l of content.lessons) {
      const p = site.pages.find((x) => x.dir === `learn/${l.id}/`)!;
      expect(p.html).toContain(`href="../../#/learn/${l.id}"`);
      expect(p.title).toContain(LESSON_SEO[l.id]?.title ?? l.title);
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

const page = (dir: string) => site.pages.find((p) => p.dir === dir)!;
const lead = (dir: string) => /<p class="lead">([^<]*)<\/p>/.exec(page(dir).html)?.[1] ?? '';
const unesc = (h: string) =>
  h
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

describe('answer pages: numbers come from the engine', () => {
  it('house-edge/ quotes the exact perfect-play edge, element of risk and qualifying rate', () => {
    const h = headline();
    expect(h.edgePct).toBe(formatPct(GAME_EDGE, 3));
    expect(h.eorPct).toBe(formatPct(GAME_ELEMENT_OF_RISK, 3));
    expect(h.qualifyPct).toBe(formatPct(DEALER_QUALIFY_PROBABILITY, 1));
    // pinned values: if the math changes, this fails and the page text changes with it
    expect([h.edgePct, h.perInitialPct, h.eorPct, h.wager, h.perHour10]).toEqual([
      '2.185%',
      '1.092%',
      '0.526%',
      '4.15',
      '$6.55',
    ]);
    const text = unesc(lead('house-edge/'));
    expect(text).toMatch(
      /^With perfect strategy, Ultimate Texas Hold'em has a house edge of 2\.185% of your Ante\./,
    );
    expect(text).toContain('0.526%');
    expect(page('house-edge/').html).toContain(`${h.qualifyPct} of the time`);
  });

  it('strategy rows match the strategy constants', () => {
    for (const r of strategyRows()) {
      const ev = STRATEGY_CONSTANTS[r.id].ev;
      expect(r.edgePct).toBe(formatPct({ num: -ev.num, den: ev.den }, 3));
      expect(page('house-edge/').html).toContain(`<td class="num">${r.edgePct}</td>`);
    }
    expect(strategyRows().map((r) => [r.id, r.edgePct, r.perHour10])).toEqual([
      ['perfect', '2.185%', '$6.55'],
      ['basic', '2.381%', '$7.14'],
      ['simple', '2.708%', '$8.12'],
      ['check-to-river', '32.033%', '$96.10'],
      ['never-fold', '40.705%', '$122.11'],
      ['always-max', '40.705%', '$122.11'],
    ]);
  });

  it('Trips edges agree between the math module and the app, and appear on the pages', () => {
    for (const t of tripsRows()) {
      const a = TRIPS_EDGE[t.id]!;
      const b = tripsEdge(t.id).edge;
      expect(a.num * b.den).toBe(b.num * a.den);
      expect(page('house-edge/').html).toContain(t.edgePct);
      expect(lead('bets/trips/')).toContain(tripsRows().find((x) => x.isDefault)!.edgePct);
    }
    expect(lead('bets/trips/')).toContain(TRIPS_PAYTABLES['trips-8-6-5'].label);
  });

  it('the strategy page opens with the 4x range read off the chart', () => {
    const range = fourXRangeText('perfect');
    expect(range).toBe('pairs 33 and up, any ace, any suited king, K5o+, Q6s+, Q8o+, J8s+ and JTo');
    // the same words the app's strategy card uses
    expect(content.strategy.basic?.rules[0]).toContain(range);
    const share = fourXShare('perfect');
    const grid = strategyChart('perfect').grid.flat();
    expect(share.kinds).toBe(grid.filter((c) => c.action === '4x').length);
    expect(unesc(lead('strategy/'))).toMatch(
      new RegExp(
        `^Raise 4x before the flop with ${range.replace(/[+]/g, '\\+')}: ${share.kinds} of the 169`,
      ),
    );
    expect(page('strategy/').title).toContain('When to Raise 4x');
    for (const id of ['preflop', 'flop', 'river'])
      expect(page('strategy/').html).toContain(`<h2 id="${id}">`);
  });

  it('the Blind page opens with the Blind paytable', () => {
    expect(lead('bets/blind/')).toMatch(/^The Blind pays only when you win/);
    for (const [, [n, d]] of Object.entries(BLIND_PAYTABLES['blind-standard'].pays))
      expect(lead('bets/blind/')).toContain(`${n} to ${d}`);
  });

  it('answer-page tables have captions and scoped headers', () => {
    for (const dir of ['house-edge/', 'bets/trips/', 'bets/blind/', 'strategy/']) {
      const tables = page(dir).html.match(/<table[\s\S]*?<\/table>/g) ?? [];
      expect(tables.length).toBeGreaterThan(0);
      for (const t of tables) {
        expect(t).toMatch(/<caption/);
        expect(t).toMatch(/<th scope="(col|row)"/);
      }
    }
  });
});

describe('Related blocks', () => {
  const dirs = new Set(site.pages.map((p) => p.dir));
  const hubs = new Set(['learn/', 'bets/', 'glossary/']);
  it.each(site.pages.map((p) => [p.dir, p] as const))('%s', (dir, p) => {
    const rel = relatedDirs(content, dir);
    if (hubs.has(dir)) {
      expect(rel).toEqual([]);
      expect(p.html).not.toContain('class="related"');
      return;
    }
    expect(rel.length).toBeGreaterThanOrEqual(3);
    expect(rel.length).toBeLessThanOrEqual(5);
    expect(new Set(rel).size).toBe(rel.length);
    expect(rel).not.toContain(dir);
    for (const d of rel) expect(dirs.has(d)).toBe(true);
    const block = /<nav class="related"[\s\S]*?<\/nav>/.exec(p.html)?.[0] ?? '';
    const up = '../'.repeat(dir.split('/').filter(Boolean).length);
    expect([...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(rel.map((d) => up + d));
  });
  it('is deterministic and uses the data', () => {
    expect(generateSite(root).pages.map((p) => p.html)).toEqual(site.pages.map((p) => p.html));
    expect(relatedDirs(content, 'bets/trips/')[0]).toBe('learn/trips-bet/');
    expect(relatedDirs(content, 'learn/trips-bet/')).toContain('bets/trips/');
    expect(relatedDirs(content, 'learn/edge-vs-risk/')).toContain('house-edge/');
    expect(relatedDirs(content, 'learn/flop-raise/')).toContain('strategy/');
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
