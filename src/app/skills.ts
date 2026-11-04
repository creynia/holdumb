// Skill mastery from Drill accuracy (I069): the last 20 answers in a skill's categories.
import type { DrillCategoryId } from '../sim/strategy';
import type { Skill } from '../content/types';
import type { LensStats } from './storage';

export const SKILL_WINDOW = 20;
/** Fewer answers than this and a skill has not started. */
export const MIN_SKILL_ANSWERS = 5;
/** At or above this share of the window a skill is solid. */
export const SOLID_AT = 0.8;

export type SkillStatus = 'not-started' | 'practising' | 'solid';

export interface SkillRow {
  skill: Skill;
  status: SkillStatus;
  /** Answers in the window (at most 20). */
  answers: number;
  /** Share correct in the window, or null before the skill has started. */
  accuracy: number | null;
  /** The category to open in Drill: the weakest one with answers, else the first. */
  drillCategory: DrillCategoryId;
}

export const STATUS_WORD: Record<SkillStatus, string> = {
  'not-started': 'Not started',
  practising: 'Practising',
  solid: 'Solid',
};

/**
 * The window is the last 20 answers (newest by when they were recorded) whose category belongs to
 * the skill. A record from before answers were logged has only per-category totals: those stand in
 * for the window until fresh answers replace them.
 */
export function skillRow(skill: Skill, d: LensStats): SkillRow {
  const mine = new Set<string>(skill.categories);
  const log = d.recent.filter((x) => mine.has(x.slice(0, -2)));
  const win = log.slice(-SKILL_WINDOW);
  let answers = win.length;
  let correct = win.filter((x) => x.endsWith(':1')).length;
  if (answers < SKILL_WINDOW) {
    // Legacy totals fill the rest of an unfilled window only when nothing was logged for them.
    const logged = new Map<string, number>();
    for (const x of log) logged.set(x.slice(0, -2), (logged.get(x.slice(0, -2)) ?? 0) + 1);
    for (const id of skill.categories) {
      const t = d.byCategory[id];
      if (!t || (logged.get(id) ?? 0) >= t.answered) continue;
      const missing = t.answered - (logged.get(id) ?? 0);
      const room = SKILL_WINDOW - answers;
      if (room <= 0) break;
      const take = Math.min(missing, room);
      answers += take;
      correct += Math.round((take * t.correct) / t.answered);
    }
  }
  const accuracy = answers >= MIN_SKILL_ANSWERS ? correct / answers : null;
  const status: SkillStatus =
    accuracy === null ? 'not-started' : accuracy >= SOLID_AT ? 'solid' : 'practising';
  // The weakest category by its own window share; unanswered categories are not weak.
  let weakest = skill.categories[0]!;
  let worst = 2;
  for (const id of skill.categories) {
    const own = win.filter((x) => x.slice(0, -2) === id);
    const t = d.byCategory[id];
    const n = own.length || t?.answered || 0;
    if (!n) continue;
    const share = own.length
      ? own.filter((x) => x.endsWith(':1')).length / own.length
      : t!.correct / t!.answered;
    if (share < worst) {
      worst = share;
      weakest = id;
    }
  }
  return { skill, status, answers, accuracy, drillCategory: weakest };
}
