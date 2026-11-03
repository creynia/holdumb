import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPersistOnce, resetPersistAskForTests, storageState } from '../../src/app/persist';

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

describe('storage state line (I076)', () => {
  it('persistent when persisted() is true', async () => {
    expect(await storageState({ storage: { persisted: () => Promise.resolve(true) } })).toBe(
      'persistent',
    );
  });
  it('best-effort when persisted() is false', async () => {
    expect(await storageState({ storage: { persisted: () => Promise.resolve(false) } })).toBe(
      'best-effort',
    );
  });
  it('null (line hidden) when the API is missing or throws', async () => {
    expect(await storageState({})).toBeNull();
    expect(
      await storageState({ storage: { persisted: () => Promise.reject(new Error('x')) } }),
    ).toBeNull();
  });
});
