import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { EMPTY_TOTALS, SimDriver } from '../scene';
import { ZERO, eq, frac } from '../math/fraction';
import { riverPreview } from '../math/preview';
import { decodeSnapshot, decodeTotals, encodeSnapshot, encodeTotals } from './persist';

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
