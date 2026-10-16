import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { SimDriver } from '../scene';
import { decodeSnapshot, encodeSnapshot } from './persist';

const driver = (state?: ReturnType<typeof createGame>) =>
  new SimDriver({
    mode: 'sandbox',
    seed: 5,
    scene: {
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'river',
        deal: {
          player: ['3c', '4d'],
          flop: ['Ah', 'Ks', 'Qd'],
          turn: '9c',
          river: '7h',
          dealer: ['Td', 'Ts'],
        },
      },
    },
    preview: () => Promise.reject(new Error('no ev')),
    ...(state ? {} : {}),
  });

describe('sandbox snapshot', () => {
  it('restores a mid-hand table exactly (reloading is no escape from a bad river)', () => {
    const d = driver();
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as unknown;
    const back = decodeSnapshot(snap, 'trips-8-6-5')!;
    expect(back.restore.state.street).toBe('river');
    expect(back.restore.state.hand?.deal).toEqual(d.view.state.hand?.deal);
    expect(back.restore.state.bets).toEqual(d.view.state.bets);
    const d2 = new SimDriver({
      mode: 'sandbox',
      seed: 1,
      restore: back.restore,
      preview: () => Promise.reject(new Error('no ev')),
    });
    expect(d2.view.state.street).toBe('river');
    expect(d2.view.state.bets.ante).toBeGreaterThan(0);
  });
  it('drops anything malformed', () => {
    expect(decodeSnapshot(null, 'trips-8-6-5')).toBeNull();
    expect(decodeSnapshot({ v: 2 }, 'trips-8-6-5')).toBeNull();
    const d = driver();
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as { state: { hand: unknown } };
    snap.state.hand = null;
    expect(decodeSnapshot(snap, 'trips-8-6-5')).toBeNull();
  });
});
