import { describe, expect, it, vi } from 'vitest';
import { makeForegroundChecker } from '../../src/pwa/register';

const MIN = 60 * 1000;

function fakeRegistration() {
  return { update: vi.fn((): Promise<void> => Promise.resolve()) };
}

describe('foreground update check (I075)', () => {
  it('calls update() once for two visible events 10 minutes apart', () => {
    const reg = fakeRegistration();
    const check = makeForegroundChecker(() => reg);
    expect(check(0)).toBe(true);
    expect(check(10 * MIN)).toBe(false);
    expect(reg.update).toHaveBeenCalledTimes(1);
  });
  it('calls update() again once an hour has passed (61 minutes apart)', () => {
    const reg = fakeRegistration();
    const check = makeForegroundChecker(() => reg);
    check(0);
    expect(check(61 * MIN)).toBe(true);
    expect(reg.update).toHaveBeenCalledTimes(2);
  });
  it('does nothing before a registration exists', () => {
    const check = makeForegroundChecker(() => null);
    expect(check(0)).toBe(false);
  });
  it('a failed check does not throw and is retried on the next foreground', async () => {
    let fail = true;
    const reg = {
      update: vi.fn(() =>
        fail ? Promise.reject(new Error('offline')) : Promise.resolve(undefined),
      ),
    };
    const check = makeForegroundChecker(() => reg);
    expect(check(0)).toBe(true);
    await Promise.resolve();
    fail = false;
    // The failed attempt still counts toward the hour, so the next foreground inside it is skipped.
    expect(check(5 * MIN)).toBe(false);
    expect(check(61 * MIN)).toBe(true);
    expect(reg.update).toHaveBeenCalledTimes(2);
  });
});
