import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { SimDriver } from '../scene';
import { encodeSnapshot } from './persist';
import { Simulator } from './Simulator';
import { DEFAULT_SIM_SETTINGS } from './types';
import type { SceneConfig } from '../scene';

const settings = { ...DEFAULT_SIM_SETTINGS, animationSpeed: 'instant' as const };
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)));

afterEach(cleanup);

function mount(scene?: SceneConfig, extra: Partial<Parameters<typeof Simulator>[0]> = {}) {
  const evClient = createEvClient({ mode: 'inthread' });
  const out = render(
    <Simulator settings={settings} evClient={evClient} scene={scene} {...extra} />,
  );
  return { evClient, ...out };
}

describe('Simulator container', () => {
  it('renders the table options row only in the sandbox with settings shown (I090)', () => {
    const opts = <p data-testid="opts">options</p>;
    const a = mount(
      { id: 'sandbox', version: 1, ui: { showSettings: true } },
      { options: opts, mode: 'sandbox' },
    );
    expect(screen.getByTestId('opts')).toBeTruthy();
    a.evClient.dispose();
    cleanup();
    const b = mount(
      {
        id: 'l',
        version: 1,
        ui: { showSettings: true },
        steps: [{ id: 's', text: 'Tap Deal.', completeWhen: { action: { type: 'deal' } } }],
      },
      { options: opts, mode: 'scene' },
    );
    expect(screen.queryByTestId('opts')).toBeNull();
    b.evClient.dispose();
    cleanup();
    const c = mount({ id: 'sandbox', version: 1 }, { options: opts, mode: 'sandbox' });
    expect(screen.queryByTestId('opts')).toBeNull();
    c.evClient.dispose();
  });
  it('sandbox: one tap acts with the default settings (no sheet, D40)', async () => {
    const { evClient } = mount({ id: 'sandbox', version: 1, seed: 7, bankroll: 50_000 });
    fireEvent.click(screen.getByText('Deal'));
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
    );
    fireEvent.click(document.querySelector('[data-option="play-4"]')!);
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
    );
    expect(screen.queryByTestId('ev-sheet')).toBeNull();
    evClient.dispose();
  });
  it('sandbox with confirmOn all: Deal shows the preflop decision with EV before confirming', async () => {
    const { evClient } = mount(
      { id: 'sandbox', version: 1, seed: 7, bankroll: 50_000 },
      { settings: { ...settings, confirmOn: 'all' } },
    );
    expect(screen.getByTestId('bankroll').textContent).toBe('$480');
    fireEvent.click(screen.getByText('Deal'));
    await waitFor(() => expect(document.querySelector('[data-option="play-4"]')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
    );
    fireEvent.click(document.querySelector('[data-option="play-4"]')!);
    await flush();
    expect(screen.getByTestId('ev-sheet').textContent).toMatch(/exact/);
    fireEvent.click(screen.getByTestId('confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
    );
    evClient.dispose();
  });
  it('a preset flop hand shows both options with one best badge', async () => {
    const { evClient } = mount({
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'flop',
        deal: { player: ['Ah', '7c'], flop: ['7d', 'Ks', '2c'], dealer: ['9d', '9s'] },
      },
    });
    await waitFor(
      () => expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
      {
        timeout: 8000,
      },
    );
    expect(document.querySelectorAll('.is-best').length).toBe(1);
    evClient.dispose();
  });
  it('a worse option shows the better alternative in the sheet', async () => {
    const { evClient } = mount(
      {
        id: 'sandbox',
        version: 1,
        startAt: {
          street: 'river',
          deal: {
            player: ['3c', '4d'],
            flop: ['Ah', 'Ks', 'Qd'],
            turn: '9c',
            river: '7h',
            dealer: ['Td', 'Ts'],
          },
        },
      },
      { settings: { ...settings, confirmOn: 'all' } },
    );
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
    );
    fireEvent.click(document.querySelector('[data-option="play-1"]')!);
    await waitFor(() => expect(screen.getByTestId('alternative')).toBeTruthy());
    expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('river');
    evClient.dispose();
  });
  it('a scene step refuses the wrong move with its hint and no retry button', async () => {
    const scene: SceneConfig = {
      id: 'x',
      version: 1,
      showEV: false,
      steps: [
        {
          id: 'a',
          text: 'Bet **4x**.',
          hint: 'Use the Bet 4x button.',
          startAt: { street: 'preflop', deal: { player: ['As', 'Ad'] } },
          allowedActions: ['check', 'play'],
          expect: [{ type: 'play', option: 'play-4' }],
          completeWhen: { street: 'settled' },
        },
      ],
    };
    const { evClient } = mount(scene);
    await flush();
    fireEvent.click(document.querySelector('[data-option="check"]')!);
    await waitFor(() =>
      expect(screen.getByTestId('step-hint').textContent).toMatch(/Bet 4x button/),
    );
    expect(screen.queryByText(/try again/i)).toBeNull();
    fireEvent.click(document.querySelector('[data-option="play-4"]')!);
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
    );
    evClient.dispose();
  });
  it('restores a legacy snapshot (practice flag) with the default settings (D39)', () => {
    const src = new SimDriver({
      mode: 'sandbox',
      seed: 5,
      scene: {
        id: 'sandbox',
        version: 1,
        startAt: {
          street: 'river',
          deal: {
            player: ['3c', '4d'],
            flop: ['Ah', 'Ks', 'Qd'],
            turn: '9c',
            river: '7h',
            dealer: ['Td', 'Ts'],
          },
        },
      },
      preview: () => Promise.reject(new Error('no ev')),
    });
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(src))) as Record<string, unknown>;
    delete snap.evMode;
    const { evClient } = mount(
      { id: 'sandbox', version: 1 },
      { snapshot: { ...snap, practice: true }, settings: DEFAULT_SIM_SETTINGS },
    );
    expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('river');
    evClient.dispose();
  });
  it('hand history: a settled sandbox hand adds a row when ui.showHistory; a lesson shows none', async () => {
    const scene: SceneConfig = {
      id: 'sandbox',
      version: 1,
      bets: { ante: 1000 },
      ui: { showHistory: true },
      startAt: {
        street: 'river',
        deal: {
          player: ['3c', '4d'],
          flop: ['Ah', 'Ks', 'Qd'],
          turn: '9c',
          river: '7h',
          dealer: ['Td', 'Ts'],
        },
      },
    };
    const { evClient } = mount(scene, { replayHref: (q) => `#/play?${q}` });
    expect(screen.queryByTestId('hand-history')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
    );
    fireEvent.click(document.querySelector('[data-option="fold"]')!); // one tap acts (D40)
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
    );
    const rows = screen.getAllByTestId('hand-history-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('fold (best)');
    fireEvent.click(within(rows[0]!).getByRole('button'));
    expect(screen.getByTestId('replay-spot').getAttribute('href')).toBe(
      '#/play?hole=3c4d&board=AhKsQd9c7h&dealer=TdTs&street=river',
    );
    evClient.dispose();
    cleanup();
    const lesson = mount({ ...scene, ui: {} });
    expect(screen.queryByTestId('hand-history')).toBeNull();
    lesson.evClient.dispose();
  });
  it('stores the table evMode in the sandbox snapshot', async () => {
    const snaps: unknown[] = [];
    const { evClient } = mount(
      { id: 'sandbox', version: 1, seed: 7, bankroll: 50_000 },
      { settings: { ...settings, evMode: 'after' }, onSnapshot: (x) => snaps.push(x) },
    );
    fireEvent.click(screen.getByText('Deal'));
    await waitFor(() => expect(snaps.length).toBeGreaterThan(0));
    expect((snaps.at(-1) as { evMode: string }).evMode).toBe('after');
    evClient.dispose();
  });
  it('evMode never: no EV on the table and one tap acts', async () => {
    const { evClient } = mount(
      {
        id: 'sandbox',
        version: 1,
        startAt: {
          street: 'river',
          deal: {
            player: ['3c', '4d'],
            flop: ['Ah', 'Ks', 'Qd'],
            turn: '9c',
            river: '7h',
            dealer: ['Td', 'Ts'],
          },
        },
      },
      { settings: { ...settings, evMode: 'never' } },
    );
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
    );
    expect(document.querySelectorAll('.is-best').length).toBe(0);
    expect(document.querySelector('[data-option="play-1"]')!.textContent).not.toMatch(/\$/);
    fireEvent.click(document.querySelector('[data-option="play-1"]')!);
    await waitFor(() =>
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
    );
    expect(screen.queryByTestId('ev-sheet')).toBeNull();
    evClient.dispose();
  });

  describe('status-bar Details (I092)', () => {
    const FLOP: SceneConfig = {
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'flop',
        deal: { player: ['Ah', '7c'], flop: ['7d', 'Ks', '2c'], dealer: ['9d', '9s'] },
      },
    };
    const ready = () =>
      waitFor(() => expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'), {
        timeout: 8000,
      });
    it('EV before: Details sits in the third column and opens the sheet on the best option without acting', async () => {
      const { evClient } = mount(FLOP);
      await ready();
      const btn = screen.getByTestId('ev-details');
      expect(btn.getAttribute('aria-label')).toBe('EV details');
      expect(btn.closest('div')!.textContent).toContain('EV');
      expect(screen.getByRole('group', { name: /decision/i })).toBeTruthy();
      fireEvent.click(btn);
      await flush();
      const sheet = screen.getByTestId('ev-sheet');
      const best = document.querySelector('.is-best')!.getAttribute('data-option');
      expect(sheet.textContent).toMatch(
        new RegExp(`Confirm ${best === 'check' ? 'Check' : 'Bet 2x'}`),
      );
      // nothing was played
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('flop');
      // the button is not offered while the sheet is open
      expect(screen.queryByTestId('ev-details')).toBeNull();
      fireEvent.click(screen.getByTestId('confirm'));
      await waitFor(() =>
        expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
      );
      evClient.dispose();
    });
    it('Cancel gives focus back to Details', async () => {
      const { evClient } = mount(FLOP);
      await ready();
      fireEvent.click(screen.getByTestId('ev-details'));
      await flush();
      fireEvent.keyDown(screen.getByTestId('ev-sheet'), { key: 'Escape' });
      await act(() => new Promise((r) => setTimeout(r, 20)));
      expect(screen.getByTestId('ev-details')).toBe(document.activeElement);
      evClient.dispose();
    });
    it('in a lesson step Details feeds `previewed` like tapping an option', async () => {
      const events: string[] = [];
      const scene = {
        id: 'det',
        version: 1,
        bankroll: 50_000,
        bets: { ante: 1000 },
        showEV: true,
        steps: [
          {
            id: 'deal',
            text: 'Deal.',
            deals: [{ player: ['As', 'Ad'] }],
            allowedActions: ['deal'],
            completeWhen: { action: { type: 'deal' } },
          },
          {
            id: 'compare',
            text: 'Read the best line.',
            allowedActions: ['check', 'play'],
            confirmOn: 'all',
            expect: [{ type: 'fold' }],
            completeWhen: { previewed: { option: 'play-4' } },
          },
          {
            id: 'end',
            text: 'Done.',
            allowedActions: [],
            completeWhen: { acknowledged: true },
            advance: 'button',
          },
        ],
      } as unknown as SceneConfig;
      const { evClient } = mount(scene, {
        onEvent: (e) => {
          if (e.type === 'step-completed') events.push(e.stepId);
        },
      });
      fireEvent.click(screen.getByText('Deal'));
      await waitFor(() => expect(screen.queryByTestId('ev-details')).toBeTruthy());
      await ready();
      expect(events).toEqual(['deal']);
      fireEvent.click(screen.getByTestId('ev-details'));
      await flush();
      expect(events).toEqual(['deal', 'compare']); // previewed(play-4) fired from Details
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('preflop');
      evClient.dispose();
    });
    it('a gated step never opens Details on an option it hides', async () => {
      // AA preflop: Bet 4x is best, but the step only allows Check and Bet 3x.
      const scene = {
        id: 'gated',
        version: 1,
        bankroll: 50_000,
        bets: { ante: 1000 },
        showEV: true,
        steps: [
          {
            id: 'deal',
            text: 'Deal.',
            deals: [{ player: ['As', 'Ad'] }],
            allowedActions: ['deal'],
            completeWhen: { action: { type: 'deal' } },
          },
          {
            id: 'read',
            text: 'Read.',
            allowedActions: ['check', 'play'],
            allowedOptions: ['play-3', 'check'],
            confirmOn: 'all',
            expect: [{ type: 'fold' }],
            completeWhen: { previewed: { option: 'check' } },
          },
        ],
      } as unknown as SceneConfig;
      const { evClient } = mount(scene);
      fireEvent.click(screen.getByText('Deal'));
      await waitFor(() => expect(screen.queryByTestId('ev-details')).toBeTruthy());
      await ready();
      fireEvent.click(screen.getByTestId('ev-details'));
      await flush();
      expect(screen.getByTestId('ev-sheet')).toBeTruthy();
      // the best option (Bet 4x) is hidden by the step, so the sheet opens on an allowed one
      expect(screen.getByTestId('confirm').textContent).toMatch(/^Confirm (Bet 3x|Check)$/);
      evClient.dispose();
    });
    it.each([['after'], ['never']] as const)('absent with EV %s', async (evMode) => {
      const { evClient } = mount(FLOP, { settings: { ...settings, evMode } });
      await ready();
      expect(screen.queryByTestId('ev-details')).toBeNull();
      expect(screen.getByTestId('hand-result').textContent).toContain('Hand');
      evClient.dispose();
    });
    it('absent while betting; on a settled hand the result wins', async () => {
      const { evClient } = mount({ id: 'sandbox', version: 1, seed: 7, bankroll: 50_000 });
      expect(screen.queryByTestId('ev-details')).toBeNull(); // betting
      fireEvent.click(screen.getByText('Deal'));
      await waitFor(() => expect(screen.queryByTestId('ev-details')).toBeTruthy());
      await ready();
      fireEvent.click(document.querySelector('[data-option="play-4"]')!); // one tap acts (D40)
      await waitFor(() =>
        expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
      );
      expect(screen.queryByTestId('ev-details')).toBeNull();
      expect(screen.getByTestId('hand-result').textContent).toMatch(/Won|Lost|Push|Folded/);
      evClient.dispose();
    });
  });

  describe('narration toast Details and the same-tick guard (I094)', () => {
    const FLOP_SCENE: SceneConfig = {
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'flop',
        deal: { player: ['Ah', 'Tc'], flop: ['7d', 'Ks', '2c'], dealer: ['9d', '9s'] },
      },
    };
    const ready = () =>
      waitFor(() => expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'), {
        timeout: 8000,
      });
    it('one tap acts, the toast offers Details, Details opens the reveal and Esc returns focus to it', async () => {
      const { evClient } = mount(FLOP_SCENE);
      await ready();
      fireEvent.click(document.querySelector('[data-option="check"]')!);
      await waitFor(() =>
        expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('river'),
      );
      const btn = await screen.findByTestId('toast-details');
      expect(btn.textContent).toBe('Details');
      expect(screen.queryByTestId('ev-sheet')).toBeNull();
      fireEvent.click(btn);
      await flush();
      const sheet = screen.getByTestId('ev-sheet');
      expect(screen.getByTestId('reveal-result').textContent).toMatch(/Check/);
      expect(sheet).toBeTruthy();
      fireEvent.keyDown(sheet, { key: 'Escape' });
      await act(() => new Promise((r) => setTimeout(r, 20)));
      expect(screen.queryByTestId('ev-sheet')).toBeNull();
      expect(screen.getByTestId('toast-details')).toBe(document.activeElement);
      evClient.dispose();
    });
    it('Continue (not only Esc) returns focus to the toast Details button', async () => {
      const { evClient } = mount(FLOP_SCENE, { settings: { ...settings, confirmOn: 'never' } });
      await ready();
      fireEvent.click(document.querySelector('[data-option="check"]')!);
      const btn = await screen.findByTestId('toast-details');
      fireEvent.click(btn);
      await flush();
      const cont = [...document.querySelectorAll('button')].find(
        (b) => b.textContent === 'Continue',
      );
      expect(cont, 'the reveal has a Continue button').toBeTruthy();
      fireEvent.click(cont!);
      await act(() => new Promise((r) => setTimeout(r, 20)));
      expect(screen.queryByTestId('ev-sheet')).toBeNull();
      expect(screen.getByTestId('toast-details')).toBe(document.activeElement);
      evClient.dispose();
    });
    it('no toast and no button with EV never; with EV after the reveal opens by itself', async () => {
      const never = mount(FLOP_SCENE, { settings: { ...settings, evMode: 'never' } });
      await ready();
      fireEvent.click(document.querySelector('[data-option="check"]')!);
      await waitFor(() =>
        expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('river'),
      );
      expect(screen.queryByTestId('toast-details')).toBeNull();
      never.evClient.dispose();
      cleanup();
      const after = mount(FLOP_SCENE, { settings: { ...settings, evMode: 'after' } });
      await ready();
      fireEvent.click(document.querySelector('[data-option="check"]')!);
      await waitFor(() => expect(screen.queryByTestId('ev-sheet')).toBeTruthy());
      expect(screen.queryByTestId('toast-details')).toBeNull();
      after.evClient.dispose();
    });
    it('two clicks in the same tick play one move, never "You cannot check here."', async () => {
      const { evClient } = mount(FLOP_SCENE);
      await ready();
      const check = document.querySelector('[data-option="check"]')!;
      await act(() => {
        // Both clicks run before the first act has been awaited.
        check.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        check.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await waitFor(() =>
        expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('river'),
      );
      await flush();
      expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('river');
      const toasts = [...document.querySelectorAll('.sim-toast')].map((t) => t.textContent);
      expect(toasts.join(' ')).not.toMatch(/cannot|Working on the last move/i);
      evClient.dispose();
    });
  });

  describe('hand verdict line (I059)', () => {
    const RIVER_19: SceneConfig = {
      id: 'sandbox',
      version: 1,
      startAt: {
        street: 'river',
        deal: {
          player: ['Qc', '7d'],
          flop: ['Kd', 'Jh', '9s'],
          turn: '5c',
          river: '2d',
          dealer: ['Td', 'Ts'],
        },
      },
    };
    const playRiver = async (
      option: string,
      extra: Partial<Parameters<typeof Simulator>[0]> = {},
      scene = RIVER_19,
    ) => {
      const m = mount(scene, extra);
      await waitFor(() =>
        expect(screen.getByTestId('simulator').getAttribute('data-ev')).toBe('ready'),
      );
      fireEvent.click(document.querySelector(`[data-option="${option}"]`)!);
      await flush();
      const confirm = screen.queryByTestId('confirm');
      if (confirm) fireEvent.click(confirm);
      await waitFor(() =>
        expect(screen.getByTestId('simulator').getAttribute('data-street')).toBe('settled'),
      );
      return m;
    };
    it('a best play: "Played it right" rides on the one result toast', async () => {
      const { evClient } = await playRiver('play-1');
      const toast = document.querySelectorAll('.sim-toast');
      expect(toast).toHaveLength(1);
      expect(toast[0]!.textContent).toMatch(
        /Played it right\. Expected [+\u2212]\$[\d.,]+, result [+\u2212]?\$[\d.,]+\./,
      );
      evClient.dispose();
    });
    it('a single mistake is not described twice: the narration has the cost, the verdict the figures', async () => {
      const { evClient } = await playRiver('fold');
      const text = document.querySelector('.sim-toast')!.textContent;
      expect(text).toMatch(
        /^Fold: (a small mistake|a mistake|a big mistake), costs \$[\d.,]+ against /,
      );
      expect(text).toMatch(/Expected [+\u2212]\$[\d.,]+, result [+\u2212]?\$[\d.,]+\.(Details)?$/);
      expect(text).not.toMatch(/on average/);
      evClient.dispose();
    });
    it('hidden when EV is never shown; shown with EV after the move', async () => {
      const never = await playRiver('fold', { settings: { ...settings, evMode: 'never' } });
      expect(document.querySelector('.sim-toast')!.textContent).not.toMatch(/Played it right|cost/);
      never.evClient.dispose();
      cleanup();
      const after = await playRiver('fold', { settings: { ...settings, evMode: 'after' } });
      // the reveal card has the cost, so the toast carries only the figures
      const text = document.querySelector('.sim-toast')!.textContent;
      expect(text).toMatch(/Expected [+\u2212]\$[\d.,]+, result [+\u2212]?\$[\d.,]+\.(Details)?$/);
      expect(text).not.toMatch(/cost/);
      after.evClient.dispose();
    });
    it('a lesson scene shows it only with ui.verdict', async () => {
      const lesson = (verdict: boolean | undefined): SceneConfig =>
        ({
          ...RIVER_19,
          showEV: true,
          ...(verdict === undefined ? {} : { ui: { verdict } }),
          steps: [
            {
              id: 'go',
              text: 'Fold.',
              allowedActions: ['fold', 'play'],
              completeWhen: { street: 'settled' },
            },
          ],
        }) as unknown as SceneConfig;
      const off = await playRiver('fold', {}, lesson(undefined));
      expect(document.querySelector('.sim-toast')?.textContent ?? '').not.toMatch(/cost \$/);
      off.evClient.dispose();
      cleanup();
      const on = await playRiver('fold', {}, lesson(true));
      expect(document.querySelector('.sim-toast')!.textContent).toMatch(/Your river Fold cost/);
      on.evClient.dispose();
    });
  });
});
