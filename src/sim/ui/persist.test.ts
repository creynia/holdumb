import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { EMPTY_TOTALS, SimDriver } from '../scene';
import { HISTORY_LIMIT, HISTORY_RECORD_BYTES } from '../engine';
import type { HandRecord } from '../engine';
import { ZERO, eq, frac } from '../math/fraction';
import { riverPreview } from '../math/preview';
import {
  decodeHistory,
  decodeSnapshot,
  decodeTotals,
  encodeSnapshot,
  encodeTotals,
  isHandRecord,
} from './persist';

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
  it('drops repeated hand numbers and rows over the byte budget', () => {
    const big: HandRecord = {
      ...record(7),
      n: 999_999_999,
      w: [100_000_000, 100_000_000],
      net: -999_999_999_999,
      a: [
        ['p', 'check', 'x', '62927171999/20975724000'],
        ['f', 'check', 'm', '5149580311/20975724000'],
        ['r', 'fold', 'm', '999999999999999/999999999999999'],
      ],
    };
    expect(new TextEncoder().encode(JSON.stringify(big)).length).toBeLessThanOrEqual(
      HISTORY_RECORD_BYTES,
    );
    expect(decodeHistory({ v: 1, items: [record(3), record(3), big] }).map((r) => r.n)).toEqual([
      3, 999_999_999,
    ]);
    const huge = { ...record(4), p: 'Qc7d', extra: 'x'.repeat(300) };
    expect(isHandRecord(huge)).toBe(true);
    expect(decodeHistory({ v: 1, items: [huge] })).toEqual([]);
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
      { ...record(12), a: [['r', 'fold', 'm', '1/0']] }, // zero denominator
      { ...record(13), a: [['r', 'fold', 'm', `${'9'.repeat(100_000)}/7`]] }, // 100 kB regret
      { ...record(14), a: [['r', 'fold', 'm', '1234567890123456/7']] }, // over 15 digits
      { ...record(9), w: [1000] },
      { ...record(10), net: 1.5 },
      'junk',
    ];
    const out = decodeHistory({ v: 1, items: [record(1), ...bad, record(11)] });
    expect(out.map((r) => r.n)).toEqual([1, 11]);
    expect(isHandRecord(record(1))).toBe(true);
  });
});

describe('session totals in the snapshot (curriculum 8.5 ledger)', () => {
  it('round-trips exact Fractions through JSON', async () => {
    const d = new SimDriver({
      mode: 'sandbox',
      seed: 5,
      scene: {
        id: 'sandbox',
        version: 1,
        bets: { ante: 1000, trips: 500 },
        startAt: {
          street: 'river',
          deal: {
            player: ['Qc', '7d'],
            dealer: ['Td', 'Ts'],
            flop: ['Kd', 'Jh', '9s'],
            turn: '5c',
            river: '2d',
          },
        },
      },
      preview: (req) => Promise.resolve(riverPreview(req)),
    });
    await d.currentPreview();
    expect((await d.act({ type: 'fold' })).ok).toBe(true);
    const before = d.snapshotData().totals;
    expect(before.mistakeCents.num).not.toBe(0n);
    expect(before.tripsExpectedCents.num).not.toBe(0n);
    const json = JSON.stringify(encodeSnapshot(d));
    expect(json).toContain('"mistakeCents":{"num":"');
    const back = decodeSnapshot(JSON.parse(json) as unknown, 'trips-8-6-5')!;
    const t = back.restore.totals;
    expect(eq(t.expectedCents, before.expectedCents)).toBe(true);
    expect(eq(t.mistakeCents, before.mistakeCents)).toBe(true);
    expect(eq(t.tripsExpectedCents, before.tripsExpectedCents)).toBe(true);
    expect(t.scoredAnteCents).toBe(1000);
    expect(t.tripsWageredCents).toBe(500);
    expect(t.mistakes).toBe(1);
    // A restored driver shows the same ledger.
    const d2 = new SimDriver({
      mode: 'sandbox',
      seed: 1,
      restore: back.restore,
      preview: () => Promise.reject(new Error('no ev')),
    });
    expect(d2.view.session.mistakes).toBe(1);
    expect(d2.view.session.net).toBe(d.view.session.net);
    expect(d2.view.session.luckCents).toBe(d.view.session.luckCents);
  });
  it('migrates a legacy snapshot: float cents round to the cent, missing fields are 0', () => {
    const legacy = {
      hands: 3,
      scored: 2,
      expectedCents: -917.6,
      mistakeCents: 120.4,
      scoredMainCents: -3000,
      tripsCents: 2500,
      decisions: 4,
      mistakes: 2,
    };
    const t = decodeTotals(legacy);
    expect(eq(t.expectedCents, frac(-918))).toBe(true);
    expect(eq(t.mistakeCents, frac(120))).toBe(true);
    expect(eq(t.tripsExpectedCents, ZERO)).toBe(true);
    expect(t.scoredAnteCents).toBe(0);
    expect(t.tripsWageredCents).toBe(0);
    expect(t.hands).toBe(3);
    expect(t.mistakes).toBe(2);
  });
  it('drops malformed fractions and keeps the rest', () => {
    const t = decodeTotals({
      hands: 1,
      expectedCents: { num: '12x', den: '5' },
      mistakeCents: { num: '7', den: '0' },
      tripsExpectedCents: { num: '-3', den: '2' },
      scoredAnteCents: 'ten',
    });
    expect(eq(t.expectedCents, ZERO)).toBe(true);
    expect(eq(t.mistakeCents, ZERO)).toBe(true);
    expect(eq(t.tripsExpectedCents, frac(-3, 2))).toBe(true);
    expect(t.scoredAnteCents).toBe(0);
    expect(t.hands).toBe(1);
    expect(encodeTotals(EMPTY_TOTALS).expectedCents).toEqual({ num: '0', den: '1' });
  });
});
