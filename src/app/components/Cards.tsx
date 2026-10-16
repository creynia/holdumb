import { parseCards } from '../../sim/engine';
import type { Card } from '../../sim/engine';
import { cardFace, splitInline } from '../../content/cards';

/** A group of cards, same markup as the compiled `{{As Kd}}` HTML. Accepts codes or Card ids. */
export function Cards(props: { cards: string | readonly Card[]; class?: string }) {
  const list = typeof props.cards === 'string' ? parseCards(props.cards) : props.cards;
  const faces = list.map(cardFace);
  return (
    <span
      class={`cards ${props.class ?? ''}`.trim()}
      role="img"
      aria-label={faces.map((f) => f.name).join(', ')}
    >
      {faces.map((f, i) => (
        <span key={i} class={`pc suit-${f.suit}`} aria-hidden="true">
          {f.rank}
          {f.glyph}
        </span>
      ))}
    </span>
  );
}

/** Plain text with `{{cards}}` groups drawn inline (quiz text, options, explanations). */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((s, i) =>
        s.t === 'text' ? <span key={i}>{s.text}</span> : <Cards key={i} cards={s.cards} />,
      )}
    </>
  );
}
