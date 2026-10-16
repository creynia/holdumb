import './sim.css';
import './container.css';
import { useState } from 'preact/hooks';
import { formatMoney } from '../engine';
import type { SessionView } from '../scene';

export interface SessionPanelProps {
  session: SessionView;
  /** D26: opening the panel counts as a tap. */
  onTap?: () => void;
  defaultOpen?: boolean;
}

const m = (c: number, sign = false): string => formatMoney(Math.round(c), { sign });

/** Luck vs mistake cost: your result, what perfect play expects, what your moves cost, the rest is luck. */
export function SessionPanel({ session: s, onTap, defaultOpen }: SessionPanelProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const toggle = () => {
    setOpen((o) => !o);
    onTap?.();
  };
  const perfect = s.expectedCents;
  return (
    <section class="sim-session" aria-label="Session" data-testid="session-panel">
      <button
        type="button"
        class="sim-session-head"
        aria-expanded={open}
        onClick={toggle}
        data-testid="session-toggle"
      >
        <span>Session</span>
        <span class="sim-money">
          {s.hands} {s.hands === 1 ? 'hand' : 'hands'} · {m(s.net, true)}
        </span>
      </button>
      {open ? (
        <dl class="sim-session-body">
          <div>
            <dt>Your result</dt>
            <dd class="sim-money" data-testid="session-net-detail">
              {m(s.net, true)}
            </dd>
          </div>
          {s.scored > 0 ? (
            <>
              <div>
                <dt>Perfect play expects</dt>
                <dd class="sim-money">{m(perfect, true)}</dd>
              </div>
              <div>
                <dt>Your mistakes cost</dt>
                <dd class="sim-money" data-testid="session-mistakes">
                  {m(-s.mistakeCents, true)}
                </dd>
              </div>
              <div>
                <dt>Luck</dt>
                <dd class="sim-money" data-testid="session-luck">
                  {m(s.luckCents, true)}
                </dd>
              </div>
            </>
          ) : (
            <p class="sim-muted">Play a hand with the EV sheet to see luck and mistakes.</p>
          )}
          {s.tripsCents !== 0 ? (
            <div>
              <dt>Trips</dt>
              <dd class="sim-money">{m(s.tripsCents, true)}</dd>
            </div>
          ) : null}
          {s.hands > s.scored ? (
            <p class="sim-muted">
              {s.hands - s.scored} hands had no EV, so they are left out of the split.
            </p>
          ) : null}
          <p class="sim-muted">
            Your result = perfect play + mistakes + luck. Cards and EV amounts are exact; the split
            is for the hands you played.
          </p>
        </dl>
      ) : null}
    </section>
  );
}
