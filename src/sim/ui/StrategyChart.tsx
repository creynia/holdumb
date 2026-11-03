import './sim.css';
import { useRef, useState } from 'preact/hooks';
import { useAnnounce } from './announcer';
import { classEv } from '../math';
import { strategyChart } from '../strategy';
import { fmtFixed, sub } from './text';
import type { StrategyId } from '../strategy';

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

/** The classes a strategy bets 4x with (all others check; 3x is never best). From the strategy module. */
export function preflop4xSet(strategy: StrategyId): ReadonlySet<string> {
  return new Set(
    strategyChart(strategy)
      .grid.flat()
      .filter((c) => c.action === '4x')
      .map((c) => c.cls),
  );
}

/** A cell is a close call when Bet 4x and Check are less than this many antes apart (curriculum 7.3). */
const CLOSE_MARGIN = { num: 3n, den: 100n };

export interface CellEv {
  /** Exact EVs in antes, from the shipped preflop table (never hard-coded). */
  bet4: string;
  check: string;
  margin: string;
  close: boolean;
}
const cellEvCache = new Map<string, CellEv>();
const signed = (f: { num: bigint; den: bigint }) =>
  fmtFixed(f, 3, { sign: true }).replace('-', '\u2212');

/** "+0.042" / "\u22120.082" EVs, the margin and the close-call flag of one class. */
export function cellEv(cls: string): CellEv {
  const hit = cellEvCache.get(cls);
  if (hit) return hit;
  const { bet4, check } = classEv('blind-standard', cls);
  const d = sub(bet4, check);
  const margin = d.num < 0n ? { num: -d.num, den: d.den } : d;
  const out = {
    bet4: signed(bet4),
    check: signed(check),
    margin: fmtFixed(margin, 3),
    close: margin.num * CLOSE_MARGIN.den < CLOSE_MARGIN.num * margin.den,
  };
  cellEvCache.set(cls, out);
  return out;
}

/** The classes whose Bet 4x and Check EVs are within 0.03 antes of each other. */
export function closeCallClasses(): string[] {
  return chartClasses().filter((c) => cellEv(c).close);
}

/** "K4o: Check. Bet 4x \u22120.229 \u00b7 Check \u22120.206 \u00b7 margin 0.023 \u00b7 close call" */
function legendText(cls: string, bet: boolean): string {
  const e = cellEv(cls);
  return `${cls}: ${bet ? 'Bet 4x' : 'Check'}. Bet 4x ${e.bet4} \u00b7 Check ${e.check} \u00b7 margin ${e.margin}${e.close ? ' \u00b7 close call' : ''}`;
}

function ruleLines(strategy: StrategyId, view: 'flop' | 'river'): string[] {
  const d = strategyChart(strategy);
  const part = view === 'flop' ? d.flop : d.river;
  const name = view === 'flop' ? 'Bet 2x' : 'Bet 1x';
  if (part.rule === 'rules')
    return [
      ...part.lines.map((l) => `${name} with: ${l.text}.`),
      'Otherwise ' + (view === 'flop' ? 'check.' : 'fold.'),
    ];
  if (part.rule === 'always') return [`${name} every time.`];
  if (part.rule === 'never') return [view === 'flop' ? 'Always check.' : 'Always fold.'];
  return ['Chosen by the exact EV of the spot (the EV sheet shows it).'];
}

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
  const [focus, setFocus] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // The picked hand's answer is spoken once, through the app's announcer (I036).
  useAnnounce(
    picked && view === 'preflop-grid'
      ? legendText(picked, (preflop4x ? new Set(preflop4x) : preflop4xSet(strategy)).has(picked))
      : '',
    { dedupeKey: 'chart' },
  );
  if (view === 'flop' || view === 'river') {
    const rules = ruleLines(strategy, view);
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
  // The 169 cells are 24 px (a 13x13 grid cannot be 44 px on a phone), so they are not buttons:
  // one tab stop, arrow keys move, Enter/Space pick.
  const onCellKey = (e: KeyboardEvent, r: string, c: string, cls: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(cls);
      return;
    }
    const d: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const mv = d[e.key];
    if (!mv) return;
    e.preventDefault();
    const nr = Math.min(12, Math.max(0, rankIdx(r) + mv[0]));
    const nc = Math.min(12, Math.max(0, rankIdx(c) + mv[1]));
    const next = cellClass(RANKS[nr]!, RANKS[nc]!);
    gridRef.current?.querySelector<HTMLElement>(`[data-class="${next}"]`)?.focus();
  };
  const count = chartClasses().filter((c) => set.has(c)).length;
  return (
    <div class="sim-chart" data-testid="strategy-chart">
      <div ref={gridRef} class="sim-chart-grid" role="grid" aria-label="Preflop strategy chart">
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
              const close = cellEv(cls).close;
              return (
                <span
                  key={cls}
                  role="gridcell"
                  class={`sim-chart-cell ${bet ? 'is-bet' : 'is-check'}${highlight.includes(cls) ? ' is-hl' : ''}${picked === cls ? ' is-picked' : ''}${close ? ' is-close' : ''}`}
                  aria-label={`${cls}: ${bet ? 'Bet 4x' : 'Check'}${close ? ', close call' : ''}`}
                  aria-selected={picked === cls}
                  tabIndex={cls === (focus ?? 'AA') ? 0 : -1}
                  data-class={cls}
                  onClick={() => pick(cls)}
                  onFocus={() => setFocus(cls)}
                  onKeyDown={(e: KeyboardEvent) => onCellKey(e, r, c, cls)}
                >
                  <span aria-hidden="true">{bet ? '4x' : '–'}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p class="sim-chart-legend">
        {picked
          ? legendText(picked, set.has(picked))
          : `Pairs on the diagonal, suited above, offsuit below. ${count} of 169 hands bet 4x; the rest check.`}
      </p>
      <p class="sim-chart-key">
        <span class="sim-chart-swatch is-bet">4x</span> Bet 4x
        <span class="sim-chart-swatch is-check">–</span> Check
        <span class="sim-chart-swatch is-close" aria-hidden="true" /> Close call
      </p>
    </div>
  );
}
