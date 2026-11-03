// Better-alternative copy (curriculum.md 8.4), keyed by math's `betterAlternative(...).copyKey`.
import { formatMoney } from '../engine';
import type { BasicFlopRule, BetterAlternative, MadeHand } from '../math';
import type { DecisionPreview } from '../math';
import { roundFraction, anteOf, bestOf, costCents, fmtCentsFraction, fmtCostC } from './text';

const FLOP_REASON: Record<string, string> = {
  'board-pair': 'The only pair is on the board.',
  'straight-draw': 'A straight draw is not enough.',
  'flush-draw': 'A weak flush draw is not enough.',
  nothing: 'You have nothing yet.',
};

/** `lead` is shown bold ("Bet 4x instead:"), `text` follows. */
export function alternativeCopy(
  alt: BetterAlternative,
  preview: DecisionPreview,
): { lead: string; text: string } {
  const best = bestOf(preview);
  const chosen = preview.options[alt.chosenIndex]!;
  const v = alt.vars;
  const ante = anteOf(preview);
  const fold = ante === null ? 'the Ante and Blind' : formatMoney(2 * ante);
  const cost = fmtCostC(costCents(best, chosen));
  const bestLabel = best.label;
  let out: { lead: string; text: string };
  switch (alt.copyKey) {
    case 'pre-check-chart-hand':
      out = {
        lead: `${bestLabel} instead:`,
        text: `${v.hand} is a 4x hand. ${fmtCentsFraction(best.evCents)} vs ${fmtCentsFraction(chosen.evCents)}.`,
      };
      break;
    case 'pre-4x-non-chart':
      out = {
        lead: `${bestLabel} instead:`,
        text: `${v.hand} isn't strong enough. 4x loses ${cost} more on average.`,
      };
      break;
    case 'pre-3x':
      out = {
        lead: `${bestLabel} instead.`,
        text: "3x is never the best play: EV grows in a straight line with your bet, so it's 4x or nothing.",
      };
      break;
    case 'flop-check-hidden':
      out = {
        lead: `${bestLabel}:`,
        text: v.pairRank
          ? `your ${v.pairRank}s pair the board. You're ahead of most dealer hands.`
          : "your hole cards pair the board. You're ahead of most dealer hands.",
      };
      break;
    case 'flop-check-made':
      out = {
        lead: `${bestLabel}:`,
        text: `you already have a ${(v.made ?? 'made hand').replace('-', ' ')}. Raise while you are ahead.`,
      };
      break;
    case 'flop-2x-no-hand':
      out = {
        lead: `${bestLabel} and see the river.`,
        text: v.flopReason ? FLOP_REASON[v.flopReason]! : 'Nothing here is strong enough yet.',
      };
      break;
    case 'river-fold-hidden':
      out = {
        lead: `${bestLabel}:`,
        text: `a hidden pair beats every dealer hand that missed. Folding costs exactly ${fold}.`,
      };
      break;
    case 'river-fold-low-outs':
      out = {
        lead: `${bestLabel}:`,
        text: `only ${v.outs} cards beat you. You need to win just 1 time in 5 to beat folding.`,
      };
      break;
    case 'river-fold-board-plays':
      out = {
        lead: `${bestLabel}:`,
        text: `the board is your hand and the dealer's. It's usually a tie, and folding costs ${fold}.`,
      };
      break;
    case 'river-1x-high-outs':
      out = {
        lead: `${bestLabel}:`,
        text: `${v.outs} cards beat you. Folding costs ${fold}; playing costs ${fmtCostC(Math.max(0, costOf(chosen)))} on average.`,
      };
      break;
    default:
      out = {
        lead: `${bestLabel} instead:`,
        text: `${fmtCentsFraction(best.evCents)} against ${fmtCentsFraction(chosen.evCents)}. You keep ${cost} more per hand on average.`,
      };
  }
  if (alt.basicException) {
    out = {
      ...out,
      text: `${out.text} (This is a rare exception, worth ${cost}.)`,
    };
  }
  return out;
}

/** Average loss of an option in cents (positive when it loses money). */
function costOf(o: DecisionPreview['options'][number]): number {
  return -Number(roundFraction(o.evCents));
}

const RANK_PLURAL: Record<string, string> = {
  '2': 'deuces',
  '3': 'threes',
  '4': 'fours',
  '5': 'fives',
  '6': 'sixes',
  '7': 'sevens',
  '8': 'eights',
  '9': 'nines',
  T: 'tens',
  J: 'jacks',
  Q: 'queens',
  K: 'kings',
  A: 'aces',
};
const MADE_NAME: Record<MadeHand, string> = {
  'two-pair': 'two pair',
  trips: 'three of a kind',
  straight: 'a straight',
  flush: 'a flush',
  'full-house': 'a full house',
  quads: 'four of a kind',
  'straight-flush': 'a straight flush',
};
/**
 * One line for the flop EV sheet (I058): which basic-card rule fires and whether perfect play
 * agrees, e.g. "Basic card: rule (b), a hidden pair of kings: Bet 2x. Perfect play agrees."
 * The disagreement wording is curriculum 8.4's; the cost uses the sheet's rounding.
 */
export function flopRuleLine(rule: BasicFlopRule, preview: DecisionPreview): string {
  const best = bestOf(preview);
  const ruleLabel = rule.raise ? 'Bet 2x' : 'Check';
  // No rule fits: the line says so and that the basic card checks.
  let first: string;
  if (rule.rule === null) first = 'Basic card: no rule fits; Check.';
  else {
    let head: string;
    if (rule.rule === 'a')
      head = `rule (a), ${rule.made ? MADE_NAME[rule.made] : 'two pair or better'}`;
    else if (rule.rule === 'b') {
      const ranks = RANK_PLURAL[rule.pairRank ?? ''] ?? 'cards';
      head = `rule (b), ${rule.pocketPair ? 'a pocket pair' : 'a hidden pair'} of ${ranks}`;
    } else head = 'rule (c), four to a flush with a ten or better';
    first = `Basic card: ${head}: ${ruleLabel}.`;
  }
  if (rule.raise === (best.action.type === 'play')) return `${first} Perfect play agrees.`;
  const ruleOpt = preview.options.find(
    (o) => (o.action.type === 'play') === rule.raise && o.action.type !== 'fold',
  );
  const worth = ruleOpt ? fmtCostC(costCents(best, ruleOpt)) : fmtCostC(0);
  return `${first} Perfect play prefers ${best.label}. (This is a rare exception, worth ${worth}.)`;
}
