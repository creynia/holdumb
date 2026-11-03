// Drill category labels (curriculum.md §9.1) and the stats helpers behind the picker (I016).
import { DRILL_CATEGORY_IDS, DRILL_STREET_OF } from '../sim/strategy';
import type { DrillCategoryId } from '../sim/strategy';
import type { DrillStats, DrillStreet } from './storage';

export const DRILL_CATEGORY_LABELS: Readonly<Record<DrillCategoryId, string>> = {
  'pre-premium': 'Premium hands',
  'pre-ace': 'Weak aces',
  'pre-king': 'Kings, no help',
  'pre-queen-jack': 'Queens and jacks',
  'pre-small-pair': 'Small pairs',
  'pre-low': 'Low cards',
  'flop-hidden-pair': 'Flop hidden pairs',
  'flop-two-pair-plus': 'Flop two pair or better',
  'flop-board-pair': 'Flop board pairs',
  'flop-flush-draw': 'Flop flush draws',
  'flop-straight-draw': 'Flop straight draws',
  'flop-nothing': 'Flop nothing',
  'flop-deuces': 'Flop pocket deuces',
  'river-hidden-pair': 'River hidden pairs',
  'river-outs-low': 'River few outs',
  'river-outs-edge': 'River edge outs',
  'river-outs-high': 'River many outs',
  'river-board-plays': 'River board plays',
};

export const isCategoryId = (x: string | null): x is DrillCategoryId =>
  x !== null && (DRILL_CATEGORY_IDS as readonly string[]).includes(x);

export const categoriesOf = (street: DrillStreet): DrillCategoryId[] =>
  DRILL_CATEGORY_IDS.filter((c) => DRILL_STREET_OF[c] === street);

export const MIN_WEAKEST_ANSWERS = 5;

/** Lowest-accuracy category with at least 5 answers (ties: more answers, then list order). */
export function weakestCategory(
  d: DrillStats,
): { id: DrillCategoryId; pct: number; answered: number } | null {
  let best: { id: DrillCategoryId; correct: number; answered: number } | null = null;
  for (const id of DRILL_CATEGORY_IDS) {
    const v = d.byCategory[id];
    if (!v || v.answered < MIN_WEAKEST_ANSWERS) continue;
    // exact comparison v.correct/v.answered < best.correct/best.answered
    const lhs = v.correct * (best?.answered ?? 1);
    const rhs = (best?.correct ?? 0) * v.answered;
    if (!best || lhs < rhs || (lhs === rhs && v.answered > best.answered))
      best = { id, correct: v.correct, answered: v.answered };
  }
  return (
    best && {
      id: best.id,
      pct: Math.round((100 * best.correct) / best.answered),
      answered: best.answered,
    }
  );
}
