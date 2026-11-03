import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Felt } from './Felt';
import { Toasts } from './Toasts';
import {
  COALESCE_MS,
  announce,
  flushAnnouncements,
  muteAnnouncements,
  resetAnnouncer,
  subscribeAnnouncements,
} from './announcer';

let heard: [string, string][] = [];
let off = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  heard = [];
  off = subscribeAnnouncements((p, t) => heard.push([p, t]));
});
afterEach(() => {
  off();
  cleanup();
  resetAnnouncer();
  vi.useRealTimers();
});

describe('announcer (I036)', () => {
  it('coalesces messages inside the window into one polite update', () => {
    announce('One.');
    announce('Two.');
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(heard).toEqual([['polite', 'One. Two.']]);
  });
  it('a later message with the same key replaces the earlier one', () => {
    announce('Old.', { dedupeKey: 'k' });
    announce('New.', { dedupeKey: 'k' });
    flushAnnouncements();
    expect(heard).toEqual([['polite', 'New.']]);
  });
  it('keeps polite and assertive apart', () => {
    announce('Fine.');
    announce('Broken.', { politeness: 'assertive' });
    flushAnnouncements();
    expect(heard.sort()).toEqual([
      ['assertive', 'Broken.'],
      ['polite', 'Fine.'],
    ]);
  });
  it('is silent while muted, except for forced messages (auto-play start and summary)', () => {
    const unmute = muteAnnouncements();
    announce('Per-hand chatter.');
    announce('Simulating 100 hands.', { force: true });
    announce('More chatter.');
    unmute();
    announce('After.');
    flushAnnouncements();
    expect(heard).toEqual([['polite', 'Simulating 100 hands. After.']]);
  });
  it('settling a hand is one announcement with the result (hands and toast together)', () => {
    render(
      <>
        <Felt
          orientation="portrait"
          bets={{ ante: 1000, blind: 1000 }}
          labels={{ player: 'pair of kings', dealer: 'pair of nines, qualifies' }}
        />
        <Toasts toasts={[{ id: 1, text: 'Net +$50.' }]} />
      </>,
    );
    vi.advanceTimersByTime(COALESCE_MS);
    expect(heard).toHaveLength(1);
    expect(heard[0]![1]).toContain('You: pair of kings.');
    expect(heard[0]![1]).toContain('Net +$50.');
  });
  it('renders no live region of its own', () => {
    render(<Toasts toasts={[{ id: 1, text: 'Net +$50.' }]} />);
    expect(
      document.querySelectorAll('[aria-live],[role="status"],[role="log"],[role="alert"]'),
    ).toHaveLength(0);
  });
});

describe('announcer region (I036)', () => {
  it('a repeated message changes the region again, so it is spoken again', async () => {
    vi.useRealTimers();
    const { Announcer } = await import('../../app/announcer');
    const { act, render: r } = await import('@testing-library/preact');
    r(<Announcer />);
    const region = document.querySelector('[aria-live=polite]')!;
    const seen: string[] = [];
    const mo = new MutationObserver(() => seen.push(region.textContent ?? ''));
    mo.observe(region, { childList: true, characterData: true, subtree: true });
    const say = async () => {
      announce('Correct.');
      await act(async () => {
        flushAnnouncements();
        await new Promise((res) => setTimeout(res, 60));
      });
    };
    await say();
    await say();
    mo.disconnect();
    // Each repeat clears the region and writes it again: two separate writes of the text.
    expect(seen.filter((t) => t === 'Correct.')).toHaveLength(2);
    expect(seen.filter((t) => t === '')).toHaveLength(2);
  });
  it('keeps what was said before anyone listened, and delivers it to the first listener', () => {
    off();
    announce('Early.');
    flushAnnouncements();
    const got: string[] = [];
    off = subscribeAnnouncements((_p, t) => got.push(t));
    expect(got).toEqual(['Early.']);
  });
});
