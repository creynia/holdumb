import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptionKey } from '../scene';
import { ActionBar, optionsFor } from './ActionBar';
import { DEAL_SHORTCUT, OPTION_SHORTCUT, pressShortcut, shortcutOf } from './shortcuts';

afterEach(cleanup);

const key = (k: string, over: Partial<KeyboardEventInit> = {}, target?: EventTarget) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...over });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
};

describe('keyboard shortcuts (I047)', () => {
  it('aria-keyshortcuts on every button matches what the handler maps the key to', () => {
    for (const street of ['preflop', 'flop', 'river'] as const) {
      const { unmount } = render(<ActionBar street={street} />);
      for (const k of optionsFor(street)) {
        const btn = document.querySelector<HTMLElement>(`[data-option="${k}"]`)!;
        const short = btn.getAttribute('aria-keyshortcuts')!;
        expect(short).toBe(OPTION_SHORTCUT[k]);
        expect(btn.title).toContain(`(${short})`);
        expect(shortcutOf(key(short))).toEqual({ kind: 'option', option: k });
        expect(shortcutOf(key(short.toLowerCase()))).toEqual({ kind: 'option', option: k });
      }
      unmount();
    }
    for (const street of ['betting', 'settled'] as const) {
      const { unmount } = render(<ActionBar street={street} />);
      const btn = document.querySelector<HTMLElement>('[data-slot="bc"]')!;
      expect(btn.getAttribute('aria-keyshortcuts')).toBe(DEAL_SHORTCUT);
      expect(shortcutOf(key('d'))).toEqual({ kind: 'deal' });
      unmount();
    }
  });
  it('ignores modifiers, repeats, typing in a field and Enter on a control', () => {
    expect(shortcutOf(key('4', { ctrlKey: true }))).toBeNull();
    expect(shortcutOf(key('4', { metaKey: true }))).toBeNull();
    expect(shortcutOf(key('4', { altKey: true }))).toBeNull();
    expect(shortcutOf(key('4', { repeat: true }))).toBeNull();
    const input = document.createElement('input');
    document.body.append(input);
    expect(shortcutOf(key('4', {}, input))).toBeNull();
    const button = document.createElement('button');
    document.body.append(button);
    expect(shortcutOf(key('Enter', {}, button))).toBeNull();
    expect(shortcutOf(key('Enter', {}, document.body))).toEqual({ kind: 'deal' });
    expect(shortcutOf(key('x'))).toBeNull();
    input.remove();
    button.remove();
  });
  it('presses only an offered, enabled button: a hidden option ignores its key', () => {
    const onOption = vi.fn();
    const { container } = render(
      <ActionBar street="preflop" allowed={['check', 'play-4']} onOption={onOption} />,
    );
    expect(pressShortcut(container, { kind: 'option', option: 'play-3' })).toBe(false);
    expect(onOption).not.toHaveBeenCalled();
    expect(pressShortcut(container, { kind: 'option', option: 'play-4' })).toBe(true);
    expect(onOption).toHaveBeenCalledWith('play-4' satisfies OptionKey);
    // The flop has no Bet 4x at all.
    cleanup();
    const r = render(<ActionBar street="flop" onOption={onOption} />);
    expect(pressShortcut(r.container, { kind: 'option', option: 'play-4' })).toBe(false);
    cleanup();
    const onDeal = vi.fn();
    const b = render(<ActionBar street="betting" canDeal={false} onDeal={onDeal} />);
    expect(pressShortcut(b.container, { kind: 'deal' })).toBe(false);
    cleanup();
    render(<ActionBar street="betting" onDeal={onDeal} />);
    fireEvent.click(screen.getByText('Deal'));
    expect(onDeal).toHaveBeenCalledTimes(1);
  });
});
