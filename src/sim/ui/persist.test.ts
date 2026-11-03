import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { SimDriver } from '../scene';
import { HISTORY_LIMIT, HISTORY_RECORD_BYTES } from '../engine';
import type { HandRecord } from '../engine';
import { decodeHistory, decodeSnapshot, encodeSnapshot, isHandRecord } from './persist';

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
  it('a legacy snapshot with a practice flag restores and maps onto evMode (D39)', () => {
    const d = driver();
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as Record<string, unknown>;
    expect(snap.evMode).toBe('before');
    delete snap.evMode;
    const on = decodeSnapshot({ ...snap, practice: true }, 'trips-8-6-5')!;
    expect(on.evMode).toBe('after');
    expect(on.restore.state.hand?.deal).toEqual(d.view.state.hand?.deal);
    expect(decodeSnapshot({ ...snap, practice: false }, 'trips-8-6-5')!.evMode).toBe('before');
    expect(decodeSnapshot(snap, 'trips-8-6-5')!.evMode).toBe('before');
    // A valid evMode wins over the legacy key; junk falls back to the legacy mapping.
    expect(
      decodeSnapshot({ ...snap, practice: true, evMode: 'never' }, 'trips-8-6-5')!.evMode,
    ).toBe('never');
    expect(decodeSnapshot({ ...snap, practice: true, evMode: 'x' }, 'trips-8-6-5')!.evMode).toBe(
      'after',
    );
    expect(encodeSnapshot(d, 'never').evMode).toBe('never');
  });
});

describe('hand history in the snapshot (simulator.md 3.7)', () => {
  const record = (n: number): HandRecord => ({
    n,
    p: 'Qc7d',
    d: 'TdTs',
    b: 'KdJh9s5c2d',
    w: [1000, 500],
    a: [
      ['p', 'check', 'b', '0'],
      ['f', 'check'],
      ['r', 'fold', 'm', '317/990'],
    ],
    net: -2000,
  });
  it('round-trips the last hands, newest first, each within the byte budget', async () => {
    const d = driver();
    expect((await d.act({ type: 'fold' })).ok).toBe(true);
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as {
      history: { v: number; items: HandRecord[] };
    };
    expect(snap.history.v).toBe(1);
    expect(snap.history.items).toHaveLength(1);
    expect(snap.history.items[0]!.p).toBe('3c4d');
    expect(JSON.stringify(snap.history.items[0]).length).toBeLessThanOrEqual(HISTORY_RECORD_BYTES);
    const back = decodeSnapshot(snap, 'trips-8-6-5')!;
    expect(back.restore.history).toEqual(d.view.history);
  });
  it('ignores an unknown history version and a missing block, and caps at 50', () => {
    expect(decodeHistory(undefined)).toEqual([]);
    expect(decodeHistory({ v: 2, items: [record(1)] })).toEqual([]);
    expect(decodeHistory({ v: 1, items: 'nope' })).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => record(i + 1));
    expect(decodeHistory({ v: 1, items: many })).toHaveLength(HISTORY_LIMIT);
    const d = driver();
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(d))) as Record<string, unknown>;
    delete snap.history;
    expect(decodeSnapshot(snap, 'trips-8-6-5')!.restore.history).toEqual([]);
  });
  it('drops malformed records and keeps the good ones', () => {
    const bad: unknown[] = [
      { ...record(2), p: 'QcQc' }, // duplicate card
      { ...record(3), b: 'KdJh9s' }, // short board
      { ...record(4), d: 'Qc2c' }, // dealer shares a hole card
      { ...record(5), a: [['x', 'fold']] }, // bad street
      { ...record(6), a: [['r', 'raise']] }, // bad choice
      { ...record(7), a: [['r', 'fold', 'z', '1/2']] }, // bad tier
      { ...record(8), a: [['r', 'fold', 'm', '0.32']] }, // not a ratio
      { ...record(9), w: [1000] },
      { ...record(10), net: 1.5 },
      'junk',
    ];
    const out = decodeHistory({ v: 1, items: [record(1), ...bad, record(11)] });
    expect(out.map((r) => r.n)).toEqual([1, 11]);
    expect(isHandRecord(record(1))).toBe(true);
  });
});
