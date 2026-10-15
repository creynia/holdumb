// Hand classes ('AKs', '72o', 'TT') and the shared card helpers for strategies and drill.
import { RANK_CHARS } from '../engine/types';
import type { Card, Rank } from '../engine/types';

export const rankOfCard = (c: Card): Rank => (c >> 2) as Rank;
export const suitOfCard = (c: Card): number => c & 3;

/** 'AKs', 'T9o', 'QQ': high rank first. */
export function handClass(hole: readonly [Card, Card]): string {
  const r0 = hole[0] >> 2;
  const r1 = hole[1] >> 2;
  const hi = Math.max(r0, r1);
  const lo = Math.min(r0, r1);
  const h = RANK_CHARS.charAt(hi);
  const l = RANK_CHARS.charAt(lo);
  if (hi === lo) return h + l;
  return h + l + ((hole[0] & 3) === (hole[1] & 3) ? 's' : 'o');
}

/** Parses a class id into its parts; throws on garbage. */
export function parseClass(cls: string): { hi: Rank; lo: Rank; suited: boolean; pair: boolean } {
  const hi = RANK_CHARS.indexOf(cls.charAt(0));
  const lo = RANK_CHARS.indexOf(cls.charAt(1));
  const t = cls.charAt(2);
  if (
    hi < 0 ||
    lo < 0 ||
    hi < lo ||
    cls.length > 3 ||
    (hi === lo ? t !== '' : t !== 's' && t !== 'o')
  )
    throw new Error(`Bad hand class "${cls}"`);
  return { hi: hi as Rank, lo: lo as Rank, suited: t === 's', pair: hi === lo };
}

/** All 169 classes: pairs high to low, then by high rank, low rank, suited before offsuit. */
export const ALL_CLASSES: readonly string[] = (() => {
  const out: string[] = [];
  for (let hi = 12; hi >= 0; hi--)
    for (let lo = hi; lo >= 0; lo--) {
      const h = RANK_CHARS.charAt(hi);
      const l = RANK_CHARS.charAt(lo);
      if (hi === lo) out.push(h + l);
      else out.push(`${h}${l}s`, `${h}${l}o`);
    }
  return out;
})();

/** Number of two-card combos in a class (6 / 4 / 12). */
export function classWeight(cls: string): number {
  const p = parseClass(cls);
  return p.pair ? 6 : p.suited ? 4 : 12;
}

/** A representative hole (pair: s,h; suited: s,s; offsuit: s,h) for a class. */
export function classRep(cls: string): [Card, Card] {
  const { hi, lo, suited, pair } = parseClass(cls);
  if (pair) return [hi * 4, hi * 4 + 1];
  return [hi * 4, lo * 4 + (suited ? 0 : 1)];
}
