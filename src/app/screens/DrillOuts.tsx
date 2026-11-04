// Count the dealer's outs (I060): a number field with +/- buttons and the exact answer afterwards.
import { useState } from 'preact/hooks';
import { RIVER_UNSEEN, outsDetailText } from '../../sim';
import type { Card, RiverFacts } from '../../sim';

export const MAX_OUTS = RIVER_UNSEEN; // 45 unseen cards

/** "Exactly right: 19 outs." or "19 outs (you said 16): any jack (3), any nine (3) beat you." */
export function outsFeedback(
  guess: number,
  facts: RiverFacts,
  hole: readonly [Card, Card],
  board: readonly Card[],
): string {
  const n = facts.outs;
  const word = n === 1 ? 'out' : 'outs';
  if (guess === n) return `Exactly right: ${n} ${word}.`;
  const detail = outsDetailText(facts, hole, board);
  return `${n} ${word} (you said ${guess}): ${detail}${n === 0 ? '' : ' beat you'}.`;
}

/** The parsed whole number in 0..45, or null while the field is empty or out of range. */
export const parseOuts = (s: string): number | null => {
  if (!/^\d{1,2}$/.test(s.trim())) return null;
  const n = Number(s);
  return n >= 0 && n <= MAX_OUTS ? n : null;
};

export function OutsInput(props: { onSubmit: (n: number) => void }) {
  const [text, setText] = useState('');
  const n = parseOuts(text);
  const step = (by: number) => {
    const cur = n ?? (by > 0 ? -1 : 1);
    setText(String(Math.max(0, Math.min(MAX_OUTS, cur + by))));
  };
  return (
    <form
      class="drill-outs-form"
      data-testid="outs-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (n !== null) props.onSubmit(n);
      }}
    >
      <label class="drill-outs-label" for="drill-outs-input">
        <strong>How many of the 45 unseen cards beat you?</strong>
        <span class="muted"> Count the dealer outs, then check.</span>
      </label>
      <div class="drill-outs-field">
        <button
          type="button"
          class="btn btn-ghost"
          aria-label="One fewer out"
          onClick={() => step(-1)}
        >
          −
        </button>
        <input
          id="drill-outs-input"
          class="drill-outs-input"
          type="number"
          inputmode="numeric"
          min={0}
          max={MAX_OUTS}
          step={1}
          aria-label="Dealer outs"
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button
          type="button"
          class="btn btn-ghost"
          aria-label="One more out"
          onClick={() => step(1)}
        >
          +
        </button>
        <button type="submit" class="btn" disabled={n === null}>
          Check count
        </button>
      </div>
    </form>
  );
}
