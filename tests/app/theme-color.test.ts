import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyTheme } from '../../src/app/theme';
import type { Settings } from '../../src/app/settings';

const settings = (theme: Settings['theme']) =>
  ({
    theme,
    reduceMotion: false,
    animationSpeed: 'normal',
    fourColorDeck: false,
  }) as unknown as Settings;

describe('browser chrome colour follows the theme (I046)', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<meta id="theme-color-light" name="theme-color" content="#f6f4ee" media="(prefers-color-scheme: light)">' +
      '<meta id="theme-color-dark" name="theme-color" content="#0e1620" media="(prefers-color-scheme: dark)">';
  });
  afterEach(() => {
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
  });
  const pair = () => [
    document.getElementById('theme-color-light')!,
    document.getElementById('theme-color-dark')!,
  ];

  it('dark forces the dark chrome on both metas', () => {
    applyTheme(settings('dark'));
    for (const m of pair()) {
      expect(m.getAttribute('content')).toBe('#0e1620');
      expect(m.hasAttribute('media')).toBe(false);
    }
  });
  it('light forces the light chrome on both metas', () => {
    applyTheme(settings('dark'));
    applyTheme(settings('light'));
    for (const m of pair()) {
      expect(m.getAttribute('content')).toBe('#f6f4ee');
      expect(m.hasAttribute('media')).toBe(false);
    }
  });
  it('system restores the media pair', () => {
    applyTheme(settings('dark'));
    applyTheme(settings('system'));
    const [light, dark] = pair();
    expect(light!.getAttribute('content')).toBe('#f6f4ee');
    expect(light!.getAttribute('media')).toBe('(prefers-color-scheme: light)');
    expect(dark!.getAttribute('content')).toBe('#0e1620');
    expect(dark!.getAttribute('media')).toBe('(prefers-color-scheme: dark)');
  });
});
