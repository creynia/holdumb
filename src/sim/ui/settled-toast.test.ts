import { describe, expect, it } from 'vitest';
import type { DriverEvent, SceneConfig } from '../scene';
import { SimDriver } from '../scene';
import { settledToastText } from './text';

// A full house (aces full of kings) on the river: a Trips win at the preset in use.
const deal = {
  player: ['As', 'Ad'],
  flop: ['Ah', 'Ks', 'Kd'],
  turn: '2c',
  river: '9h',
  dealer: ['Td', 'Ts'],
} as const;

async function settledToast(
  mode: 'scene' | 'sandbox',
  rules: SceneConfig['rules'],
  settingsPaytable: 'trips-9-7-4' | 'trips-8-6-5',
): Promise<string> {
  const events: DriverEvent[] = [];
  const scene: SceneConfig = {
    id: 't',
    version: 1,
    bets: { ante: 1000, trips: 500 },
    ...(rules ? { rules } : {}),
    startAt: { street: 'river', deal },
  };
  const d = new SimDriver({
    scene,
    mode,
    seed: 5,
    paytable: settingsPaytable,
    preview: () => Promise.reject(new Error('no preview in this test')),
    onEvent: (e) => events.push(e),
  });
  await d.act({ type: 'play', multiple: 1 });
  const settled = events.find((e) => e.type === 'hand-settled');
  if (!settled || settled.type !== 'hand-settled') throw new Error('hand did not settle');
  return settledToastText(settled);
}

describe('the settled toast names the preset the hand settled at (I011 review)', () => {
  it('scene rules win over the Settings preset: 8/6/5 even with 9/7/4 in Settings', async () => {
    const text = await settledToast('scene', undefined, 'trips-9-7-4');
    expect(text).toContain('full house pays 8 to 1 on Trips 8/6/5');
    expect(text).toContain('Trips +$40');
  });
  it('a scene that sets its own Trips preset names that preset', async () => {
    const text = await settledToast('scene', { trips: 'trips-7-6-5' }, 'trips-9-7-4');
    expect(text).toContain('full house pays 7 to 1 on Trips 7/6/5');
    expect(text).toContain('Trips +$35');
  });
  it('sandbox uses the Settings preset', async () => {
    const text = await settledToast('sandbox', undefined, 'trips-9-7-4');
    expect(text).toContain('full house pays 9 to 1 on Trips 9/7/4');
    expect(text).toContain('Trips +$45');
  });
});
