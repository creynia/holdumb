import './sim.css';
import { cardName } from '../engine';
import type { Card as CardId, Cents, WagerId } from '../engine';
import type { CircleId } from '../scene/types';
import { BetCircle } from './BetCircle';
import { Card, CardSlot } from './Card';
import { layoutFor } from './layouts';
import type { LabelSpot } from './layouts';
import type { Timeline } from './animation';
import { capitalize } from './text';

export interface FeltProps {
  orientation: 'portrait' | 'landscape';
  /** Your two hole cards once dealt. */
  hole?: readonly CardId[] | null;
  /** The dealer's cards. Shown face up only when `dealerShown`. Pass them even when hidden only if known. */
  dealer?: readonly CardId[] | null;
  /** True once the dealer has been dealt (cards or backs appear). */
  dealerDealt?: boolean;
  dealerShown?: boolean;
  board?: readonly CardId[];
  bets: Partial<Record<WagerId, Cents>>;
  /** Shown on the Play circle ("4x"). */
  playMultiple?: number | null;
  fourColor?: boolean;
  highlight?: readonly CircleId[];
  /** When set, the circles are buttons. */
  onCircle?: (id: CircleId) => void;
  labels?: { dealer?: string; player?: string };
  timeline?: Timeline;
  /** Visuals flushed (tap to skip). */
  /** D38: after a hand settles the chips are the next hand's intent: drawn ghosted with a caption. */
  nextHand?: boolean;
  skipped?: boolean;
  onSkip?: () => void;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

function HandLabel({
  spot,
  text,
  max,
  cls,
}: {
  spot: LabelSpot;
  text: string;
  max: number;
  cls: string;
}) {
  const lines = wrap(text, max);
  return (
    <text x={spot.x} y={spot.y} text-anchor={spot.anchor} class={`sim-hand-label ${cls}`}>
      {lines.map((l, i) => (
        <tspan key={i} x={spot.x} dy={i === 0 ? 0 : 16}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

const BOARD_NAMES = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];

/** The table felt as one SVG. Presentational: all state comes in as props. */
export function Felt({
  orientation,
  hole,
  dealer,
  dealerDealt,
  dealerShown,
  board = [],
  bets,
  playMultiple,
  fourColor,
  highlight = [],
  onCircle,
  labels,
  timeline,
  nextHand,
  skipped,
  onSkip,
}: FeltProps) {
  const L = layoutFor(orientation);
  const d = timeline?.delays;
  const dur = timeline?.cardMs ?? 0;
  const cs = L.cardSize;
  const bs = L.boardCardSize;
  const dealt = !!hole && hole.length === 2;
  const showDealer = dealt || !!dealerDealt;
  const summary = [
    hole && hole.length ? `Your cards: ${hole.map(cardName).join(', ')}.` : '',
    board.length ? `Board: ${board.map(cardName).join(', ')}.` : '',
    dealerShown && dealer?.length ? `Dealer cards: ${dealer.map(cardName).join(', ')}.` : '',
    labels?.player ? `You: ${labels.player}.` : '',
    labels?.dealer ? `Dealer: ${labels.dealer}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const amountOf = (id: CircleId): Cents => bets[id] ?? 0;
  return (
    <div
      class={`sim-felt-wrap sim-felt-${orientation}${skipped ? ' sim-instant' : ''}`}
      onClick={onSkip}
      data-testid="felt"
    >
      <svg
        class="sim-felt"
        viewBox={`0 0 ${L.viewBox.w} ${L.viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Table"
      >
        <rect x="0" y="0" width={L.viewBox.w} height={L.viewBox.h} class="sim-felt-bg" />
        <rect
          x="6"
          y="6"
          width={L.viewBox.w - 12}
          height={L.viewBox.h - 12}
          rx="18"
          class="sim-felt-rail"
        />

        {/* dealer */}
        {showDealer
          ? L.dealer.map((p, i) => {
              const card = dealer?.[i];
              const faceUp = !!dealerShown && card !== undefined;
              return (
                <Card
                  key={faceUp ? `up-${card}` : `down-${i}`}
                  card={card}
                  faceDown={!faceUp}
                  x={p.x}
                  y={p.y}
                  w={cs.w}
                  h={cs.h}
                  fourColor={fourColor}
                  slotLabel={`Dealer card ${i + 1}, face down`}
                  delayMs={faceUp ? (d?.reveal[i] ?? 0) : (d?.dealer[i] ?? 0)}
                  durMs={dur}
                />
              );
            })
          : null}
        <HandLabel
          spot={L.handLabels.dealer}
          text={labels?.dealer ? `Dealer: ${labels.dealer}` : 'Dealer'}
          max={orientation === 'portrait' ? 40 : 22}
          cls="is-dealer"
        />

        {/* board */}
        {L.board.map((p, i) => {
          const card = board[i];
          return card === undefined ? (
            <CardSlot key={`slot-${i}`} x={p.x} y={p.y} w={bs.w} h={bs.h} />
          ) : (
            <Card
              key={`b-${card}`}
              card={card}
              x={p.x}
              y={p.y}
              w={bs.w}
              h={bs.h}
              fourColor={fourColor}
              slotLabel={BOARD_NAMES[i]}
              delayMs={i < 3 ? (d?.flop[i] ?? 0) : i === 3 ? (d?.turn ?? 0) : (d?.river ?? 0)}
              durMs={dur}
            />
          );
        })}

        {/* circles */}
        {(Object.keys(L.circles) as CircleId[]).map((id) => {
          const c = L.circles[id];
          return (
            <BetCircle
              key={id}
              id={id}
              c={c.c}
              r={c.r}
              label={c.label}
              amount={amountOf(id)}
              sublabel={id === 'play' && playMultiple ? `${playMultiple}x` : undefined}
              minTap={L.minTapUnits}
              onTap={onCircle}
              ghost={!!nextHand && id !== 'play'}
              highlight={highlight.includes(id)}
              hint={id === 'ante' ? 'Blind matches.' : undefined}
            />
          );
        })}

        {nextHand && (bets.ante || bets.trips) ? (
          <text
            x={L.nextHandCaption.x}
            y={L.nextHandCaption.y}
            text-anchor="middle"
            class="sim-next-caption"
          >
            Next hand
          </text>
        ) : null}

        {/* player */}
        {dealt
          ? L.player.map((p, i) => (
              <Card
                key={`p-${hole[i]}`}
                card={hole[i]}
                x={p.x}
                y={p.y}
                w={cs.w}
                h={cs.h}
                fourColor={fourColor}
                delayMs={d?.player[i] ?? 0}
                durMs={dur}
              />
            ))
          : null}
        {labels?.player ? (
          <HandLabel
            spot={L.handLabels.player}
            text={capitalize(labels.player)}
            max={orientation === 'portrait' ? 14 : 24}
            cls="is-player"
          />
        ) : null}
      </svg>
      <p class="sim-sr" aria-live="polite">
        {summary}
      </p>
    </div>
  );
}
