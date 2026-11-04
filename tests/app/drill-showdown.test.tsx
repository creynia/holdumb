import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '../../src/app/context';
import { DrillShowdown } from '../../src/app/screens/DrillShowdown';
import { MemoryStorage } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import {
  flushAnnouncements,
  resetAnnouncer,
  subscribeAnnouncements,
} from '../../src/sim/ui/announcer';

// Pair of kings with an ace kicker beats pair of kings with a queen kicker: you win, the dealer
// qualifies, and the Blind pushes (a win below a straight).
const KICKER = 's:KdAc.Ks7h4c2d9s.KhQc';

async function mount(query: string, store = new Store(new MemoryStorage())) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(() => {
    render(
      <AppProviders store={store}>
        <DrillShowdown query={new URLSearchParams(query)} seed={5} />
      </AppProviders>,
      el,
    );
  });
  return { el, store };
}
const tap = (el: HTMLElement, group: string, value: string) =>
  act(() =>
    el
      .querySelector<HTMLButtonElement>(
        `[data-testid="showdown-${group}"] [data-value="${value}"]`,
      )!
      .click(),
  );

beforeEach(() => {
  document.body.innerHTML = '';
  resetAnnouncer();
});

describe('Drill: read the showdown (I061)', () => {
  it('shows all nine cards and three questions, and grades after the third tap', async () => {
    const { el, store } = await mount(`mode=showdown&spot=${KICKER}`);
    expect(el.querySelectorAll('.sd-spot .pc')).toHaveLength(9);
    expect(el.querySelector('[data-testid="showdown-feedback"]')).toBeNull();
    await tap(el, 'winner', 'you');
    await tap(el, 'qualifies', 'yes');
    expect(el.querySelector('[data-testid="showdown-feedback"]')).toBeNull();
    await tap(el, 'blind', 'pushes');
    const fb = el.querySelector('[data-testid="showdown-feedback"]')!;
    expect(fb.getAttribute('data-all')).toBe('right');
    expect(fb.textContent).toContain('All three right.');
    // The engine's result text, with its kicker wording, and the Blind rule.
    expect(fb.textContent).toContain(
      "Your pair of kings, ace kicker beats the dealer's pair of kings",
    );
    expect(fb.textContent).toContain('only pays for a straight or better');
    expect(store.drill.showdown).toMatchObject({
      winner: { answered: 1, correct: 1 },
      qualifies: { answered: 1, correct: 1 },
      blind: { answered: 1, correct: 1 },
      spots: 1,
      allRight: 1,
    });
  });
  it('grades each question separately and records a miss per question type', async () => {
    const { el, store } = await mount(`mode=showdown&spot=${KICKER}`);
    await tap(el, 'winner', 'tie');
    await tap(el, 'qualifies', 'no');
    await tap(el, 'blind', 'pushes');
    const fb = el.querySelector('[data-testid="showdown-feedback"]')!;
    expect(fb.getAttribute('data-all')).toBe('miss');
    expect(fb.textContent).toContain('Winner: you said Tie, it is You');
    expect(fb.textContent).toContain('Dealer qualifies: you said No, it is Yes');
    expect(fb.textContent).toContain('Blind: right');
    expect(store.drill.showdown).toMatchObject({
      winner: { answered: 1, correct: 0 },
      qualifies: { answered: 1, correct: 0 },
      blind: { answered: 1, correct: 1 },
      spots: 1,
      allRight: 0,
    });
  });
  it('highlights the five that play: the cards outside them are dimmed after grading', async () => {
    const { el } = await mount(`mode=showdown&spot=${KICKER}`);
    expect(el.querySelectorAll('.pc-out')).toHaveLength(0);
    await tap(el, 'winner', 'you');
    await tap(el, 'qualifies', 'yes');
    await tap(el, 'blind', 'pushes');
    // Your five: Kd Ks pair + Ac 9s 7h. The dealer plays the same pair of kings with Qc: the 4c and 2d play for neither.
    const out = [...el.querySelectorAll('.pc-out')].map((n) => n.getAttribute('aria-label'));
    expect(out).toEqual(["Four of clubs, doesn't play", "Two of diamonds, doesn't play"]);
    expect(el.querySelector('[aria-label="King of diamonds, plays"]')).toBeTruthy();
  });
  it('locks the answers after grading, and is announced once', async () => {
    const heard: string[] = [];
    const off = subscribeAnnouncements((_p, t) => heard.push(t));
    const { el } = await mount(`mode=showdown&spot=${KICKER}`);
    await tap(el, 'winner', 'you');
    await tap(el, 'qualifies', 'yes');
    await tap(el, 'blind', 'pushes');
    flushAnnouncements();
    off();
    expect(heard).toHaveLength(1);
    expect(heard[0]).toContain('All three right.');
    const btns = el.querySelectorAll<HTMLButtonElement>('.sd-q button');
    expect([...btns].every((b) => b.disabled)).toBe(true);
  });
  it('a spot code in the URL reproduces the deal; a bad one deals a fresh spot into the URL', async () => {
    location.hash = '#/drill';
    const { el } = await mount('mode=showdown&spot=nonsense');
    expect(location.hash).toMatch(/^#\/drill\?mode=showdown&spot=s:/);
    const code = new URLSearchParams(location.hash.split('?')[1]).get('spot')!;
    expect(code).toMatch(/^s:[2-9TJQKA][shdc]{1}/);
    expect(el).toBeTruthy();
  });
  it('the not-playing cue is an edge, never a dim of the ink', () => {
    const css = readFileSync('src/app/styles/app.css', 'utf8');
    const rule = /\.pc-out\s*{([^}]*)}/.exec(css);
    expect(rule).toBeTruthy();
    expect(rule![1]).toContain('border-style: dashed');
    expect(rule![1]).not.toMatch(/opacity|filter|(^|[\s;{])color:/);
  });
  it('a board card in only one of the two fives keeps its normal edge (union rule, as on the felt)', async () => {
    // You play A K Q J 9; the dealer plays three fours with K Q. The 9h is yours alone, the 4c is
    // the dealer's alone, and only the 2s misses both.
    const { el } = await mount('mode=showdown&spot=s:AhJc.9hKsQd4c2s.4h4d');
    await tap(el, 'winner', 'you');
    await tap(el, 'qualifies', 'yes');
    await tap(el, 'blind', 'loses');
    const out = [...el.querySelectorAll('.pc-out')].map((n) => n.getAttribute('aria-label'));
    expect(out).toEqual(["Two of spades, doesn't play"]);
    expect(el.querySelector('[aria-label="Nine of hearts, plays"]')).toBeTruthy();
    expect(el.querySelector('[aria-label="Four of clubs, plays"]')).toBeTruthy();
  });
  it('the marked cards keep readable ink: every suit colour is >= 4.5:1 on the card, edge >= 3:1', () => {
    const css = readFileSync('src/app/styles/app.css', 'utf8');
    const tokens = readFileSync('src/app/styles/tokens.css', 'utf8');
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lin = (c: number) =>
      c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4;
    const lum = (rgb: number[]) =>
      0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const tok = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)![1]!;
    for (const ink of ['suit-s', 'suit-h', 'suit-d', 'suit-c', 'suit4-d', 'suit4-c'])
      expect(ratio(tok(ink), tok('card')), ink).toBeGreaterThanOrEqual(4.5);
    const edge = /\.pc-out\s*{[^}]*border-color:\s*(#[0-9a-fA-F]{6})/.exec(css)![1]!;
    expect(ratio(edge, tok('card'))).toBeGreaterThanOrEqual(3);
    expect(ratio(edge, tok('bg'))).toBeGreaterThanOrEqual(3);
  });
  it('says "a pair of ..." when you win with a pair, and names the straight that pays the Blind', async () => {
    let { el } = await mount(`mode=showdown&spot=${KICKER}`);
    await tap(el, 'winner', 'you');
    await tap(el, 'qualifies', 'yes');
    await tap(el, 'blind', 'pushes');
    expect(el.querySelector('[data-testid="showdown-feedback"]')!.textContent).toContain(
      'You win with a pair of kings, but the Blind only pays',
    );
    document.body.innerHTML = '';
    ({ el } = await mount('mode=showdown&spot=s:9c8d.7h6s5c2d3h.AdKs'));
    await tap(el, 'winner', 'you');
    await tap(el, 'qualifies', 'no');
    await tap(el, 'blind', 'pays');
    expect(el.querySelector('[data-testid="showdown-feedback"]')!.textContent).toMatch(
      /You win with a [a-z-]*straight/,
    );
  });
});
