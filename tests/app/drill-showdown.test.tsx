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
});
