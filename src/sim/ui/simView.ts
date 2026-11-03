// Pure helpers for the Simulator: decision streets, auto-play-only scenes, felt
// labels and highlights.
import type { Deal, HandResult } from '../engine';
import type { CircleId, OptionKey, SceneConfig } from '../scene';
import { handLabel, handName, playerNearMiss } from './text';

export const isDecisionStreet = (s: string): boolean =>
  s === 'preflop' || s === 'flop' || s === 'river';

/** An auto-play-only scene: no table, just the auto-play panel (and the step text). */
export const autoOnlyOf = (scene: SceneConfig): boolean =>
  !!scene.autoPlay?.enabled && scene.allowedActions?.length === 0 && !scene.deals && !scene.startAt;

/** The hand names printed on the felt once the hand is settled. */
export function resultLabels(
  result: HandResult | null,
  deal?: Deal,
): { player?: string; dealer?: string } {
  return {
    player: result ? handLabel(result.player, playerNearMiss(result, deal)) : undefined,
    dealer: result
      ? `${handName(result.dealer)}${result.dealerQualifies ? ', qualifies' : ''}`
      : undefined,
  };
}

/** A step's highlight list split into bet circles and ActionBar options. */
export function splitHighlight(highlight: readonly string[]): [CircleId[], OptionKey[]] {
  return [
    highlight.filter((h): h is CircleId => ['ante', 'blind', 'play', 'trips'].includes(h)),
    highlight.filter((h): h is OptionKey => h === 'check' || h === 'fold' || h.startsWith('play-')),
  ];
}
