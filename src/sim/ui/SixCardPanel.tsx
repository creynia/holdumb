/** @jsxRuntime classic */
/** @jsx h */
// I062 Six Card Bonus (decisions.md D5a): the optional side bet in the sandbox, under the table.
// Off by default. When on, it shows the exact edge and cost per hour, and after each deal the four
// bonus cards, your best five of six and what the bet did. It never sits on the felt.
import './styles/sixcard.css';
// Registers the table's Six Card rules (the driver has none until this lazy chunk loads).
import '../scene/sixcard';
import type { JSX as PreactJSX, h as preactH } from 'preact';
import { cardCode } from '../engine/cards';
import {
  DEFAULT_SIX_CARD_PAYTABLE,
  SIX_CARD_PAYTABLES,
  SIX_CARD_PAYTABLE_IDS,
} from '../engine/sixcard';
import type { Cents, SixCardPaytableId } from '../engine';
import { HANDS_PER_HOUR } from '../math/edges';
import { sixCardEdge } from '../math/sixcardEdge';
import { round, scale } from '../math/fraction';
import type { SimDriver } from '../scene';
import type { SixCardKit } from './SixCardPanelLazy';

export const SIX_CARD_AMOUNTS: readonly Cents[] = [100, 500, 1_000, 2_500];
const DEFAULT_AMOUNT: Cents = 500;

/** "$5 a hand costs $12.84 an hour": exact −edge × bet × 30, rounded once. */
export function sixCardPerHour(id: SixCardPaytableId, bet: Cents): Cents {
  return round(scale(sixCardEdge(id).edge, bet * HANDS_PER_HOUR));
}

/**
 * `kit` carries the shared formatting helpers and TierBadge from the eager wrapper: this lazy chunk
 * then shares no app modules with the first paint (sharing them made the bundler split them out).
 */
// Classic JSX with preact's `h`, `Fragment` and hooks taken from `kit`: with no preact import of
// its own, this lazy chunk shares nothing with the first paint, so the bundler keeps the first-paint
// chunks exactly as they are without it. `h` is set before any JSX here runs.
let kitH: typeof preactH | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the JSX factory (see @jsx above)
function h(...args: Parameters<typeof preactH>): ReturnType<typeof preactH> {
  return kitH!(...args);
}
// The JSX types for the classic factory above: preact's own.
/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
declare namespace h {
  namespace JSX {
    type Element = PreactJSX.Element;
    type LibraryManagedAttributes<C, P> = PreactJSX.LibraryManagedAttributes<C, P>;
    interface IntrinsicElements extends PreactJSX.IntrinsicElements {}
    interface IntrinsicAttributes extends PreactJSX.IntrinsicAttributes {}
    interface ElementChildrenAttribute extends PreactJSX.ElementChildrenAttribute {}
    type ElementClass = PreactJSX.ElementClass;
  }
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */

export function SixCardPanel({ d, kit }: { d: SimDriver; kit: SixCardKit }) {
  kitH = kit.h;
  const { TierBadge, fmtPct, money, useState } = kit;
  const { setting, last } = d.view.sixCard;
  const [amount, setAmount] = useState<Cents>(setting?.bet ?? DEFAULT_AMOUNT);
  const [table, setTable] = useState<SixCardPaytableId>(
    setting?.paytable ?? DEFAULT_SIX_CARD_PAYTABLE,
  );
  const on = !!setting;
  const apply = (next: { on?: boolean; bet?: Cents; paytable?: SixCardPaytableId }) => {
    const bet = next.bet ?? amount;
    const paytable = next.paytable ?? table;
    d.setSixCard((next.on ?? on) ? { bet, paytable } : null);
  };
  const edge = sixCardEdge(table);
  return (
    <section class="sim-sixcard" aria-label="Six Card Bonus" data-testid="six-card">
      <label class="sim-sixcard-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => apply({ on: e.currentTarget.checked })}
          data-testid="six-card-toggle"
        />
        Six Card Bonus side bet
      </label>
      {on ? (
        <div class="sim-sixcard-body">
          <div class="sim-sixcard-row">
            <label>
              Bet
              <select
                value={String(amount)}
                onChange={(e) => {
                  const bet = Number(e.currentTarget.value);
                  setAmount(bet);
                  apply({ bet });
                }}
                data-testid="six-card-amount"
              >
                {SIX_CARD_AMOUNTS.map((c) => (
                  <option key={c} value={String(c)}>
                    {money(c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pays
              <select
                value={table}
                onChange={(e) => {
                  const paytable = e.currentTarget.value as SixCardPaytableId;
                  setTable(paytable);
                  apply({ paytable });
                }}
                data-testid="six-card-paytable"
              >
                {SIX_CARD_PAYTABLE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {SIX_CARD_PAYTABLES[id].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p class="sim-sixcard-edge" data-testid="six-card-edge">
            House edge {fmtPct(edge.edge, 2)} (exact) <TierBadge tier={edge.tier} /> ·{' '}
            {money(amount)} a hand costs about {money(sixCardPerHour(table, amount))} an hour. Your
            two hole cards plus four bonus cards; it settles with the deal.
          </p>
          <SixCardLast last={last} kit={kit} />
        </div>
      ) : null}
    </section>
  );
}

// Inline cards as StepPanel's renderInline draws them ({{As}}), without importing StepPanel: this
// panel is a lazy chunk, and sharing fewer modules keeps the first-paint chunks as they were.
const SUIT_CLASS = ['s', 'h', 'd', 'c'] as const;
const SUIT_GLYPH = ['\u2660', '\u2665', '\u2666', '\u2663'] as const;
function inlineCard(c: number) {
  const code = cardCode(c);
  return (
    <span
      key={code}
      class={`sim-inline-card sim-suit-${SUIT_CLASS[c & 3]}`}
      role="img"
      aria-label={code}
    >
      {code.charAt(0).replace('T', '10')}
      {SUIT_GLYPH[c & 3]}
    </span>
  );
}

function SixCardLast({
  last,
  kit: { capitalize, handName, money, typographic },
}: {
  last: SimDriver['view']['sixCard']['last'];
  kit: SixCardKit;
}) {
  if (!last) return null;
  if (last.kind === 'skipped')
    return (
      <p class="sim-sixcard-last" role="status" data-testid="six-card-last">
        {last.reason}
      </p>
    );
  const r = last.result;
  return (
    <p class="sim-sixcard-last" role="status" data-testid="six-card-last">
      Bonus cards {r.bonus.map(inlineCard)} · best five: {capitalize(handName(r.hand))} ·{' '}
      <span class="sim-money">{typographic(money(r.profit, true))}</span>
    </p>
  );
}
