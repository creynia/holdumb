// Numbers for the answer pages (house-edge/, the strategy intro, Blind/Trips intros), all derived
// from the engine/math/strategy modules at build time. Nothing here is typed in by hand:
// tests/build/seo.test.ts pins the key values to the same modules.
import {
  DEFAULT_PAYTABLE_PRESET,
  PAYTABLE_PRESET_IDS,
  formatMoney,
  formatPct,
} from '../../src/sim/engine';
import type { HandCategory, PaytablePresetId } from '../../src/sim/engine';
import {
  DEALER_QUALIFY_PROBABILITY,
  GAME_EDGE,
  GAME_ELEMENT_OF_RISK,
  GAME_EXPECTED_WAGER,
  HANDS_PER_HOUR,
  SEVEN_CARD_COUNTS,
  SEVEN_CARD_TOTAL,
  tripsEdge,
} from '../../src/sim/math/edges';
import type { Fraction } from '../../src/sim/math/types';
import { STRATEGY_CONSTANTS, strategyChart, strategyMetrics } from '../../src/sim/strategy';
import type { StrategyId } from '../../src/sim/strategy';

export const RANKS = 'AKQJT98765432';
const RANK_NAME: Record<string, string> = {
  A: 'ace',
  K: 'king',
  Q: 'queen',
  J: 'jack',
  T: 'ten',
};

/** Hand kinds ('AKs', 'T9o', '77') a strategy bets 4x preflop. */
export function fourXSet(id: StrategyId): Set<string> {
  return new Set(
    strategyChart(id)
      .grid.flat()
      .filter((c) => c.action === '4x')
      .map((c) => c.cls),
  );
}

/** Starting-hand combos of a hand kind: 6 per pair, 4 suited, 12 offsuit (of 1,326). */
const combos = (cls: string) => (cls.length === 2 ? 6 : cls.endsWith('s') ? 4 : 12);
export const STARTING_COMBOS = 1326;
export const SEVEN_CARD_TOTAL_TEXT = SEVEN_CARD_TOTAL.toLocaleString('en-US');

/** Share of the 1,326 two-card starting hands that a strategy bets 4x. */
export function fourXShare(id: StrategyId): { combos: number; kinds: number; pct: string } {
  const set = fourXSet(id);
  const n = [...set].reduce((s, c) => s + combos(c), 0);
  return {
    combos: n,
    kinds: set.size,
    pct: formatPct({ num: BigInt(n), den: BigInt(STARTING_COMBOS) }, 0),
  };
}

/**
 * The 4x range in compact poker notation, read off the chart: 'pairs 33 and up, any ace, any
 * suited king, K5o+, Q6s+, …'. `Q6s+` means Q6s up to QJs.
 */
export function fourXRange(id: StrategyId): string[] {
  const set = fourXSet(id);
  const out: string[] = [];
  const pairs = [...RANKS].filter((r) => set.has(r + r));
  if (pairs.length) {
    const lowest = pairs[pairs.length - 1]!;
    const contiguous = pairs.length === RANKS.indexOf(lowest) + 1;
    out.push(
      pairs.length === RANKS.length
        ? 'any pair'
        : contiguous
          ? `pairs ${lowest}${lowest} and up`
          : `pairs ${pairs.map((r) => r + r).join(' ')}`,
    );
  }
  for (const [ri, r] of [...RANKS].entries()) {
    const kickers = [...RANKS].slice(ri + 1);
    if (!kickers.length) continue;
    const has = (k: string, s: 's' | 'o') => set.has(`${r}${k}${s}`);
    const all = (s: 's' | 'o') => kickers.every((k) => has(k, s));
    const name = RANK_NAME[r] ?? r;
    if (all('s') && all('o')) {
      out.push(`any ${name}`);
      continue;
    }
    const run = (s: 's' | 'o') => {
      const ks = kickers.filter((k) => has(k, s));
      return ks.join('') === kickers.slice(0, ks.length).join('') ? ks : null;
    };
    const rs = run('s');
    const ro = run('o');
    if (rs && ro && rs.length && rs.length === ro.length) {
      // the same top-down run suited and offsuit: 'Q8+' (any suits), or 'JT'
      const low = rs[rs.length - 1]!;
      out.push(`${r}${low}${rs.length > 1 ? '+' : ''}`);
      continue;
    }
    for (const s of ['s', 'o'] as const) {
      const ks = kickers.filter((k) => has(k, s));
      if (!ks.length) continue;
      if (ks.length === kickers.length) {
        out.push(`any ${s === 's' ? 'suited' : 'offsuit'} ${name}`);
        continue;
      }
      const low = ks[ks.length - 1]!;
      const top = ks.length === kickers.indexOf(low) + 1; // runs down from the top kicker
      if (top && ks.length > 1) out.push(`${r}${low}${s}+`);
      else out.push(...ks.map((k) => `${r}${k}${s}`));
    }
  }
  return out;
}

const listText = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
export const fourXRangeText = (id: StrategyId) => listText(fourXRange(id));

const pct = (f: Fraction, digits = 3) => formatPct(f, digits);
const neg = (f: Fraction): Fraction => ({ num: -f.num, den: f.den });
const toNum = (f: Fraction) => Number(f.num) / Number(f.den);

/** Strategies priced on the house-edge page, best first (expert and river-leak are internal). */
export const PRICED: readonly StrategyId[] = [
  'perfect',
  'basic',
  'simple',
  'check-to-river',
  'never-fold',
  'always-max',
];

export interface StrategyRow {
  id: StrategyId;
  edge: Fraction;
  edgePct: string;
  eorPct: string;
  /** average antes in action per hand */
  wager: string;
  /** expected loss per hour at a $10 Ante, HANDS_PER_HOUR hands, e.g. '$6.55' */
  perHour10: string;
}

export const EXAMPLE_ANTE_CENTS = 1000;

export function strategyRows(): StrategyRow[] {
  return PRICED.map((id) => {
    const m = strategyMetrics({ id, ante: EXAMPLE_ANTE_CENTS, trips: 0 });
    return {
      id,
      edge: m.edgePerAnte,
      edgePct: pct(m.edgePerAnte),
      eorPct: pct(m.elementOfRisk),
      wager: toNum(STRATEGY_CONSTANTS[id].wager).toFixed(2),
      perHour10: formatMoney(toNum(neg(m.evPerHourCents))),
    };
  });
}

export interface TripsRow {
  id: PaytablePresetId;
  edge: Fraction;
  edgePct: string;
  isDefault: boolean;
}

/** Trips presets, cheapest first. */
export function tripsRows(): TripsRow[] {
  return PAYTABLE_PRESET_IDS.map((id) => {
    const e = tripsEdge(id).edge;
    return { id, edge: e, edgePct: pct(e), isDefault: id === DEFAULT_PAYTABLE_PRESET };
  }).sort((a, b) => toNum(a.edge) - toNum(b.edge));
}

/** Probability of each final 7-card hand (the player's best five of seven), best hand first. */
export function handOdds(): { category: HandCategory; pct: string; oneIn: string }[] {
  return (Object.keys(SEVEN_CARD_COUNTS) as HandCategory[]).map((category) => {
    const n = SEVEN_CARD_COUNTS[category];
    const p = { num: n, den: SEVEN_CARD_TOTAL };
    const inv = Number(SEVEN_CARD_TOTAL) / Number(n);
    return {
      category,
      pct: pct(p, 3),
      oneIn: inv < 10 ? inv.toFixed(1) : Math.round(inv).toLocaleString('en-US'),
    };
  });
}

/** The headline figures for perfect play (Trips excluded). */
export function headline() {
  return {
    edgePct: pct(GAME_EDGE),
    perInitialPct: pct({ num: GAME_EDGE.num, den: GAME_EDGE.den * 2n }),
    eorPct: pct(GAME_ELEMENT_OF_RISK),
    wager: toNum(GAME_EXPECTED_WAGER).toFixed(2),
    qualifyPct: pct(DEALER_QUALIFY_PROBABILITY, 1),
    handsPerHour: HANDS_PER_HOUR,
    perHour10: formatMoney(toNum(GAME_EDGE) * HANDS_PER_HOUR * EXAMPLE_ANTE_CENTS),
  };
}
