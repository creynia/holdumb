import type { HandCategory, WagerId } from '../sim/engine/types';
import type { WagerTier } from '../sim/math/types';
import type { SceneConfig } from '../sim/scene/types';
import type { StrategyId } from '../sim/strategy/types';

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

export type Block =
  | { kind: 'html'; html: string } // marked output, trusted repo content
  | { kind: 'math'; title: string; html: string } // collapsible "Show the math"
  | { kind: 'tip'; html: string }
  | { kind: 'scene'; scene: SceneConfig }
  | { kind: 'chart'; chart: ChartBlockData }
  | { kind: 'quiz'; quiz: Quiz };

export interface Lesson {
  id: LessonId;
  title: string;
  summary: string;
  minutes: number;
  chapterId: ChapterId;
  blocks: Block[];
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

export interface ContentBundle {
  chapters: Chapter[];
  lessons: Lesson[];
  glossary: GlossaryEntry[];
  bets: Record<WagerId, BetCopy>;
  hands: Record<HandCategory, HandCopy>;
  strategy: Record<StrategyId, StrategyCopy>;
}
