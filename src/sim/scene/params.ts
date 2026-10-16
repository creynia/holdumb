// Play-route URL presets (architecture.md 2.1): ?hole= ?board= ?dealer= ?street= ?seed= ?strategy= ?speed=
import { parseCards, cardCode } from '../engine';
import type { DecisionStreet, ForcedDeal } from '../engine';
import { STRATEGY_IDS } from '../strategy/ids';
import type { StrategyId } from '../strategy/types';
import type { SceneConfig } from './types';

export interface PlayParams {
  startAt?: NonNullable<SceneConfig['startAt']>;
  seed?: number;
  strategy?: StrategyId;
  speed?: 'normal' | 'fast' | 'instant';
}

const NEED = { preflop: 0, flop: 3, river: 5 } as const;

/** Anything malformed is ignored (the table just starts normally). Never throws. */
export function parsePlayParams(query: URLSearchParams): PlayParams {
  const out: PlayParams = {};
  const seed = query.get('seed');
  if (seed !== null && /^-?\d{1,10}$/.test(seed)) out.seed = Number(seed) | 0;
  const strategy = query.get('strategy');
  if (strategy && (STRATEGY_IDS as readonly string[]).includes(strategy))
    out.strategy = strategy as StrategyId;
  const speed = query.get('speed');
  if (speed === 'normal' || speed === 'fast' || speed === 'instant') out.speed = speed;
  try {
    const hole = parseCards(query.get('hole') ?? '');
    if (hole.length !== 2) return out;
    const board = parseCards(query.get('board') ?? '');
    const dealer = parseCards(query.get('dealer') ?? '');
    if (![0, 3, 5].includes(board.length) || ![0, 2].includes(dealer.length)) return out;
    parseCards([...hole, ...board, ...dealer].map(cardCode).join('')); // disjoint
    const asked = query.get('street');
    const street: DecisionStreet =
      asked === 'preflop' || asked === 'flop' || asked === 'river'
        ? asked
        : board.length === 0
          ? 'preflop'
          : board.length === 3
            ? 'flop'
            : 'river';
    if (board.length < NEED[street]) return out;
    const c = (i: number): string => cardCode(board[i]!);
    const deal: ForcedDeal = {
      player: [cardCode(hole[0]!), cardCode(hole[1]!)],
      ...(dealer.length === 2
        ? { dealer: [cardCode(dealer[0]!), cardCode(dealer[1]!)] as const }
        : {}),
      ...(board.length >= 3 ? { flop: [c(0), c(1), c(2)] as const } : {}),
      ...(board.length === 5 ? { turn: c(3), river: c(4) } : {}),
    };
    out.startAt = { street, deal };
  } catch {
    /* malformed presets are ignored */
  }
  return out;
}
