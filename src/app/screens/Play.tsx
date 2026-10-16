import { parseCards, Simulator } from '../../sim';
import type { ForcedDeal, SceneConfig } from '../../sim';
import { useStore } from '../context';
import { getEvClient } from '../evClient';
import { simSettings } from '../theme';

/** `?hole=AsKd&board=QhJh2c` -> a mid-hand start. Anything malformed is ignored. */
export function startAtFromQuery(query: URLSearchParams): SceneConfig['startAt'] {
  try {
    const hole = parseCards(query.get('hole') ?? '');
    const board = parseCards(query.get('board') ?? '');
    if (hole.length !== 2 || ![0, 3, 5].includes(board.length)) return undefined;
    parseCards(`${query.get('hole') ?? ''}${query.get('board') ?? ''}`); // disjoint
    const codes = (s: string | null) => (s ?? '').replace(/[\s,]+/g, '');
    const h = codes(query.get('hole'));
    const b = codes(query.get('board'));
    const c = (str: string, i: number) => str.slice(i * 2, i * 2 + 2);
    const deal: ForcedDeal = {
      player: [c(h, 0), c(h, 1)],
      ...(board.length >= 3 ? { flop: [c(b, 0), c(b, 1), c(b, 2)] as const } : {}),
      ...(board.length === 5 ? { turn: c(b, 3), river: c(b, 4) } : {}),
    };
    const street = board.length === 0 ? 'preflop' : board.length === 3 ? 'flop' : 'river';
    return { street, deal };
  } catch {
    return undefined;
  }
}

export function Play({ query }: { query: URLSearchParams }) {
  const store = useStore();
  const s = store.settings;
  const startAt = startAtFromQuery(query);
  const seed = Number(query.get('seed'));
  const scene: SceneConfig = {
    id: 'sandbox',
    version: 1,
    bankroll: s.defaultBankrollCents,
    ...(Number.isInteger(seed) && query.get('seed') ? { seed } : {}),
    ...(startAt ? { startAt } : {}),
    ui: { showSettings: true, showBankroll: true, showHistory: true, showSession: true },
  };
  return (
    <div class="page page-wide">
      <h1 class="sr">Practice table</h1>
      <Simulator
        key={`${scene.bankroll}:${query.toString()}`}
        scene={scene}
        mode="sandbox"
        settings={simSettings(s)}
        evClient={getEvClient()}
        persistKey="holdumb:sandbox"
      />
      <p class="muted">
        <a href="#/hands" class="inline-link">
          Hand rankings
        </a>
      </p>
    </div>
  );
}
