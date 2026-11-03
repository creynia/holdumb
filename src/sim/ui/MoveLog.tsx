// Move log disclosure under the session panel (I081). Plain text in lists, newest hand first; it
// never announces (no live region), so auto-play and fast play cannot flood a screen reader.
import './styles/movelog.css';
import { formatLine } from './moveLogData';
import type { LoggedHand } from './moveLogData';
import type { EvMode } from './types';

export interface MoveLogProps {
  hands: readonly LoggedHand[];
  evMode: EvMode;
}

export function MoveLog({ hands, evMode }: MoveLogProps) {
  return (
    <details class="sim-movelog" data-testid="move-log">
      <summary class="sim-movelog-head">
        <span>Move log</span>
        <span class="sim-movelog-count">
          {hands.length} {hands.length === 1 ? 'hand' : 'hands'}
        </span>
      </summary>
      {hands.length === 0 ? (
        <p class="sim-movelog-empty">No hands yet. Each move you make shows up here.</p>
      ) : (
        // A focusable scroll region (keyboard users can scroll it); labelled for screen readers.
        <ol class="sim-movelog-hands" aria-label="Hands, newest first" tabIndex={0}>
          {hands.map((h) => (
            <li key={h.n} class="sim-movelog-hand" data-testid="move-log-hand" data-hand={h.n}>
              <p class="sim-movelog-title">Hand {h.n}</p>
              <ul class="sim-movelog-lines">
                {h.lines.map((l, i) => (
                  <li
                    key={i}
                    data-kind={l.t}
                    {...(l.t === 'result' ? { 'data-net': String(l.net) } : {})}
                  >
                    {formatLine(l, evMode)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
