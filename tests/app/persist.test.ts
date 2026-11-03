import { describe, expect, it, vi } from 'vitest';
import { requestPersistOnce, storageState } from '../../src/app/persist';

describe('persistent storage request (I076)', () => {
  it('asks once, stores the answer, and never asks again once answered', async () => {
    const persist = vi.fn(() => Promise.resolve(false));
    const save = vi.fn();
    const nav = { storage: { persist, persisted: () => Promise.resolve(false) } };
    expect(await requestPersistOnce(nav, 'no', save)).toBe(false);
    expect(save).toHaveBeenLastCalledWith('denied');
    expect(persist).toHaveBeenCalledTimes(1);
    // A refusal is remembered: the next visit (asked = 'denied') never prompts again.
    expect(await requestPersistOnce(nav, 'denied', save)).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('a stored grant also stops the request', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    expect(await requestPersistOnce({ storage: { persist } }, 'granted', vi.fn())).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });
  it('skips the request when persisted() is already true, and records the grant', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const save = vi.fn();
    const nav = { storage: { persist, persisted: () => Promise.resolve(true) } };
    expect(await requestPersistOnce(nav, 'no', save)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith('granted');
  });
  it('does nothing when the API is missing (nothing to record)', async () => {
    const save = vi.fn();
    expect(await requestPersistOnce({}, 'no', save)).toBeNull();
    expect(await requestPersistOnce(undefined, 'no', save)).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it('a rejected call is recorded as a refusal and swallowed', async () => {
    const save = vi.fn();
    const nav = { storage: { persist: () => Promise.reject(new Error('denied')) } };
    expect(await requestPersistOnce(nav, 'no', save)).toBeNull();
    expect(save).toHaveBeenCalledWith('denied');
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
