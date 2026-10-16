import { Simulator, parsePlayParams } from '../../sim';
import type { SceneConfig } from '../../sim';
import { useStore } from '../context';
import { getEvClient } from '../evClient';
import { simSettings } from '../theme';

/**
 * The sandbox. `?seed= ?hole= ?board= ?dealer= ?street= ?strategy= ?speed=` preset a hand (parsed by
 * the sim); a preset hand is never saved over the player's own session.
 */
export function Play({ query }: { query: URLSearchParams }) {
  const store = useStore();
  const s = store.settings;
  const p = parsePlayParams(query);
  const scene: SceneConfig = {
    id: 'sandbox',
    version: 1,
    bankroll: s.defaultBankrollCents,
    ...(p.seed !== undefined ? { seed: p.seed } : {}),
    ...(p.startAt ? { startAt: p.startAt } : {}),
    ...(p.strategy
      ? {
          autoPlay: {
            enabled: true,
            defaultStrategy: { id: p.strategy, ante: s.anteUnitCents, trips: 0 },
          },
        }
      : {}),
    ui: {
      showSettings: true,
      showBankroll: true,
      showHistory: true,
      showSession: true,
      ...(p.speed ? { speed: p.speed } : {}),
    },
  };
  const preset = p.startAt !== undefined || p.seed !== undefined;
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
        snapshot={preset ? undefined : store.sandbox}
        onSnapshot={preset ? undefined : (snap) => store.setSandbox(snap)}
        onPracticeChange={(on) => store.updateSettings({ practice: on })}
      />
      <p class="muted">
        <a href="#/hands" class="inline-link">
          Hand rankings
        </a>
      </p>
    </div>
  );
}
