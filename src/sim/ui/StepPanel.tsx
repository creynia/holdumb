import './sim.css';
import './container.css';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { RANK_CHARS, parseCard } from '../engine';
import type { SceneStep } from '../scene';

const SUIT_GLYPH = ['♠', '♥', '♦', '♣'] as const;
const SUIT_CLASS = ['s', 'h', 'd', 'c'] as const;

/** `**bold**`, `_italic_` and `{{As Kd}}` inline cards (simulator.md 4.1). Plain text otherwise. */
export function renderInline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /\*\*(.+?)\*\*|_(.+?)_|\{\{(.+?)\}\}/g;
  let last = 0;
  let k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={k++}>{renderInline(m[1])}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k++}>{renderInline(m[2])}</em>);
    else {
      for (const code of (m[3] ?? '').trim().split(/\s+/)) {
        try {
          const c = parseCard(code);
          out.push(
            <span
              key={k++}
              class={`sim-inline-card sim-suit-${SUIT_CLASS[c & 3]}`}
              role="img"
              aria-label={code}
            >
              {RANK_CHARS.charAt(c >> 2).replace('T', '10')}
              {SUIT_GLYPH[c & 3]}
            </span>,
          );
        } catch {
          out.push(code);
        }
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface StepPanelProps {
  step: SceneStep;
  index: number;
  count: number;
  /** Why the last move was refused (the step's hint, or a default). */
  rejection?: { text: string; seq: number } | null;
  /** Show Next (acknowledged / button steps). */
  showNext: boolean;
  onNext: () => void;
  /** The next step starts a new hand: the table shows the finished one until this is pressed. */
  pendingStart: boolean;
  onNextHand: () => void;
}

/** The lesson step: text, hint after a refusal or 20 s idle, "Show the math", Next. */
export function StepPanel({
  step,
  index,
  count,
  rejection,
  showNext,
  onNext,
  pendingStart,
  onNextHand,
}: StepPanelProps) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    const t = setTimeout(() => setIdle(true), 20_000);
    return () => clearTimeout(t);
  }, [step.id, rejection?.seq]);
  const hint = rejection?.text ?? (idle ? step.hint : undefined);
  return (
    <section class="sim-step" aria-label="Lesson step" data-testid="step-panel" data-step={step.id}>
      <p class="sim-step-count">
        Step {Math.min(index + 1, count)} of {count}
      </p>
      <p class="sim-step-text">{renderInline(step.text)}</p>
      {step.math ? (
        <details class="sim-step-math">
          <summary>Show the math</summary>
          <p>{renderInline(step.math)}</p>
        </details>
      ) : null}
      {hint ? (
        <p class="sim-step-hint" role="status" data-testid="step-hint">
          {renderInline(hint)}
        </p>
      ) : null}
      {pendingStart ? (
        <button
          type="button"
          class="sim-btn sim-btn-primary"
          onClick={onNextHand}
          data-testid="next-hand"
        >
          Next hand
        </button>
      ) : showNext ? (
        <button
          type="button"
          class="sim-btn sim-btn-primary"
          onClick={onNext}
          data-testid="step-next"
        >
          Next
        </button>
      ) : null}
    </section>
  );
}
