import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPersistOnce, resetPersistAskForTests } from '../../src/app/persist';

describe('persistent storage request (I076)', () => {
  beforeEach(() => resetPersistAskForTests());

  it('calls persist once, and not again on later completions', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const nav = { storage: { persist } };
    expect(await requestPersistOnce(nav)).toBe(true);
    expect(await requestPersistOnce(nav)).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('does nothing when the API is missing', async () => {
    expect(await requestPersistOnce({})).toBeNull();
    expect(await requestPersistOnce(undefined)).toBeNull();
  });
  it('a rejected call is swallowed', async () => {
    const nav = { storage: { persist: () => Promise.reject(new Error('denied')) } };
    expect(await requestPersistOnce(nav)).toBeNull();
  });
});
