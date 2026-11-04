// Text helpers (costs); re-exported unchanged by ../text.ts (I082 split).
import { formatMoney } from '../../engine';
import { classWeight } from '../../math';
import type { DecisionOption, DecisionPreview, Fraction } from '../../math';
import { roundFraction, sub } from './format';

/** The best option of a preview (moved here from ./tiers so the two modules don't import each other). */
export function bestOf(preview: DecisionPreview): DecisionOption {
  return preview.options[preview.bestIndex]!;
}

// ---------- rounded costs (the figures on screen must add up) ----------

/** Whole cents: round(best.evCents) − round(option.evCents), so shown EVs and shown costs agree. */
export function costCents(best: DecisionOption, o: DecisionOption): number {
  return Number(roundFraction(best.evCents) - roundFraction(o.evCents));
}
/** "$14.08", or "<$0.01" when a real cost rounds to nothing. */
export function fmtCostC(cents: number): string {
  return cents <= 0 ? '<$0.01' : formatMoney(cents);
}
/** "−$14.08" or "−<$0.01". */
export function fmtVsBestC(cents: number): string {
  return `\u2212\u2060${fmtCostC(cents)}`;
}

/** The ante in cents, recovered from a preview (evCents / ev of any option with a non-zero EV). */
export function anteOf(p: DecisionPreview): number | null {
  const o = p.options.find((x) => x.ev.num !== 0n);
  if (!o) return null;
  return Number((o.evCents.num * o.ev.den) / (o.evCents.den * o.ev.num));
}

/**
 * curriculum 8.1.4, preflop only: what getting this exact hand wrong every time it comes up costs
 * per hour = handsPerHour x P(class) x regret x Ante, with P(class) = combos / 1326.
 */
export function wrongEveryTimePerHour(
  p: DecisionPreview,
  o: DecisionOption,
  handsPerHour: number,
): string | null {
  if (p.street !== 'preflop' || !p.handClass) return null;
  const best = bestOf(p);
  if (o === best || o.tier === 'best') return null;
  const regretCents = sub(best.evCents, o.evCents);
  const perHour: Fraction = {
    num: regretCents.num * BigInt(handsPerHour) * BigInt(classWeight(p.handClass)),
    den: regretCents.den * 1326n,
  };
  return formatMoney(Number(roundFraction(perHour)));
}
