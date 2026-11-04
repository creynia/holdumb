import { describe, expect, it } from 'vitest';
import type { DriverEvent } from '../scene';
import { soundOf } from './soundEvents';

const settled = (net: number) =>
  ({ type: 'hand-settled', result: { net } as never, state: {} as never }) as DriverEvent;
const confirmed = (action: object) =>
  ({ type: 'action-confirmed', action, events: [], state: {} as never }) as unknown as DriverEvent;

describe('soundOf', () => {
  it('maps events to sounds', () => {
    expect(soundOf(confirmed({ type: 'deal' }))).toBe('deal');
    expect(soundOf(confirmed({ type: 'set-bet', wager: 'ante', amount: 500 }))).toBe('chip');
    expect(soundOf(confirmed({ type: 'set-bet', wager: 'trips', amount: 0 }))).toBeNull();
    expect(soundOf(confirmed({ type: 'check' }))).toBeNull();
    expect(soundOf(settled(100))).toBe('win');
    expect(soundOf(settled(-100))).toBe('lose');
    expect(soundOf(settled(0))).toBe('push');
    expect(soundOf({ type: 'ready' })).toBeNull();
  });
});
