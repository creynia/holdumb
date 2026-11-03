import { Marked, marked } from 'marked';
import type { Token, Tokens, TokenizerAndRendererExtension } from 'marked';
import { parse as parseYaml } from 'yaml';
import { parseCards } from '../sim/engine';
import { cardCode } from '../sim/engine';
import { parsePlayParams, validateScene } from '../sim/scene';
import type { SceneConfig } from '../sim/scene';
import { DRILL_CATEGORY_IDS, STRATEGY_IDS } from '../sim/strategy';
import { cardsHtml, checkInline, isHandClass } from './cards';
import { NUMBERS } from './numbers';
import type {
  Block,
  ChartBlockData,
  Lesson,
  ProgressiveBlockData, LessonSource, PractiseLink, Quiz, QuizHand, SourceItem } from './types';
import {
  PROGRESSIVE_METER_MAX,
  PROGRESSIVE_METER_MIN,
  PROGRESSIVE_METER_STEP,
} from './progressive';

export interface CompileOptions {
  /** known glossary slugs, for `[[term]]` links; omit to skip link checking */
  glossarySlugs?: ReadonlySet<string>;
  /** glossary term (lowercase) → slug, for `[[term]]` */
  glossaryTerms?: ReadonlyMap<string, string>;
  /** subtract from every heading depth (min result 2), so lesson headings sit under the page h1 */
  headingShift?: number;
  /** number of sources the text may cite with `[^n]`; omit (or 0) where citations aren't allowed */
  sourceCount?: number;
  /** content/sources.json entries by id, for `sources:` front matter ids */
  sources?: ReadonlyMap<string, SourceItem>;
}

/**
 * `[^n]` citation marker (n = 1-based index into the lesson's `sources`). Rendered as a button,
 * not a link: the app uses hash routing, so `#fragment` hrefs would navigate. The lesson screen
 * scrolls to the matching list item on click.
 */
const citeExtension: TokenizerAndRendererExtension = {
  name: 'cite',
  level: 'inline',
  start(src: string) {
    const i = src.indexOf('[^');
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    // A run of directly adjacent markers ([^2][^3][^4]) is one token, so it renders as one button.
    const m = /^(?:\[\^\d+\])+/.exec(src);
    if (!m) return undefined;
    const ns = [...m[0].matchAll(/\[\^(\d+)\]/g)].map((x) => Number(x[1]));
    return { type: 'cite', raw: m[0], ns };
  },
  renderer(token) {
    const ns = (token as unknown as { ns: number[] }).ns;
    const first = ns[0]!;
    const consecutive = ns.every((n, i) => n === first + i);
    const label =
      ns.length === 1 ? `${first}` : consecutive && ns.length > 2 ? `${first}\u2013${ns[ns.length - 1]}` : ns.join(',');
    const aria = ns.length === 1 ? `Source ${first}` : `Sources ${label}`; // must contain the visible text
    // data-cite is the first source (the click target); data-cites lists all of them for validation.
    return `<sup class="cite"><button type="button" class="cite-btn" data-cite="${first}" data-cites="${ns.join(',')}" aria-label="${aria}">${label}</button></sup>`;
  },
};

/** Inline `{{As Kd}}` cards, tokenised by marked so code spans and code blocks stay literal. */
const cardsExtension: TokenizerAndRendererExtension = {
  name: 'cards',
  level: 'inline',
  start(src: string) {
    const i = src.indexOf('{{');
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^\{\{([^{}]*)\}\}/.exec(src);
    return m ? { type: 'cards', raw: m[0], codes: m[1] ?? '' } : undefined;
  },
  renderer(token) {
    return cardsHtml(String((token as unknown as { codes: string }).codes));
  },
};

const instances = new Map<number, Marked>();
function markedFor(shift: number): Marked {
  let m = instances.get(shift);
  if (!m) {
    m = new Marked({
      extensions: [cardsExtension, citeExtension],
      ...(shift
        ? {
            renderer: {
              heading({ tokens, depth }: Tokens.Heading) {
                const d = Math.min(6, Math.max(2, depth - shift));
                return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>\n`;
              },
            },
          }
        : {}),
    });
    instances.set(shift, m);
  }
  return m;
}

/** Shallowest markdown heading depth (ATX and setext; code blocks ignored), 7 if none. */
export function minHeadingDepth(body: string): number {
  let min = 7;
  const walk = (tokens: readonly Token[]) => {
    for (const t of tokens) {
      if (t.type === 'heading') min = Math.min(min, (t as Tokens.Heading).depth);
      else {
        if ('tokens' in t && Array.isArray(t.tokens)) walk(t.tokens);
        if (t.type === 'list') for (const it of (t as Tokens.List).items) walk(it.tokens);
      }
    }
  };
  walk(marked.lexer(body));
  return min;
}

/** Resolve the optional `sources:` front matter: ids from sources.json, or `{ title, url?, note? }`. */
export function parseLessonSources(
  raw: unknown,
  known?: ReadonlyMap<string, SourceItem>,
): LessonSource[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('front matter sources must be a list');
  return raw.map((e, i): LessonSource => {
    const what = `sources[${i + 1}]`;
    if (typeof e === 'string') {
      const hit = known?.get(e);
      if (!hit) throw new Error(`${what}: unknown source id "${e}" (not in content/sources.json)`);
      return hit;
    }
    if (!isObj(e)) throw new Error(`${what} must be a source id or a { title, url?, note? } mapping`);
    const out: LessonSource = { title: str(e.title, `${what}.title`) };
    for (const k of ['author', 'url', 'note'] as const) {
      if (e[k] !== undefined) out[k] = str(e[k], `${what}.${k}`);
    }
    if (out.url && !/^https:\/\//.test(out.url)) throw new Error(`${what}.url must be an https URL`);
    return out;
  });
}

/** A compiled lesson; `chapter` is the front-matter chapter id (checked against chapters.json). */
export type CompiledLesson = Omit<Lesson, 'chapterId'> & { chapter?: string };

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontMatter(source: string): { data: Record<string, unknown>; body: string } {
  const m = FM.exec(source);
  if (!m) return { data: {}, body: source };
  const data: unknown = parseYaml(m[1] ?? '');
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new Error('front matter must be a YAML mapping');
  return { data: data as Record<string, unknown>, body: source.slice(m[0].length) };
}

/** Render markdown to HTML, resolving `[[term]]` / `[[term|label]]` glossary links and `{{cards}}`. */
export function renderMarkdown(md: string, opts: CompileOptions = {}): string {
  const withLinks = md.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, term: string, label?: string) => {
      const key = term.trim().toLowerCase();
      const slug = opts.glossaryTerms?.get(key) ?? (opts.glossarySlugs?.has(key) ? key : undefined);
      if (!slug) {
        if (opts.glossarySlugs || opts.glossaryTerms)
          throw new Error(`unknown glossary term [[${term}]]`);
        return label ?? term;
      }
      return `<a class="gloss" href="#/glossary?term=${encodeURIComponent(slug)}">${label ?? term.trim()}</a>`;
    },
  );
  const html = markedFor(opts.headingShift ?? 0)
    .parse(withLinks, { async: false })
    .trim();
  const cited = [...html.matchAll(/data-cites="([\d,]+)"/g)].flatMap((m) => m[1]!.split(',').map(Number));
  for (const n of cited) {
    const max = opts.sourceCount ?? 0;
    if (n < 1 || n > max)
      throw new Error(
        max
          ? `citation [^${n}] is out of range (this lesson lists ${max} source${max === 1 ? '' : 's'})`
          : `citation [^${n}] needs a \`sources:\` list in the front matter`,
      );
  }
  // Tables scroll sideways on phones; a scrolling region must be keyboard focusable (axe).
  return html.replace(/<table>/g, '<table tabindex="0" aria-label="Table, scrolls sideways">');
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error(`${what} must be a non-empty string`);
  return v;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function parseHand(raw: unknown, what: string): QuizHand {
  if (!isObj(raw)) throw new Error(`${what}: hand must be a mapping { hole, board? }`);
  const hole = str(raw.hole, `${what}: hand.hole`);
  const board = raw.board === undefined ? undefined : str(raw.board, `${what}: hand.board`);
  try {
    if (parseCards(hole).length !== 2) throw new Error('hole must be exactly two cards');
    const bn = board === undefined ? 0 : parseCards(board).length;
    if (bn !== 0 && (bn < 3 || bn > 5)) throw new Error('board must be 3 to 5 cards');
    parseCards(`${hole} ${board ?? ''}`); // also rejects a card in both hole and board
  } catch (e) {
    throw new Error(`${what}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  return board === undefined ? { hole } : { hole, board };
}

export function parseQuizzes(yamlText: string, lessonId: string, startIndex: number): Quiz[] {
  const raw: unknown = parseYaml(yamlText);
  const list: unknown[] = Array.isArray(raw) ? raw : [raw];
  return list.map((item, i) => {
    const n = startIndex + i + 1;
    const what = `quiz ${n}`;
    if (!isObj(item)) throw new Error(`${what}: entry must be a mapping`);
    const options = item.options ?? item.choices;
    if (!Array.isArray(options) || !options.every((x) => typeof x === 'string' && x.trim() !== ''))
      throw new Error(`${what}: options must be a list of non-empty strings`);
    if (options.length < 2) throw new Error(`${what}: needs at least 2 options`);
    if (new Set(options.map((o: string) => o.trim())).size !== options.length)
      throw new Error(`${what}: options must be distinct`);
    const answer = item.answer;
    if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= options.length)
      throw new Error(`${what}: answer must be a 0-based index into options (0..${options.length - 1})`);
    const prompt = str(item.q ?? item.prompt, `${what}: q`);
    const explanation = str(item.explain ?? item.explanation, `${what}: explain`);
    checkInline(prompt, `${what}: q`);
    options.forEach((o: string, k) => checkInline(o, `${what}: option ${k + 1}`));
    checkInline(explanation, `${what}: explain`);
    const quiz: Quiz = {
      id: typeof item.id === 'string' && item.id ? item.id : `${lessonId}-q${n}`,
      prompt,
      choices: options as string[],
      answer,
      explanation,
    };
    if (item.hand !== undefined) quiz.hand = parseHand(item.hand, what);
    return quiz;
  });
}

const CHART_VIEWS = ['preflop-grid', 'flop', 'river'] as const;

export function parseChart(yamlText: string): ChartBlockData {
  const raw: unknown = parseYaml(yamlText);
  if (!isObj(raw)) throw new Error('chart block must be a YAML mapping { strategy, view, highlight? }');
  const strategy = str(raw.strategy, 'chart: strategy');
  if (!(STRATEGY_IDS as readonly string[]).includes(strategy))
    throw new Error(`chart: unknown strategy "${strategy}" (known: ${STRATEGY_IDS.join(', ')})`);
  const view = str(raw.view, 'chart: view');
  if (!(CHART_VIEWS as readonly string[]).includes(view))
    throw new Error(`chart: unknown view "${view}" (known: ${CHART_VIEWS.join(', ')})`);
  const chart: ChartBlockData = {
    strategy: strategy as ChartBlockData['strategy'],
    view: view as ChartBlockData['view'],
  };
  if (raw.highlight !== undefined) {
    const h = raw.highlight;
    if (!Array.isArray(h) || !h.every((x) => typeof x === 'string'))
      throw new Error('chart: highlight must be a list of quoted strings, e.g. ["33", "AKs"]');
    const bad = (h).filter((c) => !isHandClass(c));
    if (bad.length) throw new Error(`chart: invalid hand classes in highlight: ${bad.join(', ')}`);
    chart.highlight = h;
  }
  return chart;
}

/** ```progressive YAML `{ meter? }`: the start meter in whole dollars (default 50,000). */
export function parseProgressive(yamlText: string): ProgressiveBlockData {
  const raw: unknown = yamlText.trim() ? parseYaml(yamlText) : {};
  if (!isObj(raw)) throw new Error('progressive block must be a YAML mapping { meter? }');
  const unknown = Object.keys(raw).filter((k) => k !== 'meter');
  if (unknown.length) throw new Error(`progressive: unknown key(s) ${unknown.join(', ')} (only meter)`);
  const meter = raw.meter ?? 50_000;
  if (
    typeof meter !== 'number' ||
    !Number.isInteger(meter) ||
    meter < PROGRESSIVE_METER_MIN ||
    meter > PROGRESSIVE_METER_MAX ||
    meter % PROGRESSIVE_METER_STEP !== 0
  )
    throw new Error(
      `progressive: meter must be a whole number of thousands from ${PROGRESSIVE_METER_MIN} to ${PROGRESSIVE_METER_MAX}`,
    );
  return { meter };
}

/** Text a scene shows at runtime must also have valid `{{cards}}`. */
function checkSceneText(scene: unknown): void {
  if (!isObj(scene) || !Array.isArray(scene.steps)) return;
  for (const step of scene.steps as unknown[]) {
    if (!isObj(step)) continue;
    for (const k of ['text', 'hint', 'math'] as const) {
      const v = step[k];
      if (typeof v === 'string') checkInline(v, `scene ${String(scene.id)} step ${String(step.id)} ${k}`);
    }
  }
}

/**
 * `{{num:<id>}}` -> the computed figure from the registry (I064), before anything else is parsed, so
 * it works in prose, tables, quizzes and scenes alike. An unknown id names the lesson line.
 */
export function expandNumbers(body: string, offset = 0, source = body): string {
  return body.replace(/\{\{num:([^}]*)\}\}/g, (m, id: string, at: number) => {
    const v = NUMBERS[id.trim()];
    if (v === undefined) {
      const line = source.slice(0, offset + at).split('\n').length;
      throw new Error(`line ${line}: unknown number token "${m}"`);
    }
    return v;
  });
}

/**
 * ```practise: 1-3 links at the end of a lesson (I066). Each `to` is a Drill category
 * (`/drill?category=<id>`) or a table preset (`/play?hole=..&board=..&dealer=..&street=..`) that must
 * parse exactly and use one of this lesson's own scene deals (checked in checkPractiseSpots).
 */
export function parsePractise(text: string): PractiseLink[] {
  const raw: unknown = parseYaml(text);
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3)
    throw new Error('practise block must be a YAML list of 1 to 3 { label, to } links');
  return raw.map((item, i) => {
    const what = `practise link ${i + 1}`;
    if (!isObj(item)) throw new Error(`${what} must be a mapping { label, to }`);
    const extra = Object.keys(item).filter((k) => k !== 'label' && k !== 'to');
    if (extra.length) throw new Error(`${what}: unknown key "${extra[0]}"`);
    const label = str(item.label, `${what} label`);
    const to = str(item.to, `${what} to`).replace(/^#/, '');
    const q = /^\/(play|drill)\?(.+)$/.exec(to);
    if (!q) throw new Error(`${what}: "${to}" must start with /play? or /drill?`);
    const query = new URLSearchParams(q[2]);
    if (q[1] === 'drill') {
      const keys = [...query.keys()];
      const cat = query.get('category');
      if (keys.length !== 1 || !cat) throw new Error(`${what}: a Drill link takes ?category= only`);
      if (!(DRILL_CATEGORY_IDS as readonly string[]).includes(cat))
        throw new Error(`${what}: unknown Drill category "${cat}"`);
    } else {
      const allowed = ['hole', 'board', 'dealer', 'street'];
      const bad = [...query.keys()].find((k) => !allowed.includes(k));
      if (bad) throw new Error(`${what}: unknown table preset key "${bad}"`);
      const keys = [...query.keys()];
      const dup = keys.find((k, i) => keys.indexOf(k) !== i);
      if (dup) throw new Error(`${what}: repeated table preset key "${dup}"`);
      // parsePlayParams ignores anything malformed; here that is an error (bad or repeated cards).
      const startAt = parsePlayParams(query).startAt;
      if (!startAt) throw new Error(`${what}: invalid table preset "${to}"`);
      const street = query.get('street');
      if (street !== null) {
        if (!['preflop', 'flop', 'river'].includes(street))
          throw new Error(`${what}: street must be preflop, flop or river, not "${street}"`);
        // The street must match the board, except a full deal (5 board cards) started preflop,
        // which replays a forced hand from the first decision (lesson 19).
        const n = (query.get('board') ?? '').length / 2;
        const natural = n === 0 ? 'preflop' : n === 3 ? 'flop' : 'river';
        if (street !== natural && !(street === 'preflop' && n === 5))
          throw new Error(`${what}: street "${street}" does not match a ${n}-card board`);
      }
    }
    return { label, to };
  });
}

/** Every table preset must replay one of the lesson's own scene deals (pinned spots, I066). */
function checkPractiseSpots(blocks: Block[]): void {
  const codes = (cs: readonly string[] | undefined) => (cs ?? []).map((c) => cardCode(parseCards(c)[0]!));
  const deals = blocks.flatMap((b) => {
    if (b.kind !== 'scene') return [];
    const sc: SceneConfig = b.scene;
    const all = [sc.startAt?.deal, ...(sc.deals ?? [])];
    for (const st of sc.steps ?? []) all.push(st.startAt?.deal, ...(st.deals ?? []));
    return all.flatMap((d) => (d ? [d] : []));
  });
  for (const b of blocks) {
    if (b.kind !== 'practise') continue;
    for (const l of b.links) {
      if (!l.to.startsWith('/play?')) continue;
      const deal = parsePlayParams(new URLSearchParams(l.to.slice('/play?'.length))).startAt!.deal;
      const board = [...(deal.flop ?? []), ...(deal.turn ? [deal.turn] : []), ...(deal.river ? [deal.river] : [])];
      const hit = deals.some((d) => {
        const dBoard = [...(d.flop ?? []), ...(d.turn ? [d.turn] : []), ...(d.river ? [d.river] : [])];
        return (
          codes(d.player).join() === codes(deal.player).join() &&
          codes(dBoard.slice(0, board.length)).join() === codes(board).join() &&
          (!deal.dealer || codes(d.dealer).join() === codes(deal.dealer).join())
        );
      });
      if (!hit) throw new Error(`practise link "${l.label}": ${l.to} is not one of this lesson's scene deals`);
    }
  }
}

type FenceLang = 'scene' | 'quiz' | 'chart' | 'progressive' | 'practise';
export type Seg =
  | { t: 'md'; text: string }
  | { t: 'fence'; lang: FenceLang; text: string }
  | { t: 'box'; kind: 'math' | 'tip'; title: string; text: string };

/** Split a lesson body into markdown / scene / quiz / chart / math / tip segments. */
export function segment(body: string): Seg[] {
  const lines = body.split(/\r?\n/);
  const segs: Seg[] = [];
  let md: string[] = [];
  const flush = () => {
    if (md.join('').trim()) segs.push({ t: 'md', text: md.join('\n') });
    md = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const fence = /^(`{3,})\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const [, ticks = '```', lang = ''] = fence;
      const end = findFenceEnd(lines, i + 1, ticks);
      if (
        lang === 'scene' ||
        lang === 'quiz' ||
        lang === 'chart' ||
        lang === 'progressive' ||
        lang === 'practise'
      ) {
        flush();
        segs.push({ t: 'fence', lang, text: lines.slice(i + 1, end).join('\n') });
      } else if (lang === 'math' || lang === 'callout' || lang === 'tip') {
        throw new Error(
          `unknown directive \`\`\`${lang} (use :::${lang === 'math' ? 'math Title' : 'tip'})`,
        );
      } else md.push(...lines.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    const box = /^:::\s*(math|tip)\b\s*(.*)$/.exec(line);
    if (box) {
      flush();
      const kind = box[1] as 'math' | 'tip';
      const inner: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const l = lines[i] ?? '';
        const f = /^(`{3,})/.exec(l);
        if (f) {
          const end = findFenceEnd(lines, i + 1, f[1] ?? '```');
          inner.push(...lines.slice(i, end + 1));
          i = end + 1;
          continue;
        }
        if (/^:::\s*$/.test(l)) {
          closed = true;
          i++;
          break;
        }
        inner.push(l);
        i++;
      }
      if (!closed) throw new Error(`unclosed :::${kind} container`);
      segs.push({ t: 'box', kind, title: (box[2] ?? '').trim(), text: inner.join('\n') });
      continue;
    }
    if (/^:::/.test(line)) throw new Error(`unknown or stray container: ${line}`);
    md.push(line);
    i++;
  }
  flush();
  return segs;
}

function findFenceEnd(lines: string[], from: number, ticks: string): number {
  for (let j = from; j < lines.length; j++) {
    if ((lines[j] ?? '').trim() === ticks) return j;
  }
  throw new Error(`unclosed code fence (${ticks})`);
}

/** Pure: lesson source → Lesson (minus chapterId). Throws with a clear message on any error. */
export function compileLesson(
  source: string,
  file: string,
  opts: CompileOptions = {},
): CompiledLesson {
  try {
    const { data, body: raw } = splitFrontMatter(source);
    const body = expandNumbers(raw, source.length - raw.length, source);
    const id = str(data.id, 'front matter id');
    const min = minHeadingDepth(body);
    const sources = parseLessonSources(data.sources, opts.sources);
    opts = {
      ...opts,
      headingShift: min <= 6 ? Math.max(0, min - 2) : 0,
      sourceCount: sources.length,
    };
    const blocks: Block[] = [];
    const quizIds = new Set<string>();
    let quizCount = 0;
    for (const seg of segment(body)) {
      if (seg.t === 'md') blocks.push({ kind: 'html', html: renderMarkdown(seg.text, opts) });
      else if (seg.t === 'box') {
        const html = renderMarkdown(seg.text, opts);
        if (seg.kind === 'tip') blocks.push({ kind: 'tip', html });
        else {
          if (!seg.title) throw new Error(':::math needs a title (":::math Title")');
          blocks.push({ kind: 'math', title: seg.title, html });
        }
      } else if (seg.lang === 'scene') {
        const json: unknown = parseYaml(seg.text);
        const res = validateScene(json);
        if (!res.ok) throw new Error(
            `invalid scene${isObj(json) && typeof json.id === 'string' ? ` "${json.id}"` : ''}: ${res.errors.join('; ')}`,
          );
        checkSceneText(json);
        blocks.push({ kind: 'scene', scene: res.scene });
      } else if (seg.lang === 'chart') {
        blocks.push({ kind: 'chart', chart: parseChart(seg.text) });
      } else if (seg.lang === 'practise') {
        blocks.push({ kind: 'practise', links: parsePractise(seg.text) });
      } else if (seg.lang === 'progressive') {
        blocks.push({ kind: 'progressive', progressive: parseProgressive(seg.text) });
      } else {
        const quizzes = parseQuizzes(seg.text, id, quizCount);
        quizCount += quizzes.length;
        for (const quiz of quizzes) {
          if (quizIds.has(quiz.id)) throw new Error(`duplicate quiz id "${quiz.id}"`);
          quizIds.add(quiz.id);
          blocks.push({ kind: 'quiz', quiz });
        }
      }
    }
    checkPractiseSpots(blocks);
    const sceneIds = blocks.flatMap((b) => (b.kind === 'scene' ? [b.scene.id] : []));
    const dupScene = sceneIds.find((s, k) => sceneIds.indexOf(s) !== k);
    if (dupScene) throw new Error(`duplicate scene id "${dupScene}"`);
    const minutes = data.minutes;
    if (typeof minutes !== 'number' || !(minutes > 0))
      throw new Error('front matter minutes must be a positive number');
    const chapter = data.chapter === undefined ? undefined : str(data.chapter, 'front matter chapter');
    return {
      id,
      title: str(data.title, 'front matter title'),
      summary: str(data.summary, 'front matter summary'),
      minutes,
      blocks,
      ...(sources.length ? { sources } : {}),
      ...(chapter ? { chapter } : {}),
    };
  } catch (e) {
    throw new Error(`${file}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}
