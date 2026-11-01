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
  formatMoney,
  formatPct,
} from '../../src/sim/engine';
import type { Paytable, PaytablePresetId, WagerId } from '../../src/sim/engine';
import { strategyChart } from '../../src/sim/strategy';
import type { StrategyId } from '../../src/sim/strategy';
import { TRIPS_EDGE, payRows, wagerTierOf } from '../../src/app/bets';
import { HAND_LABEL } from '../../src/app/screens/handLabels';
import {
  EXAMPLE_ANTE_CENTS,
  RANKS,
  SEVEN_CARD_TOTAL_TEXT,
  STARTING_COMBOS,
  fourXRangeText,
  fourXSet,
  fourXShare,
  handOdds,
  headline,
  strategyRows,
  tripsRows,
} from './numbers';
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

const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * Search-facing <title> and description lead for lessons that answer a common question. The h1
 * and the text stay the app's own; only the head wording follows the query.
 */
export const LESSON_SEO: Record<string, { title: string; lead: string }> = {
  welcome: {
    title: `How to Play ${GAME}: Welcome to the Table | ${APP}`,
    lead: `How to play ${GAME}:`,
  },
  'preflop-raise': {
    title: `When to Raise 4x Preflop | ${GAME} | ${APP}`,
    lead: `When to raise 4x in ${GAME}:`,
  },
  'flop-raise': {
    title: `When to Bet 2x on the Flop | ${GAME} | ${APP}`,
    lead: `When to bet 2x on the flop in ${GAME}:`,
  },
  'river-call-or-fold': {
    title: `When to Fold on the River | ${GAME} | ${APP}`,
    lead: `When to bet 1x or fold on the river in ${GAME}:`,
  },
  'edge-vs-risk': {
    title: `House Edge vs Element of Risk | ${GAME} | ${APP}`,
    lead: `${GAME} house edge vs element of risk:`,
  },
};

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
      `<h2>Reference</h2><ul><li><a href="../strategy/">${GAME} strategy chart: when to raise 4x</a></li><li><a href="../house-edge/">${GAME} house edge and odds</a></li><li><a href="../bets/">Bets and paytables</a></li><li><a href="../glossary/">Glossary</a></li></ul>`,
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
    const seo = LESSON_SEO[l.id];
    const title =
      seo?.title ?? (long.length <= 65 ? long : mid.length <= 65 ? mid : `${l.title} | ${APP}`);
    const description = describe(seo ? `${seo.lead} ${lcFirst(l.summary)}` : l.summary, [
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

const handPhrase = (category: string) => {
  const l = (HAND_LABEL[category] ?? category).toLowerCase();
  return /^(four|three|two) /.test(l) ? l : `a ${l}`;
};
/** '500 to 1 for a royal flush, …, and 1 to 1 for a straight' from a paytable. */
const payList = (t: Paytable) => {
  const xs = payRows(t).map((r) => `${r.pays} for ${handPhrase(r.category)}`);
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
};

/** Answer-first title, h1, opening paragraph and description for the bets people search for. */
export function betAnswers(): Partial<
  Record<WagerId, { title: string; h1: string; answer: string; description: string }>
> {
  const blind = BLIND_PAYTABLES['blind-standard'];
  const br = payRows(blind);
  const trips = tripsRows();
  const def = trips.find((t) => t.isDefault)!;
  const lo = trips[0]!;
  const hi = trips[trips.length - 1]!;
  const lab = (id: PaytablePresetId) => TRIPS_PAYTABLES[id].label;
  return {
    blind: {
      title: `${GAME} Blind Bet Payout & Paytable | ${APP}`,
      h1: 'The Blind bet: payout and paytable',
      answer: `The Blind pays only when you win the hand with a straight or better: ${payList(blind)}. Any smaller winning hand pushes the Blind, and it loses whenever the dealer beats you or you fold. Whether the dealer qualifies does not matter.`,
      description: describe(
        `How the ${GAME} Blind bet pays: ${br[0]!.pays} for ${handPhrase(br[0]!.category)} down to ${br[br.length - 1]!.pays} for ${handPhrase(br[br.length - 1]!.category)}, only when you win. Smaller winning hands push.`,
        FILL,
      ),
    },
    trips: {
      title: `${GAME} Trips Paytable & House Edge | ${APP}`,
      h1: 'The Trips bet: paytables and house edge',
      answer: `The Trips side bet pays on your own final hand, whatever the dealer has. On the app's default ${lab(def.id)} table it pays ${payList(TRIPS_PAYTABLES[def.id])}; anything less loses. Its house edge is ${def.edgePct} on that table, and runs from ${lo.edgePct} (${lab(lo.id)}) to ${hi.edgePct} (${lab(hi.id)}) across the ${trips.length} paytables the app offers.`,
      description: describe(
        `${GAME} Trips paytables and house edge: ${def.edgePct} on the default ${lab(def.id)} table, ${lo.edgePct} to ${hi.edgePct} across ${trips.length} common paytables.`,
        [
          "It pays on your own hand, not the dealer's.",
          'Full paytables for each variant.',
          ...FILL,
        ],
      ),
    },
  };
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
      `How every ${GAME} bet works: the Ante, the Blind, the one Play raise (4x, 2x or 1x) and the Trips side bet, plus their paytables.`,
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
      `<p>What each bet costs over time, with every strategy: <a href="../house-edge/">${GAME} house edge and odds</a>.</p>`,
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
  const answers = betAnswers();
  const details = WAGER_IDS.map((w): Page => {
    const dir = `bets/${w}/`;
    const up = upFrom(dir);
    const copy = content.bets[w];
    const name = copy?.name ?? WAGER_NAME[w];
    const ans = answers[w];
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
      title: ans?.title ?? `The ${name} Bet in ${GAME} | ${APP}`,
      description:
        ans?.description ??
        describe(copy?.summary ?? `The ${name} bet.`, [
          `How the ${name} bet is placed and settled in ${GAME}.`,
          ...FILL,
        ]),
      type: 'article',
      trail: [...trail, { name, dir }],
      h1: esc(ans?.h1 ?? `The ${name} bet`),
      ld: [
        PERSON,
        {
          '@type': 'Article',
          '@id': `${abs(dir)}#article`,
          headline: ans ? `${GAME}: ${ans.h1}` : `The ${name} bet in ${GAME}`,
          description: ans?.answer ?? copy?.summary ?? '',
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
        ans ? `<p class="lead">${esc(ans.answer)}</p>` : '',
        copy
          ? `<p${ans ? '' : ' class="lead"'}>${esc(copy.summary)}</p>${fixLinks(copy.howItWorks, up)}`
          : '',
        w === 'trips'
          ? `<p>Compare it with the main game on the <a href="${up}house-edge/">house edge page</a>.</p>`
          : '',
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
        ans?.answer ?? '',
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

/** Lessons each reference page builds on, in reading order (also feeds the Related blocks). */
export const STRATEGY_LESSONS = [
  'preflop-raise',
  'preflop-close-calls',
  'flop-raise',
  'river-call-or-fold',
  'counting-dealer-outs',
  'strategy-practical',
  'costly-habits',
];
export const HOUSE_EDGE_LESSONS = [
  'expected-value',
  'edge-vs-risk',
  'strategy-practical',
  'costly-habits',
  'trips-bet',
  'strategy-fun-per-dollar',
];

/** A strategy's flop or river rule lines, lower-cased for use inside a sentence. */
function streetLines(id: StrategyId, view: 'flop' | 'river'): string[] {
  const part = strategyChart(id)[view];
  return part.rule === 'rules' ? part.lines.map((l) => lcFirst(l.text)) : [];
}

/** The quotable first paragraph of strategy/: the whole basic strategy in three sentences. */
export function strategyAnswer(): string {
  const share = fourXShare('perfect');
  return [
    `Raise 4x before the flop with ${fourXRangeText('perfect')}: ${share.kinds} of the 169 kinds of starting hand, or ${share.pct} of all ${STARTING_COMBOS.toLocaleString('en-US')} two-card hands. Check everything else (3x is never right).`,
    `If you checked, bet 2x on the flop with ${streetLines('basic', 'flop').join('; or ')}. Otherwise check.`,
    `If you checked again, bet 1x on the river with ${streetLines('basic', 'river').join('; or ')}. Otherwise fold.`,
  ].join(' ');
}

const rowOf = (id: StrategyId) => strategyRows().find((r) => r.id === id)!;

function lessonList(content: ContentBundle, ids: readonly string[], up: string) {
  const ls = ids
    .map((id) => content.lessons.find((l) => l.id === id))
    .filter((l): l is Lesson => !!l);
  return {
    html: ls.length
      ? `<ul>${ls.map((l) => `<li><a href="${up}learn/${l.id}/">${esc(l.title)}</a>: ${esc(l.summary)}</li>`).join('')}</ul>`
      : '',
    md: ls.map((l) => `- [${l.title}](${abs(`learn/${l.id}/`)}): ${l.summary}`).join('\n'),
  };
}

const lessonLinkInline = (content: ContentBundle, id: string, up: string) => {
  const l = content.lessons.find((x) => x.id === id);
  return l ? `<a href="${up}learn/${l.id}/">${esc(l.title)}</a>` : '';
};

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
  const ol = (lines: string[]) => `<ol>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`;
  const olMd = (lines: string[]) => lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
  const streetRules = (id: StrategyId) =>
    `<h3>On the flop</h3>${ol(ruleLines(id, 'flop'))}<h3>On the river</h3>${ol(ruleLines(id, 'river'))}`;
  const answer = strategyAnswer();
  const basic = rowOf('basic');
  const perfect = rowOf('perfect');
  const cost = `That is the basic strategy. Its house edge is ${basic.edgePct} of the Ante; perfect play, which differs from it only in rare flop and river spots, gets it down to ${perfect.edgePct}.`;
  const learn = lessonList(content, STRATEGY_LESSONS, '../');
  const link = (id: string) => lessonLinkInline(content, id, '../');
  const costly: StrategyId[] = ['check-to-river', 'never-fold', 'always-max'];
  const body = [
    `<p class="lead">${esc(answer)}</p>`,
    `<p>${esc(cost)} See what every strategy costs on the <a href="../house-edge/">house edge page</a>.</p>`,
    ctaBox(
      '../#/strategy',
      `Open the interactive charts in ${APP}`,
      'Or drill the chart until it sticks. Free, play money.',
    ),
    `<h2 id="preflop">When to raise 4x preflop</h2>`,
    `<p>Bet 4x with the hands marked 4x, and check the rest. Perfect strategy and the basic card use the same chart.</p>`,
    gridHtml('perfect', [], 'Preflop strategy chart: bet 4x or check'),
    `<p>Close to the edge of the chart the choice barely matters: see ${link('preflop-close-calls')}.</p>`,
    `<h2 id="flop">When to bet 2x on the flop</h2>`,
    `<p>Only if you checked preflop. These are the basic flop rules:</p>`,
    ol(ruleLines('basic', 'flop')),
    `<p>Perfect play decides the flop by looking at every turn, river and dealer hand; the rules above match it almost always. Lessons: ${[link('flop-raise'), link('flop-tricky-boards')].filter(Boolean).join(', ')}.</p>`,
    `<h2 id="river">When to bet 1x or fold on the river</h2>`,
    `<p>Only if you checked twice. These are the basic river rules:</p>`,
    ol(ruleLines('basic', 'river')),
    `<p>Folding gives up your Ante and Blind. Lessons: ${[link('river-call-or-fold'), link('counting-dealer-outs')].filter(Boolean).join(', ')}.</p>`,
    `<h2 id="perfect">${esc(s.perfect?.title ?? 'Perfect')} strategy: the lowest house edge</h2>`,
    `<p>${esc(s.perfect?.summary ?? '')}</p>`,
    rules('perfect'),
    `<h2 id="basic">${esc(s.basic?.title ?? 'Basic')} strategy</h2><p>${esc(s.basic?.summary ?? '')}</p>${rules('basic')}<p class="meta">The rules in the three sections above are this card.</p>`,
    `<h2 id="simple">${esc(s.simple?.title ?? 'Simple')} strategy</h2><p>${esc(s.simple?.summary ?? '')}</p>${rules('simple')}${
      same('simple')
        ? `<p class="meta">Preflop chart: the same as perfect strategy, above.</p>`
        : `<h3>Preflop chart</h3>${gridHtml('simple', [], `${s.simple?.title ?? 'Simple'} preflop chart`)}`
    }${streetRules('simple')}`,
    `<h2>Habits that cost money</h2><p>Common ways to play that give the house more. The <a href="../house-edge/">house edge page</a> prices each one.</p>`,
    ...costly.map(
      (id) => `<h3>${esc(s[id]?.title ?? id)}</h3><p>${esc(s[id]?.summary ?? '')}</p>${rules(id)}`,
    ),
    learn.html ? `<h2>Learn it step by step</h2>${learn.html}` : '',
    `<p>Read about the <a href="../bets/">bets and paytables</a> or look up a term in the <a href="../glossary/">glossary</a>.</p>`,
  ].join('\n');
  const markdown = [
    answer,
    cost,
    `### When to raise 4x preflop\n\n${fourXText('perfect')}`,
    `### When to bet 2x on the flop\n\n${olMd(ruleLines('basic', 'flop'))}`,
    `### When to bet 1x or fold on the river\n\n${olMd(ruleLines('basic', 'river'))}`,
    `### ${s.perfect?.title ?? 'Perfect'} strategy\n\n${s.perfect?.summary ?? ''}\n\n${rulesMd('perfect')}`,
    `### ${s.basic?.title ?? 'Basic'} strategy\n\n${s.basic?.summary ?? ''}\n\n${rulesMd('basic')}`,
    `### ${s.simple?.title ?? 'Simple'} strategy\n\n${s.simple?.summary ?? ''}\n\n${rulesMd('simple')}\n\nPreflop chart: ${same('simple') ? 'the same as perfect strategy.' : fourXText('simple')}\n\nFlop rules:\n${olMd(ruleLines('simple', 'flop'))}\n\nRiver rules:\n${olMd(ruleLines('simple', 'river'))}`,
    `### Habits that cost money\n\n${costly.map((id) => `#### ${s[id]?.title ?? id}\n\n${s[id]?.summary ?? ''}\n\n${rulesMd(id)}`).join('\n\n')}`,
    learn.md ? `### Learn it step by step\n\n${learn.md}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const description = describe(
    `UTH strategy chart: raise 4x with ${fourXRangeText('perfect')}. Plus the 2x flop and fold-or-1x river rules.`,
    FILL,
  );
  return {
    dir,
    title: `${GAME} Strategy Chart: When to Raise 4x | ${APP}`,
    description,
    type: 'article',
    trail: [{ name: 'Strategy chart', dir }],
    h1: `${GAME} strategy chart: when to raise 4x, bet 2x or fold`,
    ld: [
      PERSON,
      {
        '@type': ['Article', 'LearningResource'],
        '@id': `${abs(dir)}#article`,
        headline: `${GAME} strategy chart: when to raise 4x, bet 2x or fold`,
        description,
        abstract: answer,
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

// ---------- house edge ----------

/** The quotable first paragraph of house-edge/. */
export function houseEdgeAnswer(): string {
  const h = headline();
  const t = tripsRows().find((r) => r.isDefault)!;
  return `With perfect strategy, ${GAME} has a house edge of ${h.edgePct} of your Ante. Measured against the Ante plus Blind it is ${h.perInitialPct}, and as an element of risk (the loss per dollar of everything you bet, ${h.wager} antes a hand on average) it is ${h.eorPct}. At ${h.handsPerHour} hands an hour and a ${formatMoney(EXAMPLE_ANTE_CENTS)} Ante, that is about ${h.perHour10} an hour. The optional Trips bet is priced on its own: ${t.edgePct} on the ${TRIPS_PAYTABLES[t.id].label} paytable.`;
}

function houseEdgePage(content: ContentBundle): Page {
  const dir = 'house-edge/';
  const h = headline();
  const rows = strategyRows();
  const trips = tripsRows();
  const odds = handOdds();
  const answer = houseEdgeAnswer();
  const name = (id: StrategyId) => content.strategy[id]?.title ?? id;
  const anchor: Partial<Record<StrategyId, string>> = {
    perfect: 'perfect',
    basic: 'basic',
    simple: 'simple',
  };
  const ante = formatMoney(EXAMPLE_ANTE_CENTS);
  const measures = [
    ['House edge per Ante', 'your Ante', h.edgePct],
    ['Edge per initial wager', 'your Ante + Blind', h.perInitialPct],
    [
      'Element of risk',
      `everything you put in action, raises included (${h.wager} antes on average)`,
      h.eorPct,
    ],
  ] as const;
  const th = (cols: string[]) =>
    `<thead><tr>${cols.map((c, i) => `<th scope="col"${i ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead>`;
  const measuresHtml = `<table><caption>Three ways to quote the same expected loss (perfect play, Trips excluded)</caption><thead><tr><th scope="col">Measure</th><th scope="col">Divides the expected loss by</th><th scope="col" class="num">Perfect play</th></tr></thead><tbody>${measures
    .map(
      ([m, d, v]) =>
        `<tr><th scope="row">${m}</th><td>${esc(d)}</td><td class="num">${v}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  const stratHtml = `<table><caption>House edge by strategy (Trips excluded; cost per hour at a ${ante} Ante, ${h.handsPerHour} hands an hour)</caption>${th(['Strategy', 'House edge per Ante', 'Element of risk', 'Antes bet per hand', 'Cost per hour'])}<tbody>${rows
    .map((r) => {
      const a = anchor[r.id];
      const label = a ? `<a href="../strategy/#${a}">${esc(name(r.id))}</a>` : esc(name(r.id));
      return `<tr><th scope="row">${label}</th><td class="num">${r.edgePct}</td><td class="num">${r.eorPct}</td><td class="num">${r.wager}</td><td class="num">${r.perHour10}</td></tr>`;
    })
    .join('')}</tbody></table>`;
  const tripsHtml = `<table><caption>Trips side bet: house edge by paytable (full house / flush / straight pays)</caption>${th(['Paytable', 'House edge', 'Rating'])}<tbody>${trips
    .map(
      (t) =>
        `<tr><th scope="row">${esc(TRIPS_PAYTABLES[t.id].label)}${t.isDefault ? ' (app default)' : ''}</th><td class="num">${t.edgePct}</td><td class="num">${TIER_LABEL[wagerTierOf(t.edge)]}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  const oddsHtml = `<table><caption>Your best five of seven cards (2 hole cards + 5 on the board), over all ${SEVEN_CARD_TOTAL_TEXT} seven-card combinations</caption>${th(['Final hand', 'Probability', 'About 1 in'])}<tbody>${odds
    .map(
      (o) =>
        `<tr><th scope="row">${esc(HAND_LABEL[o.category] ?? o.category)}</th><td class="num">${o.pct}</td><td class="num">${o.oneIn}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  const learn = lessonList(content, HOUSE_EDGE_LESSONS, '../');
  const worst = rows[rows.length - 1]!;
  const body = [
    `<p class="lead">${esc(answer)}</p>`,
    ctaBox(
      '../#/strategy',
      `Compare strategies in ${APP}`,
      'Every figure on this page is computed exactly by the app. Free, play money.',
    ),
    `<h2>What is the house edge of ${GAME}?</h2>`,
    `<p>The three figures quoted for ${GAME} all describe the same game; they divide the same expected loss by different amounts.</p>`,
    measuresHtml,
    `<p>Per Ante is the number that turns straight into money: cost per hour = hands per hour × Ante × edge per Ante. The element of risk is the fairer way to compare with games where you rarely raise. ${lessonLinkInline(content, 'edge-vs-risk', '../') ? `More in ${lessonLinkInline(content, 'edge-vs-risk', '../')}.` : ''}</p>`,
    `<h2>How much does your strategy change the edge?</h2>`,
    `<p>A lot. The game is only cheap if you raise when you should. ${esc(name('basic'))} and ${esc(name('simple'))} are cards you can memorise; the last rows are common habits. ${esc(name(worst.id))} costs ${worst.perHour10} an hour against ${rows[0]!.perHour10} for perfect play.</p>`,
    stratHtml,
    `<p>The rules for each strategy are on the <a href="../strategy/">strategy chart</a>.</p>`,
    `<h2>What is the house edge on the Trips bet?</h2>`,
    `<p>Trips pays on your own final hand, whatever the dealer has, so its price depends only on the paytable. It never changes how you should play.</p>`,
    tripsHtml,
    `<p>Full paytables: <a href="../bets/trips/">the Trips bet</a>.</p>`,
    `<h2>How often does the dealer qualify?</h2>`,
    `<p>The dealer qualifies with a pair or better ${h.qualifyPct} of the time. When the dealer does not qualify, your Ante pushes; the Blind and Play are still settled. See <a href="../bets/ante/">the Ante bet</a>.</p>`,
    `<h2>What are the odds of each poker hand?</h2>`,
    `<p>The Blind pays a bonus on a straight or better, and Trips pays on three of a kind or better, so these are the odds that matter for both.</p>`,
    oddsHtml,
    learn.html ? `<h2>Learn the math</h2>${learn.html}` : '',
  ].join('\n');
  const md = [
    answer,
    `### What is the house edge of ${GAME}?\n\n| Measure | Divides the expected loss by | Perfect play |\n| --- | --- | --- |\n${measures.map(([m, d, v]) => `| ${m} | ${d} | ${v} |`).join('\n')}`,
    `### How much does your strategy change the edge?\n\nCost per hour at a ${ante} Ante, ${h.handsPerHour} hands an hour; Trips excluded.\n\n| Strategy | House edge per Ante | Element of risk | Antes bet per hand | Cost per hour |\n| --- | --- | --- | --- | --- |\n${rows.map((r) => `| ${name(r.id)} | ${r.edgePct} | ${r.eorPct} | ${r.wager} | ${r.perHour10} |`).join('\n')}`,
    `### What is the house edge on the Trips bet?\n\n| Paytable | House edge | Rating |\n| --- | --- | --- |\n${trips.map((t) => `| ${TRIPS_PAYTABLES[t.id].label}${t.isDefault ? ' (app default)' : ''} | ${t.edgePct} | ${TIER_LABEL[wagerTierOf(t.edge)]} |`).join('\n')}`,
    `### How often does the dealer qualify?\n\n${h.qualifyPct} of the time (a pair or better). When the dealer does not qualify, the Ante pushes.`,
    `### What are the odds of each poker hand?\n\nBest five of seven cards, over all ${SEVEN_CARD_TOTAL_TEXT} seven-card combinations.\n\n| Final hand | Probability | About 1 in |\n| --- | --- | --- |\n${odds.map((o) => `| ${HAND_LABEL[o.category] ?? o.category} | ${o.pct} | ${o.oneIn} |`).join('\n')}`,
    learn.md ? `### Learn the math\n\n${learn.md}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const description = describe(
    `${GAME} house edge: ${h.edgePct} of the Ante under perfect strategy, element of risk ${h.eorPct}. Plus every strategy's cost, Trips edges and hand odds.`,
    FILL,
  );
  const title = `${GAME} House Edge & Odds (Exact) | ${APP}`;
  return {
    dir,
    title,
    description,
    type: 'article',
    trail: [{ name: 'House edge and odds', dir }],
    h1: `${GAME} house edge and odds`,
    ld: [
      PERSON,
      {
        '@type': ['Article', 'LearningResource'],
        '@id': `${abs(dir)}#article`,
        headline: `${GAME} house edge and odds`,
        description,
        abstract: answer,
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
    markdown: md,
  };
}

// ---------- related pages ----------

/** Reference pages and the lessons/bets they build on (the edges of the Related graph). */
const REFS: readonly { dir: string; lessons: readonly string[]; bets: readonly WagerId[] }[] = [
  { dir: 'strategy/', lessons: STRATEGY_LESSONS, bets: ['play'] },
  { dir: 'house-edge/', lessons: HOUSE_EDGE_LESSONS, bets: ['trips'] },
];
const RELATED_MAX = 5;

/**
 * Up to five closely related page dirs for a lesson, bet or reference page, chosen from the
 * content data in a fixed order; [] for the index pages. Lessons: the bets that cite them, the
 * reference pages built on them, then the nearest lessons in the same chapter and the course
 * (prev/next are already linked). Bets: their lesson, the reference pages, the other bets.
 */
export function relatedDirs(content: ContentBundle, dir: string): string[] {
  const { lessons, chapters } = content;
  const pick = (xs: string[]) => [...new Set(xs)].filter((d) => d !== dir).slice(0, RELATED_MAX);
  const lessonDir = (id: string) => `learn/${id}/`;
  const byDistance = (i: number, pool: string[]) =>
    pool
      .map((id) => ({ id, d: Math.abs(lessons.findIndex((l) => l.id === id) - i) }))
      .filter((x) => x.d > 1)
      .sort(
        (a, b) =>
          a.d - b.d ||
          lessons.findIndex((l) => l.id === a.id) - lessons.findIndex((l) => l.id === b.id),
      )
      .map((x) => lessonDir(x.id));
  const m = /^learn\/([^/]+)\/$/.exec(dir);
  if (m) {
    const id = m[1]!;
    const i = lessons.findIndex((l) => l.id === id);
    if (i < 0) return [];
    const ch = chapters.find((c) => c.id === lessons[i]!.chapterId);
    return pick([
      ...WAGER_IDS.filter((w) => content.bets[w]?.lessonId === id).map((w) => `bets/${w}/`),
      ...REFS.filter((r) => r.lessons.includes(id)).map((r) => r.dir),
      ...byDistance(i, ch?.lessons ?? []),
      ...byDistance(
        i,
        lessons.map((l) => l.id),
      ),
    ]);
  }
  const b = /^bets\/([^/]+)\/$/.exec(dir);
  if (b) {
    const w = b[1] as WagerId;
    const lid = content.bets[w]?.lessonId;
    return pick([
      ...(lid && lessons.some((l) => l.id === lid) ? [lessonDir(lid)] : []),
      ...REFS.filter((r) => r.bets.includes(w)).map((r) => r.dir),
      ...REFS.filter((r) => lid && r.lessons.includes(lid)).map((r) => r.dir),
      ...WAGER_IDS.filter((x) => x !== w).map((x) => `bets/${x}/`),
    ]);
  }
  const ref = REFS.find((r) => r.dir === dir);
  if (ref)
    return pick([
      ...REFS.map((r) => r.dir),
      ...ref.bets.map((w) => `bets/${w}/`),
      'glossary/',
      'learn/',
    ]);
  return [];
}

function withRelated(content: ContentBundle, pages: Page[]): Page[] {
  const label = new Map(pages.map((p) => [p.dir, stripTags(p.h1)] as const));
  return pages.map((p) => {
    const rel = relatedDirs(content, p.dir).filter((d) => label.has(d));
    if (!rel.length) return p;
    const up = upFrom(p.dir);
    return {
      ...p,
      body: `${p.body}
<nav class="related" aria-labelledby="related-h"><h2 id="related-h">Related</h2><ul>${rel
        .map((d) => `<li><a href="${up}${d}">${esc(label.get(d)!)}</a></li>`)
        .join('')}</ul></nav>`,
      markdown: `${p.markdown.trim()}

Related: ${rel.map((d) => `[${label.get(d)!}](${abs(d)})`).join(', ')}`,
    };
  });
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
<ul><li><a style="color:#9fd3ff" href="./learn/">The course: all ${content.lessons.length} lessons</a></li><li><a style="color:#9fd3ff" href="./strategy/">Strategy chart: when to bet 4x, 2x, 1x</a></li><li><a style="color:#9fd3ff" href="./house-edge/">House edge and odds</a></li><li><a style="color:#9fd3ff" href="./bets/">Bets and paytables</a></li><li><a style="color:#9fd3ff" href="./glossary/">Glossary</a></li></ul>
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
  const raw: Page[] = withRelated(content, [
    ...learnPages(content, sources),
    strategyPage(content),
    houseEdgePage(content),
    ...betPages(content),
    glossaryPage(content),
  ]);
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

- [${GAME} strategy chart](${abs('strategy/')}): when to raise 4x preflop (${fourXRangeText('perfect')}), when to bet 2x on the flop, and when to bet 1x or fold on the river
- [${GAME} house edge and odds](${abs('house-edge/')}): exact house edge (${headline().edgePct} of the Ante) and element of risk (${headline().eorPct}) under perfect play, the cost of every strategy, Trips edges by paytable, dealer qualifying and hand odds
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
