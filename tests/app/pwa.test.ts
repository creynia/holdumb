import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeForegroundChecker, registerSW } from '../../src/pwa/register';

const MIN = 60 * 1000;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

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
  it('a failed check is swallowed, and it still uses up that hour', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      let fail = true;
      const reg = {
        update: vi.fn((): Promise<void> =>
          fail ? Promise.reject(new Error('offline')) : Promise.resolve(),
        ),
      };
      const check = makeForegroundChecker(() => reg);
      expect(check(0)).toBe(true);
      await tick();
      expect(unhandled).not.toHaveBeenCalled();
      fail = false;
      expect(check(5 * MIN)).toBe(false);
      expect(check(61 * MIN)).toBe(true);
      expect(reg.update).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('registerSW foreground wiring (I075)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    document.body.innerHTML = '';
    delete (document as { visibilityState?: string }).visibilityState;
  });

  it('adds no visibility listener in dev', () => {
    vi.stubEnv('DEV', true);
    const add = vi.spyOn(document, 'addEventListener');
    registerSW();
    expect(add).not.toHaveBeenCalledWith('visibilitychange', expect.anything());
    add.mockRestore();
  });

  it('adds no visibility listener in the single-file build', () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('__SINGLE_FILE__', true);
    const add = vi.spyOn(document, 'addEventListener');
    registerSW();
    expect(add).not.toHaveBeenCalledWith('visibilitychange', expect.anything());
    add.mockRestore();
  });

  it('a visible event checks for an update and a hidden event does not', async () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('__SINGLE_FILE__', false);
    const reg = fakeRegistration();
    const sw = {
      controller: null,
      addEventListener: vi.fn(),
      register: vi.fn(() =>
        Promise.resolve({ ...reg, waiting: null, installing: null, addEventListener: vi.fn() }),
      ),
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
    registerSW();
    window.dispatchEvent(new Event('load'));
    await tick();
    await tick();
    expect(sw.register).toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).toHaveBeenCalledTimes(1);
  });
});
