// SVG playing cards. Suits are drawn paths (never emoji-prone glyphs); ranks are plain text.
import { cardName } from '../engine';
import type { Card as CardId, Suit } from '../engine';

const RANK_TEXT = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Suit shapes in a 100x100 box. */
const SUIT_PATH: Record<Suit, string> = {
  0: 'M50 4C50 4 6 38 6 62a21 21 0 0 0 38 12c-1 12-6 18-14 22h40c-8-4-13-10-14-22a21 21 0 0 0 38-12C94 38 50 4 50 4Z',
  1: 'M50 92C18 66 4 50 4 32a22 22 0 0 1 46-8 22 22 0 0 1 46 8c0 18-14 34-46 60Z',
  2: 'M50 4 92 50 50 96 8 50Z',
  3: 'M50 4a21 21 0 0 0-14 36 21 21 0 1 0 10 38c-1 10-5 15-12 18h32c-7-3-11-8-12-18a21 21 0 1 0 10-38A21 21 0 0 0 50 4Z',
};
const SUIT_CLASS = ['s', 'h', 'd', 'c'] as const;

export function SuitShape({
  suit,
  x,
  y,
  size,
  fourColor,
}: {
  suit: Suit;
  x: number;
  y: number;
  size: number;
  fourColor?: boolean;
}) {
  return (
    <path
      d={SUIT_PATH[suit]}
      class={`sim-suit sim-suit-${SUIT_CLASS[suit]}${fourColor ? ' is-four' : ''}`}
      transform={`translate(${x} ${y}) scale(${size / 100})`}
    />
  );
}

export interface CardProps {
  /** 0..51; omit (with faceDown) for a card back. */
  card?: CardId;
  x: number;
  y: number;
  w: number;
  h: number;
  faceDown?: boolean;
  fourColor?: boolean;
  /** Animation: delay and duration in ms (0 = none). */
  delayMs?: number;
  durMs?: number;
  dim?: boolean;
  /** Ring drawn around cards the scene highlights. */
  highlight?: boolean;
  /** A short name for the slot when face down ("Dealer card 1"). */
  slotLabel?: string;
}

/** One card at (x, y). Face-up cards are `role="img"` named "Ace of spades". */
export function Card({
  card,
  x,
  y,
  w,
  h,
  faceDown,
  fourColor,
  delayMs = 0,
  durMs = 0,
  dim,
  highlight,
  slotLabel,
}: CardProps) {
  const anim =
    durMs > 0 ? { style: `animation-delay:${delayMs}ms;animation-duration:${durMs}ms` } : {};
  const cls = `sim-card${durMs > 0 ? ' is-anim' : ''}${dim ? ' is-dim' : ''}${highlight ? ' is-hl' : ''}`;
  const rx = Math.max(4, w * 0.09);
  if (faceDown || card === undefined) {
    return (
      <g
        class={`${cls} sim-card-back`}
        role="img"
        aria-label={slotLabel ?? 'Face-down card'}
        {...anim}
      >
        <rect x={x} y={y} width={w} height={h} rx={rx} class="sim-card-back-body" />
        <rect
          x={x + 5}
          y={y + 5}
          width={w - 10}
          height={h - 10}
          rx={rx - 2}
          class="sim-card-back-inner"
        />
        <path
          class="sim-card-back-lines"
          d={`M${x + 5} ${y + h * 0.35}l${w - 10} ${h * 0.3}M${x + 5} ${y + h * 0.65}l${w - 10} ${-h * 0.3}M${x + w / 2} ${y + 5}v${h - 10}`}
        />
      </g>
    );
  }
  const rank = card >> 2;
  const suit = (card & 3) as Suit;
  const rankText = RANK_TEXT[rank]!;
  const fs = w * (rankText.length > 1 ? 0.3 : 0.36);
  return (
    <g class={cls} role="img" aria-label={cardName(card)} {...anim}>
      <rect x={x} y={y} width={w} height={h} rx={rx} class="sim-card-body" />
      <text
        x={x + w * 0.1}
        y={y + fs * 1.0 + 3}
        font-size={fs}
        class={`sim-rank sim-suit-${SUIT_CLASS[suit]}${fourColor ? ' is-four' : ''}`}
      >
        {rankText}
      </text>
      <SuitShape
        suit={suit}
        x={x + w * 0.1}
        y={y + fs * 1.0 + 7}
        size={w * 0.2}
        fourColor={fourColor}
      />
      <SuitShape
        suit={suit}
        x={x + w * 0.5 - w * 0.19}
        y={y + h * 0.5 - w * 0.02}
        size={w * 0.5}
        fourColor={fourColor}
      />
    </g>
  );
}

/** A dashed empty slot, so the board shows where cards will land. */
export function CardSlot({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={Math.max(4, w * 0.09)}
      class="sim-slot"
      aria-hidden="true"
    />
  );
}
