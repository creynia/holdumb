import './sim.css';
import { useState } from 'preact/hooks';
import type { StrategyId } from '../strategy/types';

/** Rank characters high to low, as the chart's rows and columns run. */
const RANKS = 'AKQJT98765432';
const rankIdx = (c: string) => RANKS.indexOf(c);

/** All 169 starting-hand classes keyed 'AA', 'AKs', 'AKo'. */
export function chartClasses(): string[] {
  const out: string[] = [];
  for (const r of RANKS) for (const c of RANKS) out.push(cellClass(r, c));
  return out;
}
/** Row r, column c: pairs on the diagonal, suited above it, offsuit below. */
function cellClass(row: string, col: string): string {
  if (row === col) return row + col;
  return rankIdx(row) < rankIdx(col) ? `${row}${col}s` : `${col}${row}o`;
}

const hi = (cls: string) => rankIdx(cls[0]!);
const lo = (cls: string) => rankIdx(cls[1]!);
const isPair = (c: string) => c[0] === c[1];
const suited = (c: string) => c.endsWith('s');
/** 'K5o+': the class's high rank is fixed, the low rank is at least `min`. */
const atLeast = (c: string, high: string, min: string, kind: 'any' | 's' | 'o') =>
  !isPair(c) &&
  c[0] === high &&
  lo(c) <= rankIdx(min) &&
  (kind === 'any' || (kind === 's' ? suited(c) : !suited(c)));

/** decisions.md section 3: perfect = expert = basic preflop (69 of 169 classes). */
function isPerfect4x(c: string): boolean {
  if (isPair(c)) return hi(c) <= rankIdx('3');
  if (c[0] === 'A') return true;
  if (c[0] === 'K') return suited(c) || atLeast(c, 'K', '5', 'o');
  if (c[0] === 'Q') return atLeast(c, 'Q', '6', 's') || atLeast(c, 'Q', '8', 'o');
  if (c[0] === 'J') return atLeast(c, 'J', '8', 's') || c === 'JTo';
  return false;
}
/** decisions.md D16: 33+, any A, any K, Q8+ (suited or not), JT. */
function isSimple4x(c: string): boolean {
  if (isPair(c)) return hi(c) <= rankIdx('3');
  if (c[0] === 'A' || c[0] === 'K') return true;
  if (c[0] === 'Q') return atLeast(c, 'Q', '8', 'any');
  return c[0] === 'J' && c[1] === 'T';
}

/** The classes a strategy bets 4x with (all others check; 3x is never best). */
export function preflop4xSet(strategy: StrategyId): ReadonlySet<string> {
  const f = strategy === 'simple' ? isSimple4x : isPerfect4x;
  return new Set(chartClasses().filter(f));
}

const FLOP_RULES: Record<'basic' | 'simple', string[]> = {
  basic: [
    'Bet 2x with two pair or better, if your hole cards play in it and it beats what the flop already shows.',
    'Bet 2x with a hidden pair: a pocket pair other than 22, or a hole card that matches a flop card.',
    'Bet 2x with four cards of one suit among your hole cards and the flop, if your card of that suit is a ten or higher.',
    'Otherwise check.',
  ],
  simple: [
    'Bet 2x with two pair or better (rule a) or a hidden pair (rule b).',
    'Otherwise check.',
  ],
};
const RIVER_RULES = [
  'Bet 1x if you have a hidden pair or better: your best five cards make at least a pair and beat the five board cards on their own.',
  'Bet 1x if the dealer has fewer than 21 outs: of the 45 unseen cards, fewer than 21 would give the dealer a better hand than yours.',
  'Otherwise fold.',
];

export interface StrategyChartProps {
  strategy: StrategyId;
  /** `preflop` (169-cell grid), `flop` or `river` (the rules in words). */
  view: string;
  /** Overrides the built-in definition (the strategy module's data). */
  preflop4x?: ReadonlySet<string> | readonly string[];
  /** Classes to ring (a scene's `highlight`, or the hand just played). */
  highlight?: readonly string[];
  onSelect?: (cls: string) => void;
}

export function StrategyChart({
  strategy,
  view,
  preflop4x,
  highlight = [],
  onSelect,
}: StrategyChartProps) {
  const [picked, setPicked] = useState<string | null>(null);
  if (view === 'flop' || view === 'river') {
    const rules =
      view === 'river' ? RIVER_RULES : FLOP_RULES[strategy === 'simple' ? 'simple' : 'basic'];
    return (
      <div class="sim-chart sim-chart-rules" data-testid="strategy-chart">
        <h3>{view === 'flop' ? 'Flop' : 'River'} rules</h3>
        <ol>
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </div>
    );
  }
  const set = preflop4x ? new Set(preflop4x) : preflop4xSet(strategy);
  const pick = (cls: string) => {
    setPicked(cls);
    onSelect?.(cls);
  };
  const count = chartClasses().filter((c) => set.has(c)).length;
  return (
    <div class="sim-chart" data-testid="strategy-chart">
      <div class="sim-chart-grid" role="grid" aria-label="Preflop strategy chart">
        <div class="sim-chart-row" role="row">
          <span class="sim-chart-corner" role="presentation" />
          {[...RANKS].map((c) => (
            <span key={c} class="sim-chart-head" role="columnheader">
              {c}
            </span>
          ))}
        </div>
        {[...RANKS].map((r) => (
          <div key={r} class="sim-chart-row" role="row">
            <span class="sim-chart-head" role="rowheader">
              {r}
            </span>
            {[...RANKS].map((c) => {
              const cls = cellClass(r, c);
              const bet = set.has(cls);
              return (
                <span key={cls} role="gridcell" class="sim-chart-td">
                  <button
                    type="button"
                    class={`sim-chart-cell ${bet ? 'is-bet' : 'is-check'}${highlight.includes(cls) ? ' is-hl' : ''}${picked === cls ? ' is-picked' : ''}`}
                    aria-label={`${cls}: ${bet ? 'Bet 4x' : 'Check'}`}
                    data-class={cls}
                    onClick={() => pick(cls)}
                  >
                    <span aria-hidden="true">{bet ? '4x' : '–'}</span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p class="sim-chart-legend" aria-live="polite">
        {picked
          ? `${picked}: ${set.has(picked) ? 'Bet 4x' : 'Check'}.`
          : `Pairs on the diagonal, suited above, offsuit below. ${count} of 169 hands bet 4x; the rest check.`}
      </p>
      <p class="sim-chart-key">
        <span class="sim-chart-swatch is-bet">4x</span> Bet 4x
        <span class="sim-chart-swatch is-check">–</span> Check
      </p>
    </div>
  );
}
