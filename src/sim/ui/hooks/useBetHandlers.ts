// Betting on the felt: the selected rack chip, taps on the Ante / Trips circles and Clear.
import { useState } from 'preact/hooks';
import { maxAnte } from '../../engine';
import type { Cents } from '../../engine';
import type { CircleId, SimDriver } from '../../scene';
import type { DriverAction } from './useSimDriver';

export interface BetHandlers {
  chip: Cents;
  setChip: (c: Cents) => void;
  onCircle: (id: CircleId) => void;
  clearBets: () => void;
}

export function useBetHandlers(
  d: SimDriver,
  act: (a: DriverAction) => Promise<unknown>,
  defaultChip: Cents = 500,
): BetHandlers {
  const [chip, setChip] = useState<Cents>(defaultChip);
  const state = d.view.state;
  const street = state.street;
  const settled = street === 'settled';
  const onCircle = (id: CircleId) => {
    d.tap(id);
    if ((id !== 'ante' && id !== 'trips') || (street !== 'betting' && !settled)) return;
    const cur = state.bets[id];
    const cap = id === 'ante' ? maxAnte(state) : state.rules.tripsMax;
    const amount = Math.min(cur + chip, cap);
    if (amount === cur || amount <= 0) return;
    void act({ type: 'set-bet', wager: id, amount });
  };
  const clearBets = () => {
    if (settled) return void act({ type: 'clear' });
    void (async () => {
      if (state.bets.trips > 0) await act({ type: 'set-bet', wager: 'trips', amount: 0 });
      await act({ type: 'set-bet', wager: 'ante', amount: state.rules.anteMin });
    })();
  };
  return { chip, setChip, onCircle, clearBets };
}
