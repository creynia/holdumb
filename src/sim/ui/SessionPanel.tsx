import './sim.css';
import './container.css';
import { useState } from 'preact/hooks';
import { formatMoney } from '../engine';
import { GAME_EDGE } from '../math';
import type { SessionView } from '../scene';
import { fmtPct, typographic } from './text';

export interface SessionPanelProps {
  session: SessionView;
  /** D26: opening the panel counts as a tap. */
  onTap?: () => void;
  defaultOpen?: boolean;
}

/** Money with the real minus sign (curriculum 8.6). */
const m = (c: number, sign = false): string => typographic(formatMoney(Math.round(c), { sign }));

/**
 * Session panel (curriculum 8.5): your result, total wagered, what perfect play expects, what your
 * decisions cost (with the mistake count), luck, your edge per Ante against perfect play, and the
 * Trips and Six Card lines. Expected figures are exact and rounded once, so the rows add up to the cent.
 */
export function SessionPanel({ session: s, onTap, defaultOpen }: SessionPanelProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const toggle = () => {
    setOpen((o) => !o);
    onTap?.();
  };
  // Watched hands (I078) are neither scored nor "no EV": they have their own line.
  const unscored = s.hands - s.scored - s.watchedHands;
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
          {s.topUpCents > 0 ? (
            <div>
              <dt>Topped up</dt>
              <dd class="sim-money" data-testid="session-topups">
                {m(s.topUpCents)}
              </dd>
            </div>
          ) : null}
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
                <dd data-testid="session-mistakes">
                  {s.mistakes} {s.mistakes === 1 ? 'mistake' : 'mistakes'} ·{' '}
                  <span class="sim-money">{m(0 - s.mistakesRoundedCents, true)}</span>
                  {s.mistakeSpots.length > 0 ? (
                    <>
                      {' '}
                      <a
                        class="sim-session-review"
                        data-testid="session-review"
                        href={`#/drill?focus=${s.mistakeSpots.join(',')}`}
                      >
                        Review {s.mistakeSpots.length}{' '}
                        {s.mistakeSpots.length === 1 ? 'mistake' : 'mistakes'}
                      </a>
                    </>
                  ) : null}
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
                  <dd data-testid="session-edge">
                    <span class="sim-money">{typographic(fmtPct(s.edgePerAnte, 2))}</span>{' '}
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
              <dd data-testid="session-trips">
                wagered <span class="sim-money">{m(s.tripsWageredCents)}</span> · expected{' '}
                <span class="sim-money">{m(s.tripsExpectedRoundedCents, true)}</span> · actual{' '}
                <span class="sim-money">{m(s.tripsCents, true)}</span>
              </dd>
            </div>
          ) : null}
          {s.watchedHands > 0 ? (
            <div>
              <dt>Watched (perfect play)</dt>
              <dd data-testid="session-watched">
                {s.watchedHands} {s.watchedHands === 1 ? 'hand' : 'hands'} ·{' '}
                <span class="sim-money">{m(s.watchedCents, true)}</span>, not counted as your play
              </dd>
            </div>
          ) : null}
          {s.sixCardWageredCents > 0 ? (
            <div>
              <dt>Six Card</dt>
              <dd data-testid="session-six-card">
                wagered <span class="sim-money">{m(s.sixCardWageredCents)}</span> · expected{' '}
                <span class="sim-money">{m(s.sixCardExpectedRoundedCents, true)}</span> · actual{' '}
                <span class="sim-money">{m(s.sixCardCents, true)}</span>
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
            Your result = perfect play + mistakes + luck
            {s.watchedHands > 0 ? ' + watched hands' : ''}, to the cent. Expected amounts are exact
            and rounded once: what you get on average over many sessions, not a forecast.
          </p>
        </dl>
      ) : null}
    </section>
  );
}
