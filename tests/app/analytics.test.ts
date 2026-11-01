import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COUNT_URL,
  analyticsEnabled,
  countUrl,
  pagePath,
  trackEvent,
  trackPage,
} from '../../src/app/analytics';

const env = (hostname: string, nav: Record<string, unknown> = {}, protocol = 'https:') => ({
  location: { hostname, protocol },
  navigator: nav,
});

describe('analyticsEnabled', () => {
  it('is on only for https creynia.com', () => {
    expect(analyticsEnabled(env('creynia.com'))).toBe(true);
    expect(analyticsEnabled(env('www.creynia.com'))).toBe(true);
    expect(analyticsEnabled(env('localhost'))).toBe(false);
    expect(analyticsEnabled(env('creynia.github.io'))).toBe(false);
    expect(analyticsEnabled(env('', {}, 'file:'))).toBe(false);
    expect(analyticsEnabled(env('creynia.com', {}, 'http:'))).toBe(false);
  });
  it('is off for automated browsers, Do Not Track and Global Privacy Control', () => {
    expect(analyticsEnabled(env('creynia.com', { webdriver: true }))).toBe(false);
    expect(analyticsEnabled(env('creynia.com', { doNotTrack: '1' }))).toBe(false);
    expect(analyticsEnabled(env('creynia.com', { globalPrivacyControl: true }))).toBe(false);
  });
  it('is off in the test DOM (localhost)', () => {
    expect(analyticsEnabled()).toBe(false);
  });
});

describe('countUrl', () => {
  it('builds a GoatCounter /count URL', () => {
    const u = new URL(countUrl({ path: '/holdumb/#/learn/x', title: 'T', event: true }, 390));
    expect(u.origin + u.pathname).toBe(COUNT_URL);
    expect(u.searchParams.get('p')).toBe('/holdumb/#/learn/x');
    expect(u.searchParams.get('t')).toBe('T');
    expect(u.searchParams.get('e')).toBe('true');
    expect(u.searchParams.get('s')).toBe('390');
    expect(u.searchParams.has('r')).toBe(false);
  });
});

describe('pagePath', () => {
  it('maps hash routes onto the app path', () => {
    expect(pagePath('/holdumb/', '/')).toBe('/holdumb/');
    expect(pagePath('/holdumb/index.html', '/learn/x')).toBe('/holdumb/#/learn/x');
  });
});

describe('track*', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends nothing when disabled', () => {
    const img = vi.fn();
    vi.stubGlobal('Image', img);
    trackPage('/holdumb/');
    trackEvent('lesson-complete/welcome');
    expect(img).not.toHaveBeenCalled();
  });
});
