import './sim.css';
import type { HandResult } from '../engine';
import { foldRevealText } from './text';

/**
 * D7: after a fold the dealer's cards are revealed (the Felt shows them) and this panel says what
 * the hand would have done: "You would have won $25".
 */
export function FoldReveal({ result }: { result: HandResult }) {
  const o = result.ifPlayed?.outcome;
  return (
    <div class={`sim-reveal sim-reveal-${o ?? 'none'}`} role="status" data-testid="fold-reveal">
      <b>You folded.</b> {foldRevealText(result)}
    </div>
  );
}
