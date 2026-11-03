import { describe, expect, it } from 'vitest';
import { getEvClient } from '../../src/app/evClient';
import '../../src/app/test-hook';

describe('e2e test hook (I042)', () => {
  it('reuses the app client and creates the in-thread client once, on access', () => {
    const hook = window.__holdumb!;
    expect(hook.client).toBe(getEvClient());
    expect(hook.inthread).toBe(hook.inthread);
    expect(hook.inthread).not.toBe(hook.client);
    expect(hook.inthread.mode).toBe('inthread');
  });
});
