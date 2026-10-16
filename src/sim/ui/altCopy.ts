// Better-alternative copy (curriculum.md 8.4), keyed by math's `betterAlternative(...).copyKey`.
import { formatMoney } from '../engine';
import type { BetterAlternative } from '../math';
import type { DecisionPreview } from '../math';
import {
  OPTION_LABELS,
  roundFraction,
  anteOf,
  bestOf,
  costCents,
  fmtCentsFraction,
  fmtCostC,
  optionKeyOf,
} from './text';

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
    const rule = OPTION_LABELS[optionKeyOf(alt.basicException.ruleAction)];
    out = {
      ...out,
      text: `${out.text} (The basic card says ${rule} here, a rare exception worth ${cost}.)`,
    };
  }
  return out;
}

/** Average loss of an option in cents (positive when it loses money). */
function costOf(o: DecisionPreview['options'][number]): number {
  return -Number(roundFraction(o.evCents));
}
