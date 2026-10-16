// Preflop: hand classes and the precomputed exact table (simulator.md §2.7).
import { RANK_CHARS } from '../engine/types';
import type { BlindPaytableId, Card } from '../engine/types';
import { PREFLOP_BLIND_STANDARD } from './tables/preflop-blind-standard';
import type { PreflopTable } from './tables/preflop-blind-standard';

export const BOARDS = 2_118_760n; // C(50,5)
export const FLOPS = 19_600n; // C(50,3)
export const DEALER = 990n;
export const RUNOUTS_BIG = 1_081n;

/** 'AA', 'AKs', '72o': higher rank first. */
export function preflopClass(hole: readonly [Card, Card]): string {
  let r1 = hole[0] >> 2;
  let r2 = hole[1] >> 2;
  if (hole[0] === hole[1]) throw new Error('Duplicate hole card');
  if (r1 === r2) return `${RANK_CHARS[r1]}${RANK_CHARS[r2]}`;
  if (r1 < r2) [r1, r2] = [r2, r1];
  const suited = (hole[0] & 3) === (hole[1] & 3);
  return `${RANK_CHARS[r1]}${RANK_CHARS[r2]}${suited ? 's' : 'o'}`;
}

/** Combos of a class: 6 / 4 / 12 of the 1,326 starting hands. */
export function classWeight(name: string): number {
  return name.length === 2 ? 6 : name.endsWith('s') ? 4 : 12;
}

/** One decoded table row: raw integer sums (see tests/gen/precompute/strat.c for the units). */
export interface PreflopRow {
  name: string;
  weight: number;
  /** Showdown counts over 2,118,760 boards × 990 dealer hands (Bet 4x path). */
  sw: bigint;
  sl: bigint;
  wq: bigint;
  lq: bigint;
  /** Σ over winning showdowns of 2 × Blind multiple, by dealer qualifying. */
  bb2q: bigint;
  bb2nq: bigint;
  /** Check path, over 19,600 flops × 1,081 runouts × 990: Σ of the Bet-2x value on flops where
   *  2x is best, Σ of the Bet-1x value on river-play runouts of checked flops. */
  s2x: bigint;
  scp: bigint;
  /** Flops where Bet 2x is strictly best; river-fold runouts among checked flops. */
  f2: bigint;
  cf: bigint;
}

export const FOLD_UNITS = 3960n; // 4 half-antes × 990 dealer hands

/** Derived sums, all in half-antes. */
export function rowSums(r: PreflopRow): {
  SA: bigint;
  SP: bigint;
  SC: bigint;
  fc: bigint;
  cp: bigint;
} {
  const SP = 2n * (r.sw - r.sl);
  const SA = r.bb2q + r.bb2nq + 2n * r.wq - 2n * r.sl - 2n * r.lq;
  const fc = FLOPS - r.f2;
  const SC = r.s2x + r.scp - r.cf * FOLD_UNITS;
  return { SA, SP, SC, fc, cp: fc * RUNOUTS_BIG - r.cf };
}

const COLS = ['sw', 'sl', 'wq', 'lq', 'bb2q', 'bb2nq', 's2x', 'scp', 'f2', 'cf'] as const;

const decoded = new Map<string, Map<string, PreflopRow>>();

export function decodeTable(t: PreflopTable): Map<string, PreflopRow> {
  const hit = decoded.get(t.blindPaytable);
  if (hit) return hit;
  const map = new Map<string, PreflopRow>();
  for (const entry of t.rows.split(';')) {
    const [name, rest] = entry.split(':') as [string, string | undefined];
    if (map.has(name)) throw new Error(`Preflop table: duplicate class ${name}`);
    const vals = (rest ?? '').split(',').map((v) => BigInt(parseInt(v, 36)));
    if (vals.length !== COLS.length) {
      throw new Error(
        `Preflop table: class ${name} has ${vals.length} columns, need ${COLS.length}`,
      );
    }
    const row = { name, weight: classWeight(name) } as Record<string, unknown>;
    COLS.forEach((c, i) => (row[c] = vals[i]));
    map.set(name, row as unknown as PreflopRow);
  }
  if (map.size !== 169) throw new Error(`Preflop table: ${map.size} classes, need 169`);
  decoded.set(t.blindPaytable, map);
  return map;
}

export const PREFLOP_TABLES: Readonly<Record<BlindPaytableId, PreflopTable>> = {
  'blind-standard': PREFLOP_BLIND_STANDARD,
};

export function preflopRow(blind: BlindPaytableId, name: string): PreflopRow {
  const row = decodeTable(PREFLOP_TABLES[blind]).get(name);
  if (!row) throw new Error(`No preflop row for ${name}`);
  return row;
}
export function preflopClasses(blind: BlindPaytableId): string[] {
  return [...decodeTable(PREFLOP_TABLES[blind]).keys()];
}

/** The classic chart (D3 §3): 69 of 169 classes. 3x is never best. */
export function isChartHand(name: string): boolean {
  const hi = RANK_CHARS.indexOf(name.charAt(0));
  const lo = RANK_CHARS.indexOf(name.charAt(1));
  const suited = name.endsWith('s');
  const pair = name.length === 2;
  if (pair) return hi >= 1; // 33+
  const r = (c: string) => RANK_CHARS.indexOf(c);
  if (hi === r('A')) return true;
  if (hi === r('K')) return suited || lo >= r('5');
  if (hi === r('Q')) return suited ? lo >= r('6') : lo >= r('8');
  if (hi === r('J')) return suited ? lo >= r('8') : lo === r('T');
  return false;
}
