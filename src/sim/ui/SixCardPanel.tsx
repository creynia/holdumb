// I062 Six Card Bonus (decisions.md D5a): the optional side bet in the sandbox, under the table.
// Off by default. When on, it shows the exact edge and cost per hour, and after each deal the four
// bonus cards, your best five of six and what the bet did. It never sits on the felt.
import './styles/sixcard.css';
import { useState } from 'preact/hooks';
import {
  DEFAULT_SIX_CARD_PAYTABLE,
  SIX_CARD_PAYTABLES,
  SIX_CARD_PAYTABLE_IDS,
  cardCode,
} from '../engine';
import type { Cents, SixCardPaytableId } from '../engine';
import { HANDS_PER_HOUR, sixCardEdge } from '../math';
import { round, scale } from '../math/fraction';
import type { SimDriver } from '../scene';
import { renderInline } from './StepPanel';
import { TierBadge } from './TierBadge';
import { capitalize, fmtPct, handName, money, typographic } from './text';

export const SIX_CARD_AMOUNTS: readonly Cents[] = [100, 500, 1_000, 2_500];
const DEFAULT_AMOUNT: Cents = 500;

/** "$5 a hand costs $12.84 an hour": exact −edge × bet × 30, rounded once. */
export function sixCardPerHour(id: SixCardPaytableId, bet: Cents): Cents {
  return round(scale(sixCardEdge(id).edge, bet * HANDS_PER_HOUR));
}

export function SixCardPanel({ d }: { d: SimDriver }) {
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
          <SixCardLast last={last} />
        </div>
      ) : null}
    </section>
  );
}

function SixCardLast({ last }: { last: SimDriver['view']['sixCard']['last'] }) {
  if (!last) return null;
  if (last.kind === 'skipped')
    return (
      <p class="sim-sixcard-last" role="status" data-testid="six-card-last">
        {last.reason}
      </p>
    );
  const r = last.result;
  const codes = r.bonus.map(cardCode).join(' ');
  return (
    <p class="sim-sixcard-last" role="status" data-testid="six-card-last">
      Bonus cards {renderInline(`{{${codes}}}`)} · best five: {capitalize(handName(r.hand))} ·{' '}
      <span class="sim-money">{typographic(money(r.profit, true))}</span>
    </p>
  );
}
