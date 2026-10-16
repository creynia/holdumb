import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileLesson, renderMarkdown } from './compile';
import type { CompiledLesson } from './compile';
import type {
  BetCopy,
  Chapter,
  ContentBundle,
  GlossaryEntry,
  HandCopy,
  Lesson,
  StrategyCopy,
} from './types';
import type { WagerId } from '../sim/engine';
import type { StrategyId } from '../sim/strategy';

interface RawGlossary {
  term: string;
  slug?: string;
  definition: string;
  see?: string[];
  seeAlso?: string;
  lessonId?: string;
}

export const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Source entries may omit `slug` (derived from the term) and use `seeAlso: lessonId`. */
export function normalizeGlossary(g: RawGlossary): GlossaryEntry {
  const { seeAlso, slug, lessonId, ...rest } = g;
  const lid = lessonId ?? seeAlso;
  return { ...rest, slug: slug ?? slugify(g.term), ...(lid ? { lessonId: lid } : {}) };
}

/** bets.json may be a record keyed by wager id, or an array of `{ id, ...copy }` entries. */
export function normalizeBets(raw: unknown): Record<string, BetCopy> {
  if (!Array.isArray(raw)) return raw as Record<string, BetCopy>;
  const out: Record<string, BetCopy> = {};
  for (const e of raw as ({ id: string } & BetCopy)[]) {
    const { id, ...copy } = e;
    out[id] = copy;
  }
  return out;
}

/** Raw (uncompiled) source files, exposed so content tests can check them directly. */
export interface ContentSources {
  chapters: Chapter[];
  glossary: GlossaryEntry[];
  bets: Record<string, BetCopy>;
  hands: Record<string, HandCopy>;
  strategy: Record<string, StrategyCopy>;
  samplesActive: boolean;
  lessonFiles: { file: string; slug: string; source: string }[];
}

/**
 * Reads content/. Real files (chapters.json, glossary.json, bets.json, hands.json, strategy.json,
 * lessons/NN-id.md) are owned by the lesson authors. A missing JSON file falls back to its
 * `_sample-*` placeholder, and `_sample-*.md` lessons are part of the bundle only while
 * chapters.json is missing (`samplesActive`). Tests can read them with `includeSamples`.
 */
export function readSources(root: string, includeSamples = false): ContentSources {
  const dir = join(root, 'content');
  const has = (name: string) => existsSync(join(dir, name));
  const json = <T>(name: string, fallbackName: string, fallback: T): T => {
    const f = has(name) ? name : has(fallbackName) ? fallbackName : null;
    return f ? (JSON.parse(readFileSync(join(dir, f), 'utf8')) as T) : fallback;
  };
  const samplesActive = !has('chapters.json');
  const lessonDir = join(dir, 'lessons');
  const files = existsSync(lessonDir)
    ? readdirSync(lessonDir)
        .filter((f) => f.endsWith('.md') && (!f.startsWith('_') || samplesActive || includeSamples))
        .sort()
    : [];
  return {
    chapters: json<Chapter[]>('chapters.json', '_sample-chapters.json', []),
    glossary: json<RawGlossary[]>('glossary.json', '_sample-glossary.json', []).map(
      normalizeGlossary,
    ),
    bets: normalizeBets(json<unknown>('bets.json', '_sample-bets.json', {})),
    hands: json<Record<string, HandCopy>>('hands.json', '_sample-hands.json', {}),
    strategy: json<Record<string, StrategyCopy>>('strategy.json', '_sample-strategy.json', {}),
    samplesActive,
    lessonFiles: files.map((f) => ({
      file: f,
      slug: f.replace(/^(\d+-|_sample-)/, '').replace(/\.md$/, ''),
      source: readFileSync(join(lessonDir, f), 'utf8'),
    })),
  };
}

export function buildContent(root: string): ContentBundle {
  const src = readSources(root);
  const glossarySlugs = new Set(src.glossary.map((g) => g.slug));
  const glossaryTerms = new Map(src.glossary.map((g) => [g.term.toLowerCase(), g.slug] as const));
  const opts = { glossarySlugs, glossaryTerms };
  const compiled = new Map<string, CompiledLesson>();
  for (const f of src.lessonFiles) {
    const file = `content/lessons/${f.file}`;
    const l = compileLesson(f.source, file, opts);
    const want = f.file.startsWith('_sample-') ? `sample-${f.slug}` : f.slug;
    if (l.id !== want) throw new Error(`${file}: front matter id "${l.id}" must equal "${want}"`);
    if (compiled.has(l.id)) throw new Error(`${file}: duplicate lesson id "${l.id}"`);
    compiled.set(l.id, l);
  }
  const lessons: Lesson[] = [];
  const placed = new Set<string>();
  for (const ch of src.chapters)
    for (const id of ch.lessons) {
      const l = compiled.get(id);
      if (!l) throw new Error(`chapters.json: chapter ${ch.id} references missing lesson ${id}`);
      if (placed.has(id)) throw new Error(`chapters.json: lesson ${id} is listed in two chapters`);
      if (l.chapter !== undefined && l.chapter !== ch.id)
        throw new Error(
          `lesson ${id}: front matter chapter "${l.chapter}" but chapters.json lists it in "${ch.id}"`,
        );
      placed.add(id);
      const { chapter: _chapter, ...rest } = l;
      lessons.push({ ...rest, chapterId: ch.id });
    }
  const unlisted = [...compiled.keys()].filter((id) => !placed.has(id));
  if (unlisted.length && !src.samplesActive)
    throw new Error(`lessons not listed in chapters.json: ${unlisted.join(', ')}`);
  const glossary = src.glossary.map((g) => ({
    ...g,
    definition: renderMarkdown(g.definition, opts),
  }));
  const bets = Object.fromEntries(
    Object.entries(src.bets).map(([k, v]) => [
      k,
      { ...v, howItWorks: renderMarkdown(v.howItWorks, opts) },
    ]),
  ) as Record<WagerId, BetCopy>;
  const strategy = Object.fromEntries(
    Object.entries(src.strategy).map(([k, v]) => [
      k,
      { ...v, rules: v.rules.map((r) => renderMarkdown(r, opts)) },
    ]),
  ) as Record<StrategyId, StrategyCopy>;
  return {
    chapters: src.chapters,
    lessons,
    glossary,
    bets,
    hands: src.hands,
    strategy,
  };
}
