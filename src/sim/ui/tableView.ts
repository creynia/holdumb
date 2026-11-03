// Pure derivations from the driver view for the table components: what the felt, the status bar
// and the action bar show this render.
import { equity } from '../engine';
import type { HandResult } from '../engine';
import type { CircleId, OptionKey, SimDriver } from '../scene';
import { handName } from './text';

export const isDecisionStreet = (s: string): boolean =>
  s === 'preflop' || s === 'flop' || s === 'river';

/** Whether EVs are shown at all (a step's showEV wins over the scene's). */
export const evShownOf = (view: SimDriver['view']): boolean =>
  (view.step?.showEV ?? view.scene.showEV) !== false;

export function tableView(view: SimDriver['view']) {
  const { scene, step, state } = view;
  const hand = state.hand;
  const settled = state.street === 'settled';
  const result: HandResult | null = hand?.result ?? null;
  const dealerShown = settled || !!(step?.revealDealer ?? scene.revealDealer);
  const labels = {
    player: result ? handName(result.player) : undefined,
    dealer: result
      ? `${handName(result.dealer)}${result.dealerQualifies ? ', qualifies' : ''}`
      : undefined,
  };
  const board = hand ? hand.deal.board.slice(0, hand.boardShown) : [];
  const onFelt = settled ? 0 : Object.values(state.bets).reduce((a, b) => a + b, 0);
  const eq = equity(state);
  const highlight = (step?.highlight ?? scene.highlight ?? []) as readonly string[];
  const circleHl = highlight.filter((h): h is CircleId =>
    ['ante', 'blind', 'play', 'trips'].includes(h),
  );
  const optionHl = highlight.filter(
    (h): h is OptionKey => h === 'check' || h === 'fold' || h.startsWith('play-'),
  );
  return { result, dealerShown, labels, board, onFelt, eq, circleHl, optionHl };
}

export type TableView = ReturnType<typeof tableView>;
