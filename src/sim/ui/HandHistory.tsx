import './container.css';
import { useState } from 'preact/hooks';
import { RANK_CHARS, cardName, formatMoney, parseCards, recordResult } from '../engine';
import type { Card, HandRecord, TableRules } from '../engine';
import { cmp, frac } from '../math/fraction';
import type { Fraction } from '../math';
import { STREET_OF_CODE } from '../engine';
import { replayQuery } from '../scene';
import { describeResult, typographic } from './text';

export interface HandHistoryProps {
  /** Newest first (driver view). */
  records: readonly HandRecord[];
  rules: TableRules;
  /** Builds the href of "Replay this spot" from the play-route query; no link without it. */
  replayHref?: (query: string) => string;
}

/** Rows listed before "Show more". */
export const SHOWN_FIRST = 10;

const SUIT_GLYPH = ['♠', '♥', '♦', '♣'] as const;
const SUIT_CLASS = ['s', 'h', 'd', 'c'] as const;
const TIER_WORD = { b: 'best', c: 'close', s: 'small mistake', m: 'mistake', x: 'big mistake' };

function InlineCards({ codes, label }: { codes: string; label: string }) {
  const cards: Card[] = parseCards(codes);
  return (
    <span
      class="sim-history-cards"
      role="img"
      aria-label={`${label}: ${cards.map(cardName).join(', ')}`}
    >
      {cards.map((c) => (
        <span key={c} class={`sim-inline-card sim-suit-${SUIT_CLASS[c & 3]}`} aria-hidden="true">
          {RANK_CHARS.charAt(c >> 2).replace('T', '10')}
          {SUIT_GLYPH[c & 3]}
        </span>
      ))}
    </span>
  );
}

/** "num/den" from a record back to an exact Fraction; null if it does not parse. */
function ratio(s: string): Fraction | null {
  try {
    const [n, d] = s.split('/');
    return frac(BigInt(n!), d === undefined ? 1n : BigInt(d));
  } catch {
    return null;
  }
}

/** The street of the costliest scored decision, or the first decision's street. */
export function costliestStreet(r: HandRecord): 'preflop' | 'flop' | 'river' {
  let best: { street: HandRecord['a'][number][0]; regret: Fraction } | null = null;
  for (const dec of r.a) {
    if (dec.length !== 4) continue;
    const regret = ratio(dec[3]);
    if (regret && (!best || cmp(regret, best.regret) > 0)) best = { street: dec[0], regret };
  }
  return STREET_OF_CODE[best?.street ?? r.a[0]?.[0] ?? 'p'];
}

/** "4x" · "check, 2x (mistake)" · "check, check, fold (best)": the choices with their tier words. */
export function actionsText(r: HandRecord): string {
  return r.a
    .map((dec) => (dec.length === 4 ? `${dec[1]} (${TIER_WORD[dec[2]]})` : dec[1]))
    .join(', ');
}

/**
 * The last hands, newest first (simulator.md 3.7). This history is the exact record (deal,
 * choices, exact regrets) that replay and review are rebuilt from; the move log (I081) is the
 * display-only narration of the same hands. cards, your choices with the tier of each
 * scored decision, and the net. A row opens to the settlement sentence and "Replay this spot",
 * which reopens the hand at the street of your costliest decision with the same cards.
 */
export function HandHistory({ records, rules, replayHref }: HandHistoryProps) {
  const [openN, setOpenN] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  if (records.length === 0) return null;
  // The newest SHOWN_FIRST rows; "Show more" lists them all (50 rows are ~6,000 px at 360).
  const shown = all ? records : records.slice(0, SHOWN_FIRST);
  return (
    <section class="sim-history" aria-labelledby="sim-history-h" data-testid="hand-history">
      <h2 id="sim-history-h" class="sim-history-title">
        Hand history
      </h2>
      <ol class="sim-history-list">
        {shown.map((r) => {
          const open = openN === r.n;
          const id = `sim-history-${r.n}`;
          return (
            <li key={r.n} class="sim-history-row" data-testid="hand-history-row">
              <button
                type="button"
                class="sim-history-head"
                aria-expanded={open}
                aria-controls={id}
                aria-label={`Hand ${r.n}, net ${typographic(formatMoney(r.net, { sign: true }))}, ${actionsText(r)}`}
                onClick={() => setOpenN(open ? null : r.n)}
              >
                <span class="sim-history-n">#{r.n}</span>
                <span class="sim-history-deal">
                  <InlineCards codes={r.p} label="You" />
                  <InlineCards codes={r.b} label="Board" />
                  <InlineCards codes={r.d} label="Dealer" />
                </span>
                <span class="sim-history-actions">{actionsText(r)}</span>
                <span class="sim-money sim-history-net">
                  {typographic(formatMoney(r.net, { sign: true }))}
                </span>
              </button>
              {open ? (
                <div id={id} class="sim-history-body">
                  <p>{describeResult(recordResult(r, rules))}</p>
                  {replayHref ? (
                    <a
                      class="sim-btn sim-btn-secondary sim-history-replay"
                      href={replayHref(
                        replayQuery({
                          hole: r.p,
                          board: r.b,
                          dealer: r.d,
                          street: costliestStreet(r),
                        }),
                      )}
                      data-testid="replay-spot"
                    >
                      Replay this spot
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!all && records.length > SHOWN_FIRST ? (
        <button
          type="button"
          class="sim-btn sim-btn-secondary sim-history-more"
          onClick={() => setAll(true)}
          data-testid="history-more"
        >
          Show {records.length - SHOWN_FIRST} more
        </button>
      ) : null}
    </section>
  );
}
