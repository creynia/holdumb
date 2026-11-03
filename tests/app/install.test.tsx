import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallButton } from '../../src/app/components/InstallButton';

function offerInstall(): ReturnType<typeof vi.fn> {
  const prompt = vi.fn(() => Promise.resolve({ outcome: 'accepted' }));
  const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: unknown };
  ev.prompt = prompt;
  window.dispatchEvent(ev);
  return prompt;
}

async function mountButton(): Promise<HTMLElement> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(() => render(<InstallButton />, el));
  return el;
}

function setStandalone(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (q: string) => ({ matches: matches && q.includes('standalone') }) as MediaQueryList,
  );
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Install app button (I054)', () => {
  it('is hidden by default', async () => {
    setStandalone(false);
    const el = await mountButton();
    expect(el.querySelector('button')).toBeNull();
  });
  it('is hidden in standalone mode even when the browser offers an install', async () => {
    setStandalone(true);
    const el = await mountButton();
    offerInstall();
    await act(() => {});
    expect(el.querySelector('button')).toBeNull();
  });
  it('appears after beforeinstallprompt and calls prompt() on click', async () => {
    setStandalone(false);
    const el = await mountButton();
    const prompt = offerInstall();
    await act(() => {});
    const btn = el.querySelector('button');
    expect(btn?.textContent).toBe('Install app');
    await act(() => {
      btn!.click();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    await act(() => {});
    expect(el.querySelector('button')).toBeNull();
  });
  it('hides itself after the app is installed', async () => {
    setStandalone(false);
    const el = await mountButton();
    offerInstall();
    await act(() => {});
    expect(el.querySelector('button')).not.toBeNull();
    await act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(el.querySelector('button')).toBeNull();
  });
});
