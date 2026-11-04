import type { HandCategory, WagerId } from '../sim/engine/types';
import type { WagerTier } from '../sim/math/types';
import type { SceneConfig } from '../sim/scene/types';
import type { DrillCategoryId, StrategyId } from '../sim/strategy/types';

export type LessonId = string;
export type ChapterId = string;

/** Wager edge tiers (decisions.md D24): free <= 0, good <= 2%, fair <= 5%, poor < 9%, avoid >= 9%. */
export type Tier = WagerTier;
export const TIERS: readonly Tier[] = ['free', 'good', 'fair', 'poor', 'avoid'];
export const TIER_LABEL: Record<Tier, string> = {
  free: 'Free bet',
  good: 'Good bet',
  fair: 'Fair',
  poor: 'Poor bet',
  avoid: 'Avoid',
};

export interface QuizHand {
  hole: string; // 'As 7d'
  board?: string; // 'Ah 9c 2s'
}
export interface Quiz {
  /** `<lessonId>-q<n>` (1-based) unless the author gave one */
  id: string;
  prompt: string;
  choices: string[];
  /** index into `choices` (0-based) */
  answer: number;
  explanation: string;
  hand?: QuizHand;
}

export interface ChartBlockData {
  strategy: StrategyId;
  view: 'preflop-grid' | 'flop' | 'river';
  highlight?: string[]; // 'AKs', 'T9o', '77'
}

/** I063: the progressive jackpot calculator (lesson 20). `meter` is the slider's start, whole dollars. */
export interface ProgressiveBlockData {
  meter: number;
}

export type Block =
  | { kind: 'html'; html: string } // marked output, trusted repo content
  | { kind: 'math'; title: string; html: string } // collapsible "Show the math"
  | { kind: 'tip'; html: string }
  | { kind: 'scene'; scene: SceneConfig }
  | { kind: 'chart'; chart: ChartBlockData }
  | { kind: 'progressive'; progressive: ProgressiveBlockData }
  | { kind: 'quiz'; quiz: Quiz }
  | { kind: 'practise'; links: PractiseLink[] };

/** A "Practise this" link (I066): a Drill category or a preset table spot from the lesson. */
export interface PractiseLink {
  label: string;
  /** In-app route, e.g. '/drill?category=flop-board-pair' or '/play?hole=Qc7d&board=KdJh9s5c2d'. */
  to: string;
}

/** One entry of content/sources.json (shown on #/sources and cited by lessons). */
export interface SourceItem {
  id: string;
  title: string;
  author?: string;
  url?: string;
  note?: string;
}
export interface SourceGroup {
  group: string;
  items: SourceItem[];
}
/** A source as a lesson cites it (resolved from `sources:` front matter). */
export type LessonSource = Omit<SourceItem, 'id'> & { id?: string };

export interface Lesson {
  id: LessonId;
  title: string;
  summary: string;
  minutes: number;
  chapterId: ChapterId;
  blocks: Block[];
  /** cited sources, in `[^n]` order (1-based); absent when the lesson cites none */
  sources?: LessonSource[];
}

export interface Chapter {
  id: ChapterId;
  title: string;
  summary: string;
  lessons: LessonId[];
}

/** Source form (content/glossary.json) has markdown; the compiled bundle holds HTML. */
export interface GlossaryEntry {
  term: string;
  slug: string;
  definition: string; // markdown in source, HTML in the bundle
  see?: string[];
  /** lesson that teaches the term (source field `seeAlso`) */
  lessonId?: LessonId;
}

/** Copy for a wager (content/bets.json). Numbers come from the engine and math, never from here. */
export interface BetCopy {
  name?: string;
  tip?: string;
  summary: string;
  howItWorks: string; // markdown in source, HTML in the bundle
  verdict?: Tier;
  lessonId?: LessonId;
}

/** content/hands.json */
export interface HandCopy {
  name: string;
  example: string; // 'As Ks Qs Js Ts'
  summary: string;
}

/** content/strategy.json */
export interface StrategyCopy {
  title: string;
  summary: string;
  rules: string[]; // markdown in source, HTML in the bundle
}

/** content/drill.json: the grading reminder per Drill category (curriculum.md 9.2). `{outs}` is filled in. */
export type DrillReminders = Partial<Record<DrillCategoryId, string>>;

/** content/skills.json: a skill Learn tracks from Drill accuracy (I069). */
export interface Skill {
  id: string;
  title: string;
  /** The lesson to revisit when the skill needs work. */
  lessonId: string;
  /** The Drill categories whose answers make up the skill. */
  categories: DrillCategoryId[];
}

export interface ContentBundle {
  chapters: Chapter[];
  lessons: Lesson[];
  glossary: GlossaryEntry[];
  bets: Record<WagerId, BetCopy>;
  hands: Record<HandCategory, HandCopy>;
  strategy: Record<StrategyId, StrategyCopy>;
  drill: DrillReminders;
  skills: Skill[];
  sources: SourceGroup[];
}
