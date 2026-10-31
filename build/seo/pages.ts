// Generates the static, JS-free pages (learn, lessons, bets, glossary, strategy), the sitemap and
// the llms files from the same content bundle the app ships (src/content/load.ts), so the text
// matches the app. Pure: returns strings; build/vite-plugin-seo.ts writes them into dist/.
import { buildContent, readSources } from '../../src/content/load';
import { parseChart, parseQuizzes, segment, splitFrontMatter } from '../../src/content/compile';
import { cardFace, cardsHtml, parseGroup, splitInline } from '../../src/content/cards';
import { TIER_LABEL } from '../../src/content/types';
import type { ChartBlockData, ContentBundle, Lesson, Quiz } from '../../src/content/types';
import {
  BLIND_PAYTABLES,
  DEFAULT_PAYTABLE_PRESET,
  PAYTABLE_PRESET_IDS,
  TRIPS_PAYTABLES,
  WAGER_IDS,
  formatPct,
} from '../../src/sim/engine';
import type { Paytable, WagerId } from '../../src/sim/engine';
import { strategyChart } from '../../src/sim/strategy';
import type { StrategyId } from '../../src/sim/strategy';
import { TRIPS_EDGE, payRows, wagerTierOf } from '../../src/app/bets';
import { HAND_LABEL } from '../../src/app/screens/handLabels';
import {
  APP,
  APP_ID,
  BASE_URL,
  COURSE_ID,
  GAME,
  OG_IMAGE,
  ORIGIN,
  PERSON,
  PERSON_ID,
  WEBSITE,
  WEBSITE_ID,
  abs,
  describe,
  esc,
  metaTags,
  renderPage,
  upFrom,
} from './site';
import type { Crumb, PageInput } from './site';

export interface StaticPage {
  /** dist-relative directory with trailing slash; the file is `${dir}index.html` */
  dir: string;
  title: string;
  description: string;
  html: string;
  /** readable markdown of the page, for llms-full.txt */
  markdown: string;
}

export interface SeoSite {
  pages: StaticPage[];
  sitemap: string;
  llms: string;
  llmsFull: string;
  spa: { title: string; description: string; head: string; noscript: string };
}

const FILL = [
  `Free ${GAME} course from holdumb.`,
  'Practise every decision on a play-money table that shows the EV before you confirm.',
  'No sign-up, works offline.',
  'Play money only.',
];

const iso = (minutes: number) => `PT${Math.round(minutes)}M`;

// ---------- inline text (quiz prompts, options) ----------

/** Plain text with `{{cards}}` → HTML (the app's InlineText). */
const inlineHtml = (text: string) =>
  splitInline(text)
    .map((s) => (s.t === 'text' ? esc(s.text) : cardsHtml(s.codes)))
    .join('');

/** `{{As Kd}}` → 'A♠ K♦' for markdown/plain text. */
const cardsText = (codes: string) =>
  parseGroup(codes)
    .map((c) => {
      const f = cardFace(c);
      return f.rank + f.glyph.replace('\uFE0E', '');
    })
    .join(' ');

const inlineMd = (text: string) =>
  text
    .replace(/\{\{([^{}]*)\}\}/g, (_m, codes: string) => cardsText(codes))
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, term: string, label?: string) =>
      (label ?? term).trim(),
    );

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The compiled HTML links glossary terms into the SPA (`#/glossary?term=x`); point them here. */
const fixLinks = (html: string, up: string, onGlossary = false) =>
  html.replace(
    /href="#\/glossary\?term=([^"]+)"/g,
    (_m, slug: string) =>
      `href="${onGlossary ? '' : `${up}glossary/`}#${decodeURIComponent(slug)}"`,
  );

// ---------- strategy chart ----------

const RANKS = 'AKQJT98765432';

function fourXSet(id: StrategyId): Set<string> {
  return new Set(
    strategyChart(id)
      .grid.flat()
      .filter((c) => c.action === '4x')
      .map((c) => c.cls),
  );
}

/** Same wording as src/sim/ui/StrategyChart.tsx (ruleLines). */
function ruleLines(id: StrategyId, view: 'flop' | 'river'): string[] {
  const d = strategyChart(id);
  const part = view === 'flop' ? d.flop : d.river;
  const name = view === 'flop' ? 'Bet 2x' : 'Bet 1x';
  if (part.rule === 'rules')
    return [
      ...part.lines.map((l) => `${name} with: ${l.text}.`),
      'Otherwise ' + (view === 'flop' ? 'check.' : 'fold.'),
    ];
  if (part.rule === 'always') return [`${name} every time.`];
  if (part.rule === 'never') return [view === 'flop' ? 'Always check.' : 'Always fold.'];
  return ['Chosen by the exact EV of the spot (the EV sheet shows it).'];
}

function gridHtml(id: StrategyId, highlight: readonly string[] = [], caption?: string): string {
  const set = fourXSet(id);
  const head = `<tr><td aria-hidden="true"></td>${[...RANKS].map((r) => `<th scope="col">${r}</th>`).join('')}</tr>`;
  const rows = [...RANKS]
    .map((r, ri) => {
      const cells = [...RANKS]
        .map((c, ci) => {
          const cls = ri === ci ? r + c : ri < ci ? `${r}${c}s` : `${c}${r}o`;
          const bet = set.has(cls);
          const hl = highlight.includes(cls) ? ' hl' : '';
          return bet
            ? `<td class="bet${hl}" title="${cls}: bet 4x"><span class="vh">${cls} </span>4x</td>`
            : `<td class="chk${hl}" title="${cls}: check"><span class="vh">${cls} check</span><span aria-hidden="true">–</span></td>`;
        })
        .join('');
      return `<tr><th scope="row">${r}</th>${cells}</tr>`;
    })
    .join('\n');
  const count = [...set].length;
  return `<div class="grid-wrap"><table class="grid">${caption ? `<caption class="vh">${esc(caption)}</caption>` : ''}
<thead>${head}</thead>
<tbody>
${rows}
</tbody></table></div>
<p class="legend"><span class="sw bet">4x</span>Bet 4x <span class="sw chk">–</span>Check. Pairs on the diagonal, suited hands above it, offsuit below. ${count} of 169 hand kinds bet 4x; the rest check.${highlight.length ? ` Outlined: ${highlight.map(esc).join(', ')}.` : ''}</p>`;
}

/** The 4x hand kinds, grouped by top card, for text output. */
function fourXText(id: StrategyId): string {
  const set = fourXSet(id);
  const pairs = [...RANKS].map((r) => r + r).filter((c) => set.has(c));
  const parts = [`pairs ${pairs.join(' ')}`];
  for (const [ri, r] of [...RANKS].entries()) {
    const s = [...RANKS]
      .slice(ri + 1)
      .flatMap((c) => [`${r}${c}s`, `${r}${c}o`].filter((x) => set.has(x)));
    if (s.length) parts.push(s.join(' '));
  }
  return `Bet 4x with ${set.size} of 169 hand kinds (${parts.join('; ')}); check the rest.`;
}

function chartHtml(chart: ChartBlockData): string {
  if (chart.view === 'preflop-grid')
    return `<figure class="chart">${gridHtml(chart.strategy, chart.highlight ?? [], 'Preflop strategy chart')}</figure>`;
  const lines = ruleLines(chart.strategy, chart.view);
  return `<figure class="chart"><p class="tag">${chart.view === 'flop' ? 'Flop' : 'River'} rules</p><ol>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></figure>`;
}

function chartMd(chart: ChartBlockData): string {
  if (chart.view === 'preflop-grid') return `Preflop chart: ${fourXText(chart.strategy)}`;
  return `${chart.view === 'flop' ? 'Flop' : 'River'} rules:\n${ruleLines(
    chart.strategy,
    chart.view,
  )
    .map((l, i) => `${i + 1}. ${l}`)
    .join('\n')}`;
}

// ---------- quizzes ----------

const LETTERS = 'ABCDEFGH';

function quizHtml(q: Quiz): string {
  const hand = q.hand
    ? `<p>${cardsHtml(q.hand.hole)}${q.hand.board ? ` Board: ${cardsHtml(q.hand.board)}` : ''}</p>`
    : '';
  const opts = q.choices.map((c) => `<li>${inlineHtml(c)}</li>`).join('');
  return `<div class="quiz"><p class="tag">Quiz</p>${hand}<p class="q">${inlineHtml(q.prompt)}</p><ol type="A">${opts}</ol><details><summary>Show the answer</summary><p class="answer"><strong>${LETTERS[q.answer]}: ${inlineHtml(q.choices[q.answer] ?? '')}.</strong> ${inlineHtml(q.explanation)}</p></details></div>`;
}

function quizMd(q: Quiz): string {
  const hand = q.hand
    ? `Your cards: ${cardsText(q.hand.hole)}${q.hand.board ? `; board: ${cardsText(q.hand.board)}` : ''}\n`
    : '';
  return `**Quiz:** ${hand}${inlineMd(q.prompt)}\n${q.choices
    .map((c, i) => `- ${LETTERS[i]}) ${inlineMd(c)}`)
    .join(
      '\n',
    )}\n\nAnswer: ${LETTERS[q.answer]}) ${inlineMd(q.choices[q.answer] ?? '')}. ${inlineMd(q.explanation)}`;
}

// ---------- lessons ----------

function lessonBodyHtml(lesson: Lesson, up: string): string {
  const cta = `${up}#/learn/${lesson.id}`;
  return lesson.blocks
    .map((b) => {
      switch (b.kind) {
        case 'html':
          return fixLinks(b.html, up);
        case 'tip':
          return `<aside class="tip"><p class="tip-tag">Tip</p>${fixLinks(b.html, up)}</aside>`;
        case 'math':
          return `<details class="math"><summary>Show the math: ${esc(b.title)}</summary>${fixLinks(b.html, up)}</details>`;
        case 'chart':
          return chartHtml(b.chart);
        case 'quiz':
          return quizHtml(b.quiz);
        case 'scene':
          return `<aside class="scene"><p class="tag">Interactive hand</p><p>${b.scene.title ? `<strong>${esc(b.scene.title)}.</strong> ` : ''}This part of the lesson is played at the practice table. <a href="${cta}">Try it in the app</a>.</p></aside>`;
      }
    })
    .join('\n');
}

/** Heading depth shift so the lesson's own headings sit under the page title (## in llms-full). */
function shiftHeadings(md: string, shift: number): string {
  let fence = false;
  return md
    .split('\n')
    .map((l) => {
      if (/^```/.test(l)) fence = !fence;
      if (fence) return l;
      return l.replace(
        /^(#{1,6})(\s)/,
        (_m, h: string, s: string) => '#'.repeat(Math.min(6, Math.max(3, h.length + shift))) + s,
      );
    })
    .join('\n');
}

function lessonMarkdown(source: string, id: string): string {
  const { body } = splitFrontMatter(source);
  const out: string[] = [];
  let quizCount = 0;
  const mins = [...body.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1]!.length);
  const shift = mins.length ? 3 - Math.min(...mins) : 0;
  for (const seg of segment(body)) {
    if (seg.t === 'md') out.push(shiftHeadings(inlineMd(seg.text).trim(), shift));
    else if (seg.t === 'box')
      out.push(
        seg.kind === 'tip'
          ? inlineMd(seg.text)
              .trim()
              .split('\n')
              .map((l, i) => `> ${i === 0 ? '**Tip:** ' : ''}${l}`)
              .join('\n')
          : `**Show the math: ${seg.title}**\n\n${shiftHeadings(inlineMd(seg.text).trim(), shift)}`,
      );
    else if (seg.lang === 'chart') out.push(chartMd(parseChart(seg.text)));
    else if (seg.lang === 'quiz') {
      const qs = parseQuizzes(seg.text, id, quizCount);
      quizCount += qs.length;
      out.push(...qs.map(quizMd));
    } else {
      const title = /^title:\s*(.+)$/m.exec(seg.text)?.[1]?.replace(/^["']|["']$/g, '');
      out.push(
        `*Interactive hand${title ? `: ${title}` : ''} (played at the practice table in the app).*`,
      );
    }
  }
  return out.join('\n\n');
}

// ---------- page builders ----------

type Page = PageInput & { markdown: string };

const ctaBox = (href: string, label: string, note = 'Free, play money, works offline.') =>
  `<div class="cta-box"><a class="cta" href="${href}">${esc(label)}</a><p class="meta">${note}</p></div>`;

function educationalLevel(chapterIdx: number) {
  return chapterIdx <= 1 ? 'Beginner' : 'Intermediate';
}

function learnPages(content: ContentBundle, sources: Map<string, string>): Page[] {
  const { chapters, lessons } = content;
  const total = lessons.reduce((s, l) => s + l.minutes, 0);
  const courseName = `Learn ${GAME}: from zero to perfect strategy`;
  const courseDesc = describe(
    `A free ${lessons.length}-lesson ${GAME} course in ${chapters.length} chapters: ${chapters
      .map((c) => c.title.replace(/^Perfect strategy [IV]+: /, ''))
      .join(', ')}.`,
    FILL,
  );
  const course = {
    '@type': 'Course',
    '@id': COURSE_ID,
    name: courseName,
    description: courseDesc,
    url: abs('learn/'),
    inLanguage: 'en',
    isAccessibleForFree: true,
    provider: { '@id': PERSON_ID },
    author: { '@id': PERSON_ID },
    timeRequired: iso(total),
    numberOfLessons: lessons.length,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD', category: 'Free' },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: iso(total),
    },
    image: OG_IMAGE,
  };
  const learnTrail: Crumb[] = [{ name: 'Learn', dir: 'learn/' }];

  const index: Page = {
    dir: 'learn/',
    title: `Learn ${GAME}: Free Course, ${lessons.length} Lessons | ${APP}`,
    description: courseDesc,
    type: 'website',
    trail: learnTrail,
    h1: `Learn ${GAME}`,
    ld: [
      PERSON,
      course,
      {
        '@type': 'ItemList',
        '@id': `${abs('learn/')}#lessons`,
        name: `${courseName}: lessons`,
        numberOfItems: lessons.length,
        itemListElement: lessons.map((l, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: abs(`learn/${l.id}/`),
          name: l.title,
        })),
      },
    ],
    body: [
      `<p class="lead">${lessons.length} short lessons in ${chapters.length} chapters, about ${Math.round(total / 5) * 5} minutes in all. Every lesson has a quiz, and most have hands you play at a practice table that shows the EV of every decision.</p>`,
      ctaBox('../#/learn', `Start the course in ${APP}`),
      ...chapters.map((ch, ci) => {
        const items = ch.lessons
          .map((id) => lessons.find((l) => l.id === id)!)
          .map(
            (l) =>
              `<li><a href="${l.id}/">${esc(l.title)}</a> <span class="meta">(${l.minutes} min)</span><span class="s">${esc(l.summary)}</span></li>`,
          )
          .join('\n');
        return `<section><h2>${ci + 1}. ${esc(ch.title)}</h2><p>${esc(ch.summary)}</p><ol class="lessons" start="${lessons.findIndex((l) => l.id === ch.lessons[0]) + 1}">${items}</ol></section>`;
      }),
      `<h2>Reference</h2><ul><li><a href="../strategy/">${GAME} strategy chart</a></li><li><a href="../bets/">Bets and paytables</a></li><li><a href="../glossary/">Glossary</a></li></ul>`,
    ].join('\n'),
    markdown: [
      `${lessons.length} lessons in ${chapters.length} chapters.`,
      ...chapters.map(
        (ch, ci) =>
          `### ${ci + 1}. ${ch.title}\n\n${ch.summary}\n\n${ch.lessons
            .map((id) => lessons.find((l) => l.id === id)!)
            .map((l) => `- [${l.title}](${abs(`learn/${l.id}/`)}): ${l.summary}`)
            .join('\n')}`,
      ),
    ].join('\n\n'),
  };

  const lessonPages = lessons.map((l, i): Page => {
    const dir = `learn/${l.id}/`;
    const up = upFrom(dir);
    const chIdx = chapters.findIndex((c) => c.id === l.chapterId);
    const ch = chapters[chIdx]!;
    const prev = lessons[i - 1];
    const next = lessons[i + 1];
    const long = `${l.title} | Learn ${GAME} | ${APP}`;
    const mid = `${l.title} | ${GAME} | ${APP}`;
    const title = long.length <= 65 ? long : mid.length <= 65 ? mid : `${l.title} | ${APP}`;
    const description = describe(`${l.summary}`, [
      `Lesson ${i + 1} of ${lessons.length} in a free ${GAME} course.`,
      FILL[1]!,
      'Includes quizzes with answers.',
      'Free, no sign-up, works offline.',
      'Play money only.',
    ]);
    const nav = `<nav class="prevnext" aria-label="Lessons">${
      prev ? `<a class="prev" href="../${prev.id}/" rel="prev">← ${esc(prev.title)}</a>` : ''
    }${next ? `<a class="next" href="../${next.id}/" rel="next">${esc(next.title)} →</a>` : ''}</nav>
<p><a href="../">All ${lessons.length} lessons</a></p>`;
    return {
      dir,
      title,
      description,
      type: 'article',
      trail: [...learnTrail, { name: l.title, dir }],
      h1: esc(l.title),
      ld: [
        PERSON,
        { '@type': 'Course', '@id': COURSE_ID, name: courseName, url: abs('learn/') },
        {
          '@type': ['Article', 'LearningResource'],
          '@id': `${abs(dir)}#lesson`,
          headline: l.title,
          name: l.title,
          description,
          abstract: l.summary,
          url: abs(dir),
          mainEntityOfPage: abs(dir),
          image: OG_IMAGE,
          inLanguage: 'en',
          timeRequired: iso(l.minutes),
          educationalLevel: educationalLevel(chIdx),
          learningResourceType: 'Lesson',
          teaches: ch.title,
          position: i + 1,
          isAccessibleForFree: true,
          isPartOf: { '@id': COURSE_ID },
          author: { '@id': PERSON_ID },
          publisher: { '@id': PERSON_ID },
        },
      ],
      body: [
        `<p class="meta">Lesson ${i + 1} of ${lessons.length} · ${esc(ch.title)} · ${l.minutes} min read</p>`,
        `<p class="lead">${esc(l.summary)}</p>`,
        lessonBodyHtml(l, up),
        ctaBox(
          `${up}#/learn/${l.id}`,
          `Open this lesson in ${APP}: free, play money`,
          'Play the hands, answer the quizzes and track your progress. Works offline.',
        ),
        nav,
      ].join('\n'),
      markdown: `${l.summary}\n\n${lessonMarkdown(sources.get(l.id) ?? '', l.id)}`,
    };
  });
  return [index, ...lessonPages];
}

const WAGER_NAME: Record<WagerId, string> = {
  ante: 'Ante',
  blind: 'Blind',
  play: 'Play',
  trips: 'Trips',
};

function payTableHtml(t: Paytable, caption: string): string {
  return `<table><caption class="vh">${esc(caption)}</caption><thead><tr><th scope="col">Hand</th><th scope="col" class="num">Pays</th></tr></thead><tbody>${payRows(
    t,
  )
    .map(
      (r) =>
        `<tr><td>${esc(HAND_LABEL[r.category] ?? r.category)}</td><td class="num">${r.pays}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}
const payTableMd = (t: Paytable) =>
  `| Hand | Pays |\n| --- | --- |\n${payRows(t)
    .map((r) => `| ${HAND_LABEL[r.category] ?? r.category} | ${r.pays} |`)
    .join('\n')}`;

function tripsSections(level: 'h2' | 'h3'): { html: string; md: string } {
  const html = PAYTABLE_PRESET_IDS.map((id) => {
    const t = TRIPS_PAYTABLES[id];
    const edge = TRIPS_EDGE[id];
    const e = edge ? ` · House edge ${formatPct(edge, 3)} (${TIER_LABEL[wagerTierOf(edge)]})` : '';
    return `<section class="card"><${level}>${esc(t.label)}</${level}><p class="meta">${id === DEFAULT_PAYTABLE_PRESET ? 'The app’s default table' : 'Variant'}${e}</p>${payTableHtml(t, `${t.label} paytable`)}</section>`;
  }).join('\n');
  const md = PAYTABLE_PRESET_IDS.map((id) => {
    const t = TRIPS_PAYTABLES[id];
    const edge = TRIPS_EDGE[id];
    return `#### ${t.label}${edge ? ` (house edge ${formatPct(edge, 3)})` : ''}\n\n${payTableMd(t)}`;
  }).join('\n\n');
  return { html, md };
}

function betPages(content: ContentBundle): Page[] {
  const trail: Crumb[] = [{ name: 'Bets and paytables', dir: 'bets/' }];
  const blind = BLIND_PAYTABLES['blind-standard'];
  const trips = tripsSections('h3');
  const lessonLink = (id: string | undefined, up: string) => {
    const l = id ? content.lessons.find((x) => x.id === id) : undefined;
    return l ? `<p>Lesson: <a href="${up}learn/${l.id}/">${esc(l.title)}</a></p>` : '';
  };
  const index: Page = {
    dir: 'bets/',
    title: `${GAME} Bets & Paytables | ${APP}`,
    description: describe(
      `How every ${GAME} bet works: the Ante, the Blind, the one Play raise (4x, 2x or 1x) and the Trips side bet, with the Blind paytable and Trips paytables.`,
      FILL,
    ),
    type: 'website',
    trail,
    h1: `${GAME} bets and paytables`,
    ld: [
      PERSON,
      {
        '@type': 'WebPage',
        '@id': `${abs('bets/')}#page`,
        url: abs('bets/'),
        name: `${GAME} bets and paytables`,
        isPartOf: { '@id': WEBSITE_ID },
        author: { '@id': PERSON_ID },
        inLanguage: 'en',
      },
    ],
    body: [
      `<ul>${WAGER_IDS.map((w) => `<li><a href="${w}/"><strong>${esc(content.bets[w]?.name ?? WAGER_NAME[w])}</strong></a>: ${esc(content.bets[w]?.summary ?? '')}</li>`).join('\n')}</ul>`,
      `<h2>Blind pays on a win</h2>${payTableHtml(blind, 'Blind paytable')}<p class="meta">Winning hands below a straight push.</p>`,
      `<h2>Trips paytables</h2>${trips.html}`,
      ctaBox(
        '../#/bets',
        `See the bets in ${APP}`,
        'Try every bet at the play-money practice table.',
      ),
    ].join('\n'),
    markdown: [
      WAGER_IDS.map(
        (w) =>
          `- [${content.bets[w]?.name ?? WAGER_NAME[w]}](${abs(`bets/${w}/`)}): ${content.bets[w]?.summary ?? ''}`,
      ).join('\n'),
      `### Blind pays on a win\n\n${payTableMd(blind)}\n\nWinning hands below a straight push.`,
      `### Trips paytables\n\n${trips.md}`,
    ].join('\n\n'),
  };
  const details = WAGER_IDS.map((w): Page => {
    const dir = `bets/${w}/`;
    const up = upFrom(dir);
    const copy = content.bets[w];
    const name = copy?.name ?? WAGER_NAME[w];
    const extraHtml =
      w === 'blind'
        ? `<h2>Blind paytable</h2>${payTableHtml(blind, 'Blind paytable')}`
        : w === 'trips'
          ? `<h2>Trips paytables</h2>${tripsSections('h3').html}`
          : '';
    const extraMd =
      w === 'blind'
        ? `### Blind paytable\n\n${payTableMd(blind)}`
        : w === 'trips'
          ? `### Trips paytables\n\n${trips.md}`
          : '';
    return {
      dir,
      title: `The ${name} Bet in ${GAME} | ${APP}`,
      description: describe(copy?.summary ?? `The ${name} bet.`, [
        `How the ${name} bet is placed and settled in ${GAME}.`,
        ...FILL,
      ]),
      type: 'article',
      trail: [...trail, { name, dir }],
      h1: `The ${esc(name)} bet`,
      ld: [
        PERSON,
        {
          '@type': 'Article',
          '@id': `${abs(dir)}#article`,
          headline: `The ${name} bet in ${GAME}`,
          description: copy?.summary ?? '',
          url: abs(dir),
          mainEntityOfPage: abs(dir),
          image: OG_IMAGE,
          inLanguage: 'en',
          author: { '@id': PERSON_ID },
          publisher: { '@id': PERSON_ID },
          isPartOf: { '@id': WEBSITE_ID },
        },
      ],
      body: [
        copy ? `<p class="lead">${esc(copy.summary)}</p>${fixLinks(copy.howItWorks, up)}` : '',
        copy?.tip
          ? `<aside class="tip"><p class="tip-tag">Tip</p><p>${esc(copy.tip)}</p></aside>`
          : '',
        extraHtml,
        lessonLink(copy?.lessonId, up),
        ctaBox(
          `${up}#/bets/${w}`,
          `Open the ${name} bet in ${APP}`,
          'Then try it at the play-money table.',
        ),
        `<p><a href="../">All bets and paytables</a></p>`,
      ].join('\n'),
      markdown: [
        copy?.summary ?? '',
        copy ? stripTags(copy.howItWorks.replace(/<\/p>\s*<p>/g, '\n\n')) : '',
        copy?.tip ? `> **Tip:** ${copy.tip}` : '',
        extraMd,
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
  });
  return [index, ...details];
}

function glossaryPage(content: ContentBundle): Page {
  const dir = 'glossary/';
  const termOf = new Map(content.glossary.map((g) => [g.slug, g.term] as const));
  const entries = [...content.glossary].sort((a, b) => a.term.localeCompare(b.term));
  const url = abs(dir);
  const items = entries
    .map((g) => {
      const lesson = g.lessonId ? content.lessons.find((l) => l.id === g.lessonId) : undefined;
      const see = (g.see ?? []).filter((s) => termOf.has(s));
      const extra = [
        see.length
          ? `See also: ${see.map((s) => `<a href="#${s}">${esc(termOf.get(s)!)}</a>`).join(', ')}.`
          : '',
        lesson ? `Lesson: <a href="../learn/${lesson.id}/">${esc(lesson.title)}</a>.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<dt id="${g.slug}">${esc(g.term)}</dt><dd>${fixLinks(g.definition, '../', true)}${extra ? `<p class="see">${extra}</p>` : ''}</dd>`;
    })
    .join('\n');
  return {
    dir,
    title: `${GAME} Glossary: ${entries.length} Terms Explained | ${APP}`,
    description: describe(
      `Plain-English definitions of ${entries.length} ${GAME} terms, from Ante, Blind and Trips to qualifying, dealer outs and EV.`,
      FILL,
    ),
    type: 'website',
    trail: [{ name: 'Glossary', dir }],
    h1: `${GAME} glossary`,
    ld: [
      PERSON,
      {
        '@type': 'DefinedTermSet',
        '@id': `${url}#terms`,
        name: `${GAME} glossary`,
        url,
        inLanguage: 'en',
        hasDefinedTerm: entries.map((g) => ({
          '@type': 'DefinedTerm',
          '@id': `${url}#${g.slug}`,
          name: g.term,
          description: stripTags(g.definition),
          url: `${url}#${g.slug}`,
          inDefinedTermSet: `${url}#terms`,
        })),
      },
    ],
    body: [
      `<p class="lead">${entries.length} terms, in alphabetical order, most with a link to the lesson that teaches them.</p>`,
      `<dl class="gloss">${items}</dl>`,
      ctaBox('../#/glossary', `Open the glossary in ${APP}`),
    ].join('\n'),
    markdown: entries.map((g) => `- **${g.term}**: ${stripTags(g.definition)}`).join('\n'),
  };
}

function strategyPage(content: ContentBundle): Page {
  const dir = 'strategy/';
  const s = content.strategy;
  const perfect4x = fourXSet('perfect');
  const same = (id: StrategyId) => {
    const o = fourXSet(id);
    return o.size === perfect4x.size && [...o].every((c) => perfect4x.has(c));
  };
  const rules = (id: StrategyId) =>
    `<ul>${(s[id]?.rules ?? []).map((r) => `<li>${fixLinks(r, '../')}</li>`).join('')}</ul>`;
  const rulesMd = (id: StrategyId) =>
    (s[id]?.rules ?? []).map((r) => `- ${stripTags(r)}`).join('\n');
  const lessonLinks = [
    'preflop-raise',
    'preflop-close-calls',
    'flop-raise',
    'river-call-or-fold',
    'counting-dealer-outs',
    'strategy-practical',
    'costly-habits',
  ]
    .map((id) => content.lessons.find((l) => l.id === id))
    .filter((l): l is Lesson => !!l);
  const streetRules = (id: StrategyId) =>
    `<h3>On the flop</h3><ol>${ruleLines(id, 'flop')
      .map((l) => `<li>${esc(l)}</li>`)
      .join('')}</ol><h3>On the river</h3><ol>${ruleLines(id, 'river')
      .map((l) => `<li>${esc(l)}</li>`)
      .join('')}</ol>`;
  const practical: StrategyId[] = ['basic', 'simple'];
  const costly: StrategyId[] = ['check-to-river', 'never-fold', 'always-max'];
  const body = [
    `<p class="lead">When to bet 4x before the flop, 2x on the flop, and 1x or fold on the river. ${esc(s.perfect?.summary ?? '')}</p>`,
    ctaBox(
      '../#/strategy',
      `Open the interactive charts in ${APP}`,
      'Or drill the chart until it sticks. Free, play money.',
    ),
    `<h2>${esc(s.perfect?.title ?? 'Perfect')} strategy: the lowest house edge</h2>`,
    rules('perfect'),
    `<h3>Preflop chart: when to raise 4x</h3>`,
    gridHtml('perfect', [], 'Preflop strategy chart: bet 4x or check'),
    ...practical.map(
      (id) =>
        `<h2>${esc(s[id]?.title ?? id)} strategy</h2><p>${esc(s[id]?.summary ?? '')}</p>${rules(id)}${
          same(id)
            ? `<p class="meta">Preflop chart: the same as perfect strategy, above.</p>`
            : `<h3>Preflop chart</h3>${gridHtml(id, [], `${s[id]?.title ?? id} preflop chart`)}`
        }${streetRules(id)}`,
    ),
    `<h2>Habits that cost money</h2><p>Common ways to play that give the house more. The lessons price each one.</p>`,
    ...costly.map(
      (id) => `<h3>${esc(s[id]?.title ?? id)}</h3><p>${esc(s[id]?.summary ?? '')}</p>${rules(id)}`,
    ),
    lessonLinks.length
      ? `<h2>Learn it step by step</h2><ul>${lessonLinks.map((l) => `<li><a href="../learn/${l.id}/">${esc(l.title)}</a>: ${esc(l.summary)}</li>`).join('')}</ul>`
      : '',
    `<p>Read about the <a href="../bets/">bets and paytables</a> or look up a term in the <a href="../glossary/">glossary</a>.</p>`,
  ].join('\n');
  const markdown = [
    s.perfect?.summary ?? '',
    `### ${s.perfect?.title ?? 'Perfect'} strategy\n\n${rulesMd('perfect')}\n\nPreflop chart: ${fourXText('perfect')}`,
    ...practical.map(
      (id) =>
        `### ${s[id]?.title ?? id} strategy\n\n${s[id]?.summary ?? ''}\n\n${rulesMd(id)}\n\nPreflop chart: ${same(id) ? 'the same as perfect strategy.' : fourXText(id)}\n\nFlop rules:\n${ruleLines(
          id,
          'flop',
        )
          .map((l, i) => `${i + 1}. ${l}`)
          .join('\n')}\n\nRiver rules:\n${ruleLines(id, 'river')
          .map((l, i) => `${i + 1}. ${l}`)
          .join('\n')}`,
    ),
    `### Habits that cost money\n\n${costly.map((id) => `#### ${s[id]?.title ?? id}\n\n${s[id]?.summary ?? ''}\n\n${rulesMd(id)}`).join('\n\n')}`,
  ].join('\n\n');
  const description = describe(
    `${GAME} strategy chart: exactly which hands to raise 4x preflop, when to bet 2x on the flop, and when to bet 1x or fold on the river.`,
    FILL,
  );
  return {
    dir,
    title: `${GAME} Strategy Chart (4x, 2x, 1x) | ${APP}`,
    description,
    type: 'article',
    trail: [{ name: 'Strategy chart', dir }],
    h1: `${GAME} strategy chart`,
    ld: [
      PERSON,
      {
        '@type': ['Article', 'LearningResource'],
        '@id': `${abs(dir)}#article`,
        headline: `${GAME} strategy chart: when to bet 4x, 2x and 1x`,
        description,
        url: abs(dir),
        mainEntityOfPage: abs(dir),
        image: OG_IMAGE,
        inLanguage: 'en',
        learningResourceType: 'Reference',
        educationalLevel: 'Intermediate',
        isAccessibleForFree: true,
        author: { '@id': PERSON_ID },
        publisher: { '@id': PERSON_ID },
        isPartOf: { '@id': COURSE_ID },
      },
    ],
    body,
    markdown,
  };
}

// ---------- SPA head, sitemap, llms ----------

function spaHead(content: ContentBundle) {
  const title = `${GAME}: Free Lessons & Strategy | ${APP}`;
  const description = describe(
    `Learn ${GAME} free: ${content.lessons.length} short lessons, the exact 4x/2x/1x strategy chart, and a play-money table that shows the EV of every decision.`,
    FILL.slice(2),
  );
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      PERSON,
      WEBSITE,
      {
        '@type': 'WebApplication',
        '@id': APP_ID,
        name: `${APP}: ${GAME} trainer`,
        alternateName: APP,
        url: BASE_URL,
        description,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any (web browser)',
        inLanguage: 'en',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
        image: OG_IMAGE,
        author: { '@id': PERSON_ID },
        isPartOf: { '@id': WEBSITE_ID },
      },
    ],
  };
  const head = [
    metaTags({ title, description, url: BASE_URL, type: 'website' }),
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
  const noscript = `<noscript><div style="max-width:40rem;margin:2rem auto;padding:0 16px;font:17px/1.6 system-ui,sans-serif;color:#eef3f7;background:#0b2e4a">
<h1>${GAME}: free lessons and strategy</h1>
<p>holdumb teaches ${GAME} from zero to perfect strategy in ${content.lessons.length} short lessons, with a play-money practice table that shows the expected value of every decision. The interactive table needs JavaScript, but you can read everything without it.</p>
<ul><li><a style="color:#9fd3ff" href="./learn/">The course: all ${content.lessons.length} lessons</a></li><li><a style="color:#9fd3ff" href="./strategy/">Strategy chart: when to bet 4x, 2x, 1x</a></li><li><a style="color:#9fd3ff" href="./bets/">Bets and paytables</a></li><li><a style="color:#9fd3ff" href="./glossary/">Glossary</a></li></ul>
<p>For education only, with play money only. If gambling is hurting you or someone you know, call or text 1-800-GAMBLER (US).</p>
</div></noscript>`;
  return { title, description, head, noscript };
}

export function generateSite(root: string): SeoSite {
  const content = buildContent(root);
  const sources = new Map<string, string>();
  for (const f of readSources(root).lessonFiles) {
    const id = splitFrontMatter(f.source).data.id;
    if (typeof id === 'string') sources.set(id, f.source);
  }
  const raw: Page[] = [
    ...learnPages(content, sources),
    strategyPage(content),
    ...betPages(content),
    glossaryPage(content),
  ];
  const pages: StaticPage[] = raw.map((p) => ({
    dir: p.dir,
    title: p.title,
    description: p.description,
    html: renderPage(p),
    markdown: p.markdown,
  }));
  const urls = [BASE_URL, ...pages.map((p) => abs(p.dir))];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
  const lessons = content.lessons;
  const llms = `# holdumb — ${GAME}

> holdumb is a free, phone-first web app by creynia (part of Know the Odds, ${ORIGIN}/) that teaches ${GAME} from zero to perfect strategy: ${lessons.length} short lessons, the exact preflop/flop/river strategy chart, and a play-money practice table that shows the expected value (EV) of every decision. It is for education only, with play money only; the house always has an edge.

The app itself is a single-page app at ${BASE_URL}. Every lesson and reference page below is also published as plain HTML, and the full text is in ${BASE_URL}llms-full.txt.

## Course

- [Learn ${GAME}](${abs('learn/')}): course index, ${content.chapters.length} chapters
${lessons.map((l) => `- [${l.title}](${abs(`learn/${l.id}/`)}): ${l.summary}`).join('\n')}

## Reference

- [${GAME} strategy chart](${abs('strategy/')}): which hands to bet 4x preflop, when to bet 2x on the flop and 1x on the river
- [Bets and paytables](${abs('bets/')}): Ante, Blind, Play and Trips, with the Blind and Trips paytables
${WAGER_IDS.map((w) => `- [The ${content.bets[w]?.name ?? WAGER_NAME[w]} bet](${abs(`bets/${w}/`)}): ${content.bets[w]?.summary ?? ''}`).join('\n')}
- [Glossary](${abs('glossary/')}): ${content.glossary.length} ${GAME} terms

## App

- [holdumb](${BASE_URL}): the interactive app (lessons, practice table, EV sheet, drills); free, no sign-up, works offline

## Optional

- [Full text](${BASE_URL}llms-full.txt): every page above as markdown
- [Know the Odds](${ORIGIN}/): the other casino-math apps by creynia (Craps, Baccarat, Roulette)
`;
  const llmsFull = `# holdumb — ${GAME}: full text

> The full readable text of every static page of holdumb (${BASE_URL}), a free ${GAME} course and play-money practice app by creynia. Education only; the house always has an edge.

${pages.map((p) => `## ${stripTags(raw.find((r) => r.dir === p.dir)!.h1)}\n\nURL: ${abs(p.dir)}\n\n${p.markdown.trim()}`).join('\n\n---\n\n')}
`;
  return { pages, sitemap, llms, llmsFull, spa: spaHead(content) };
}
