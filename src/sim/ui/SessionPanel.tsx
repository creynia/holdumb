import './sim.css';
import './container.css';
import { useState } from 'preact/hooks';
import { formatMoney } from '../engine';
import { GAME_EDGE } from '../math';
import type { SessionView } from '../scene';
import { fmtPct } from './text';

export interface SessionPanelProps {
  session: SessionView;
  /** D26: opening the panel counts as a tap. */
  onTap?: () => void;
  defaultOpen?: boolean;
}

const m = (c: number, sign = false): string => formatMoney(Math.round(c), { sign });

/**
 * Session panel (curriculum 8.5): your result, total wagered, what perfect play expects, what your
 * decisions cost (with the mistake count), luck, your edge per Ante against perfect play, and the
 * Trips line. Expected figures are exact and rounded once, so the rows add up to the cent.
 */
export function SessionPanel({ session: s, onTap, defaultOpen }: SessionPanelProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const toggle = () => {
    setOpen((o) => !o);
    onTap?.();
  };
  const unscored = s.hands - s.scored;
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
          {s.wageredCents > 0 ? (
            <div>
              <dt>Total wagered</dt>
              <dd class="sim-money" data-testid="session-wagered">
                {m(s.wageredCents)}
              </dd>
            </div>
          ) : null}
          {s.scored > 0 ? (
            <>
              <div>
                <dt>Perfect play expects</dt>
                <dd class="sim-money" data-testid="session-perfect">
                  {m(s.perfectCents, true)}
                </dd>
              </div>
              <div>
                <dt>Decisions vs perfect</dt>
                <dd class="sim-money" data-testid="session-mistakes">
                  {s.mistakes} {s.mistakes === 1 ? 'mistake' : 'mistakes'} ·{' '}
                  {m(0 - s.mistakesRoundedCents, true)}
                </dd>
              </div>
              <div>
                <dt>Luck</dt>
                <dd class="sim-money" data-testid="session-luck">
                  {m(s.luckCents, true)}
                </dd>
              </div>
              {s.edgePerAnte ? (
                <div>
                  <dt>Your edge per Ante</dt>
                  <dd class="sim-money" data-testid="session-edge">
                    {fmtPct(s.edgePerAnte, 2)}{' '}
                    <span class="sim-muted">(perfect play {fmtPct(GAME_EDGE, 2)})</span>
                  </dd>
                </div>
              ) : null}
            </>
          ) : (
            <p class="sim-muted">Play a hand with the EV sheet to see luck and mistakes.</p>
          )}
          {s.tripsWageredCents > 0 ? (
            <div>
              <dt>Trips</dt>
              <dd class="sim-money" data-testid="session-trips">
                wagered {m(s.tripsWageredCents)} · expected {m(s.tripsExpectedRoundedCents, true)} ·
                actual {m(s.tripsCents, true)}
              </dd>
            </div>
          ) : null}
          {unscored > 0 ? (
            <p class="sim-muted">
              {unscored} {unscored === 1 ? 'hand' : 'hands'} had no EV, so{' '}
              {unscored === 1 ? 'its' : 'their'} result counts as luck.
            </p>
          ) : null}
          <p class="sim-muted">
            Your result = perfect play + mistakes + luck, to the cent. Expected amounts are exact
            and rounded once; "expected" means on average over many sessions, not what you will win
            or lose.
          </p>
        </dl>
      ) : null}
    </section>
  );
}
