// Shared constants and the HTML shell for the static, JS-free pages (see build/vite-plugin-seo.ts).
// Know the Odds URL contract: https://creynia.com/<app>/..., trailing slash, `<dir>/index.html`.

export const ORIGIN = 'https://creynia.com';
export const APP = 'holdumb';
export const GAME = "Ultimate Texas Hold'em";
export const BASE_URL = `${ORIGIN}/${APP}/`;
export const SITE_NAME = 'Know the Odds';
export const THEME = '#0b2e4a';
export const OG_IMAGE = `${ORIGIN}/assets/og/${APP}.jpg`;
/** GoatCounter page-view pixel (docs/analytics.md); same endpoint as src/app/analytics.ts. */
export const COUNT_URL = 'https://creynia.goatcounter.com/count';
export const PERSON_ID = `${ORIGIN}/#creynia`;
export const WEBSITE_ID = `${ORIGIN}/#website`;
export const OTHER_APPS = [
  { app: 'crappy', game: 'Craps' },
  { app: 'baccaratton', game: 'Baccarat' },
  { app: 'spinner', game: 'Roulette' },
] as const;

/** Directories (relative to the app root) that hold static pages, and the extra root files. */
export const STATIC_DIRS = ['learn/', 'bets/', 'glossary/', 'strategy/'] as const;
export const STATIC_FILES = ['sitemap.xml', 'llms.txt', 'llms-full.txt'] as const;

/** True for a dist-relative path ('learn/welcome/index.html', 'sitemap.xml') owned by the SEO build. */
export function isStaticPath(rel: string): boolean {
  return (
    STATIC_DIRS.some((d) => rel.startsWith(d)) || (STATIC_FILES as readonly string[]).includes(rel)
  );
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Absolute URL of a page dir ('' = SPA root, 'learn/welcome/'). */
export const abs = (dir: string) => BASE_URL + dir;

/** '../' per directory level, so links work under any base path (local preview, forks). */
export const upFrom = (dir: string) => '../'.repeat(dir.split('/').filter(Boolean).length);

/**
 * Meta description of 140-160 characters: the specific text first, then generic filler
 * sentences while it is short, cut at a word boundary if it is long.
 */
export function describe(text: string, fillers: string[]): string {
  let d = text.trim();
  for (const f of fillers) {
    if (d.length >= 140) break;
    if ((d + ' ' + f).length <= 160) d += ' ' + f;
  }
  if (d.length > 160) {
    d = d.slice(0, 157);
    d = d.slice(0, d.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '') + '…';
  }
  return d;
}

export const PERSON = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'creynia',
  url: `${ORIGIN}/`,
  sameAs: ['https://github.com/creynia'],
};
export const WEBSITE = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: SITE_NAME,
  url: `${ORIGIN}/`,
};
export const APP_ID = `${BASE_URL}#app`;
export const COURSE_ID = `${BASE_URL}learn/#course`;

export interface Crumb {
  name: string;
  dir: string;
}

export function breadcrumbLd(trail: Crumb[], dir: string) {
  const items = [
    { name: SITE_NAME, item: `${ORIGIN}/` },
    { name: APP, item: BASE_URL },
    ...trail.map((c) => ({ name: c.name, item: abs(c.dir) })),
  ];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${abs(dir)}#breadcrumb`,
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };
}

export const jsonLd = (graph: object[]) =>
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;

/** Head tags shared by the SPA root and the static pages (canonical, OG, Twitter). */
export function metaTags(o: {
  title: string;
  description: string;
  url: string;
  type: 'website' | 'article';
}): string {
  const t = esc(o.title);
  const d = esc(o.description);
  return [
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${o.url}" />`,
    `<meta property="og:type" content="${o.type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${o.url}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ].join('\n    ');
}

const CSS = `
:root{color-scheme:dark;--bg:#0b2e4a;--bg2:#08243b;--surface:#11395a;--line:#2a5478;--text:#eef3f7;--muted:#b9cad9;--accent:#f2c14e;--accent-ink:#1b2430;--link:#9fd3ff;--good:#7fd6a4}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg2);color:var(--text);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--link)}
a:focus-visible,summary:focus-visible,table:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.wrap{max-width:46rem;margin:0 auto;padding:0 16px}
.top{background:var(--bg);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;gap:.75rem;align-items:baseline;justify-content:space-between;padding-top:.7rem;padding-bottom:.7rem;flex-wrap:wrap}
.top a{color:var(--text);text-decoration:none}
.brand{font-size:.85rem;color:var(--muted)!important;letter-spacing:.02em}
.appname{font-weight:700;font-size:1.1rem}
.appname span{font-weight:400;color:var(--muted);font-size:.9rem}
nav.crumbs{font-size:.85rem;color:var(--muted);margin:1rem 0 0}
nav.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem}
nav.crumbs li+li::before{content:"›";margin-right:.25rem;color:var(--muted)}
nav.crumbs a{color:var(--muted)}
main{padding:.5rem 0 2rem}
main>*{max-width:70ch}
h1{font-size:1.9rem;line-height:1.2;margin:.75rem 0 .5rem}
h2{font-size:1.35rem;line-height:1.3;margin:2rem 0 .5rem}
h3{font-size:1.1rem;margin:1.5rem 0 .4rem}
.lead{font-size:1.1rem;color:var(--muted)}
.meta{color:var(--muted);font-size:.9rem;margin:0 0 1rem}
.cta{display:inline-block;background:var(--accent);color:var(--accent-ink);font-weight:700;text-decoration:none;padding:.75rem 1.1rem;border-radius:10px;margin:.5rem 0;line-height:1.3}
.cta:hover{filter:brightness(1.07)}
.cta-box{margin:1.5rem 0;padding:1rem;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.cta-box p{margin:.25rem 0 0}
.tip,.scene,.quiz,details.math,.chart,.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:.75rem 1rem;margin:1rem 0}
.card>h3:first-child{margin-top:0}
.tip-tag,.tag{display:block;margin:0 0 .25rem!important;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin-bottom:.2rem}
.tip>p:last-child,.quiz>:last-child{margin-bottom:0}
details.math summary,.quiz summary{cursor:pointer;font-weight:600}
.quiz .q{font-weight:600;margin:.25rem 0}
.quiz ol{margin:.25rem 0 .5rem;padding-left:1.6rem}
.answer{color:var(--good)}
.cards{white-space:nowrap}
.pc{display:inline-block;background:#f8f5ec;color:#1b2430;border-radius:4px;padding:0 .28em;margin:0 .08em;font-weight:700;line-height:1.35;font-size:.92em;border:1px solid #c9c2ad}
.pc.suit-h,.pc.suit-d{color:#c0262d}
table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;margin:1rem 0}
th,td{border:1px solid var(--line);padding:.35rem .6rem;text-align:left;vertical-align:top}
th{background:var(--surface)}
td.num,th.num{text-align:right}
.grid-wrap{overflow-x:auto;margin:.5rem 0}
table.grid{display:table;table-layout:fixed;width:100%;max-width:34rem;font-size:clamp(.62rem,2.6vw,.85rem);margin:0}
table.grid th,table.grid td{padding:.2rem 0;text-align:center;border-color:#09253c}
table.grid th{background:var(--bg2);color:var(--muted)}
table.grid td.bet{background:#1f7a4d;color:#fff;font-weight:700}
table.grid td.chk{background:#183c5a;color:#7f9bb3}
table.grid td.hl{outline:2px solid var(--accent);outline-offset:-2px}
.legend{font-size:.9rem;color:var(--muted)}
.sw{display:inline-block;width:1.6em;text-align:center;border-radius:3px;margin-right:.3em}
.sw.bet{background:#1f7a4d;color:#fff}.sw.chk{background:#183c5a;color:#7f9bb3}
.vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
dl.gloss dt{font-weight:700;font-size:1.1rem;margin-top:1.4rem;scroll-margin-top:1rem}
dl.gloss dd{margin:.25rem 0 0}
dl.gloss .see{font-size:.9rem;color:var(--muted)}
ul.lessons,ol.lessons{padding-left:1.4rem}
ol.lessons li{margin:.6rem 0}
ol.lessons .s{display:block;color:var(--muted);font-size:.95rem}
.prevnext{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin:2rem 0 1rem;padding-top:1rem;border-top:1px solid var(--line)}
.prevnext a{max-width:48%}
.prevnext .next{margin-left:auto;text-align:right}
footer{border-top:1px solid var(--line);background:var(--bg);color:var(--muted);font-size:.9rem;padding:1.25rem 0 2rem}
footer p{margin:.5rem 0;max-width:70ch}
footer a{color:var(--muted)}
@media (max-width:480px){body{font-size:16px}h1{font-size:1.55rem}.prevnext a{max-width:100%}.prevnext .next{text-align:left;margin-left:0}}
`
  .trim()
  .replace(/\n/g, '');

export interface PageInput {
  /** dist-relative directory, e.g. 'learn/welcome/' */
  dir: string;
  title: string;
  description: string;
  type: 'website' | 'article';
  trail: Crumb[];
  /** JSON-LD nodes besides the BreadcrumbList */
  ld: object[];
  /** inner HTML of <main>, after the h1 */
  body: string;
  h1: string;
}

/** A JS-free, cookieless page-view count for a static page (dir like 'learn/welcome/'). */
export function countPixel(path: string): string {
  const p = encodeURIComponent(`/${APP}/${path}`);
  return `<img src="${COUNT_URL}?p=${p}" alt="" width="1" height="1" style="position:absolute;left:-9999px">`;
}

export function renderPage(p: PageInput): string {
  const up = upFrom(p.dir);
  const url = abs(p.dir);
  const crumbs = [
    `<li><a href="${ORIGIN}/">${SITE_NAME}</a></li>`,
    `<li><a href="${up}">${APP}</a></li>`,
    ...p.trail.map((c, i) =>
      i === p.trail.length - 1
        ? `<li aria-current="page">${esc(c.name)}</li>`
        : `<li><a href="${up}${c.dir}">${esc(c.name)}</a></li>`,
    ),
  ].join('');
  const others = OTHER_APPS.map(
    (o) => `<a href="${ORIGIN}/${o.app}/">${o.app} (${o.game})</a>`,
  ).join(' · ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(p.title)}</title>
    ${metaTags({ title: p.title, description: p.description, url, type: p.type })}
    <meta name="theme-color" content="${THEME}" />
    <link rel="icon" href="${up}icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${up}icons/apple-touch-icon.png" />
    <style>${CSS}</style>
    ${jsonLd([...p.ld, breadcrumbLd(p.trail, p.dir)])}
  </head>
  <body>
    <header class="top">
      <div class="wrap">
        <a class="brand" href="${ORIGIN}/">${SITE_NAME}</a>
        <a class="appname" href="${up}">${APP} <span>${GAME}</span></a>
      </div>
    </header>
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>
      <main>
        <h1>${p.h1}</h1>
${p.body}
      </main>
    </div>
    <footer>
      <div class="wrap">
        <p><strong>For education only, with play money only.</strong> The house always has an edge, and no betting system changes that. These apps show how big the edge is, not how to beat it.</p>
        <p>If gambling is hurting you or someone you know, call or text <strong>1-800-GAMBLER</strong> (US), or contact your national problem-gambling helpline.</p>
        <p>More from ${SITE_NAME}: ${others} · <a href="${ORIGIN}/">creynia.com</a></p>
      </div>
    </footer>
    ${countPixel(p.dir)}
  </body>
</html>
`;
}
