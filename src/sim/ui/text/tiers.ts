// Text helpers (tiers); re-exported unchanged by ../text.ts (I082 split).
import { formatMoney } from '../../engine';
import type {
  DecisionOption,
  DecisionPreview,
  DecisionTier,
  Fraction,
  WagerTier,
} from '../../math';
import type { HandVerdict } from '../../scene';
import { costCents, fmtCostC } from './costs';
import { fmtCentsFraction, roundFraction, typographic } from './format';

// ---------- tiers ----------

export const DECISION_TIER_LABEL: Record<DecisionTier, string> = {
  best: 'Best play',
  close: 'Close',
  small: 'Small mistake',
  costly: 'Mistake',
  blunder: 'Big mistake',
};
export const WAGER_TIER_LABEL: Record<WagerTier, string> = {
  free: 'Free bet',
  good: 'Good bet',
  fair: 'Fair',
  poor: 'Poor bet',
  avoid: 'Sucker bet',
};
/** Short word for crowded places (action buttons). */
export const DECISION_TIER_SHORT: Record<DecisionTier, string> = {
  best: 'Best',
  close: 'Close',
  small: 'Small',
  costly: 'Mistake',
  blunder: 'Big mistake',
};

export function bestOf(preview: DecisionPreview): DecisionOption {
  return preview.options[preview.bestIndex]!;
}

/**
 * The skill-versus-luck line after a hand (I059). Every decision fine -> "Played it right" with
 * what the line expected against what the cards gave. A mistake is named (the costliest only,
 * once) unless the last decision was the costliest and was just described in words (the I080
 * narration, or the After-mode reveal): then the line carries only expected against result, so
 * the cost is never said twice.
 */
export function handVerdictText(v: HandVerdict, lastDescribed = false): string {
  const mistakes = v.decisions.filter((d) => d.tier !== 'best' && d.tier !== 'close');
  const worst = mistakes.reduce<HandVerdict['decisions'][number] | null>(
    (w, d) => (!w || compareFractions(d.costCents, w.costCents) > 0 ? d : w),
    null,
  );
  const e = Number(roundFraction(v.expectedCents));
  const figures = `Expected ${typographic(formatMoney(e, { sign: true }))}, result ${typographic(formatMoney(v.netCents, { sign: true }))}.`;
  if (!worst) return `Played it right. ${figures}`;
  if (lastDescribed && worst === v.decisions[v.decisions.length - 1]) return figures;
  const cost = fmtCostC(Number(roundFraction(worst.costCents)));
  return `Your ${worst.street} ${worst.label} cost ${cost} on average (${DECISION_TIER_LABEL[worst.tier]}).`;
}

const compareFractions = (a: Fraction, b: Fraction): number => {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
};

const TIER_PHRASE: Record<DecisionTier, string> = {
  best: 'best play',
  close: 'a close call',
  small: 'a small mistake',
  costly: 'a mistake',
  blunder: 'a big mistake',
};

/**
 * The sentence shown after a decision (I080). It leads with the tier and the cost against the best
 * option (the figure the EV sheet's "vs best" row shows) and labels the whole-hand EV, which is
 * negative even for the best play. Example: "Bet 4x: a mistake, costs $0.45 against Check. Whole-hand
 * expected result from here: -$5.62."
 */
export function narrationText(preview: DecisionPreview, index: number): string {
  const o = preview.options[index]!;
  const best = bestOf(preview);
  const lead =
    o.tier === 'best'
      ? `${o.label}: ${TIER_PHRASE.best}.`
      : `${o.label}: ${TIER_PHRASE[o.tier]}, costs ${fmtCostC(costCents(best, o))} against ${best.label}.`;
  return `${lead} Whole-hand expected result from here: ${typographic(fmtCentsFraction(o.evCents))}.`;
}

/** Spoken name of an action button: "Bet 4x, EV plus $5.21, best play". */
export function ariaForOption(o: DecisionOption): string {
  const money = fmtCentsFraction(o.evCents).replace('+', 'plus ').replace('-', 'minus ');
  return `${o.label}, EV ${money}, ${DECISION_TIER_LABEL[o.tier].toLowerCase()}`;
}
