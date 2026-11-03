// Pure helpers for the Simulator: decision streets, auto-play-only scenes, felt
// labels and highlights.
import type { HandResult } from '../engine';
import type { CircleId, OptionKey, SceneConfig } from '../scene';
import { handName } from './text';

export const isDecisionStreet = (s: string): boolean =>
  s === 'preflop' || s === 'flop' || s === 'river';

/** An auto-play-only scene: no table, just the auto-play panel (and the step text). */
export const autoOnlyOf = (scene: SceneConfig): boolean =>
  !!scene.autoPlay?.enabled && scene.allowedActions?.length === 0 && !scene.deals && !scene.startAt;

/** The hand names printed on the felt once the hand is settled. */
export function resultLabels(result: HandResult | null): { player?: string; dealer?: string } {
  return {
    player: result ? handName(result.player) : undefined,
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
