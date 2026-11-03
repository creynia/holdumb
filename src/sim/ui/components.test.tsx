import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, equity, parseCards } from '../engine';
import type { Card as PlayingCard, HandRecord } from '../engine';
import type { DecisionPreview, PreviewRequest } from '../math';
import type { OptionKey, SessionView } from '../scene';
import { ActionBar, optionsFor, slotOf } from './ActionBar';
import { BetCircle } from './BetCircle';
import { Card } from './Card';
import { ChipRack } from './ChipRack';
import { EvSheet } from './EvSheet';
import type { EvSheetProps } from './EvSheet';
import { Felt } from './Felt';
import { HandHistory, actionsText, costliestStreet } from './HandHistory';
import { SessionPanel } from './SessionPanel';
import { FoldReveal } from './FoldReveal';
import {
  FLOP_HIDDEN_PAIR,
  FOLDED_DEALER_CARDS,
  FOLDED_RESULT,
  PREFLOP_AA,
  RIVER_ACE_HIGH,
  RIVER_PLAY_BOARD,
  frac,
} from './fixtures';
import { StatusBar } from './StatusBar';
import { statusMoney } from './status';
import { StrategyChart, chartClasses, preflop4xSet } from './StrategyChart';
import { Table } from './Table';
import { TierBadge } from './TierBadge';
import { Toasts } from './Toasts';
import { flushAnnouncements, resetAnnouncer, subscribeAnnouncements } from './announcer';
import { buildTimeline } from './animation';
import { OPTION_SLOT, optionKeyOf } from './text';
import { landscapeLayout, portraitLayout } from './layouts';

afterEach(() => {
  cleanup();
  resetAnnouncer();
});
/** What the app's single announcer would speak now (each entry is one announcement). */
function heard(): string[] {
  const out: string[] = [];
  const off = subscribeAnnouncements((_p, t) => out.push(t));
  flushAnnouncements();
  off();
  return out;
}

function sheet(over: Partial<EvSheetProps> = {}) {
  const props: EvSheetProps = {
    preview: PREFLOP_AA.preview,
    selected: 'play-4',
    onSelect: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  render(<EvSheet {...props} />);
  return props;
}

describe('EvSheet', () => {
  it('lists every option with EV in dollars and antes, cost vs best, and a tier label', () => {
    sheet();
    const list = screen.getByRole('radiogroup');
    expect(within(list).getAllByRole('radio')).toHaveLength(3);
    expect(list.textContent).toContain('+$36.01');
    expect(list.textContent).toContain('+3.601 ante');
    expect(list.textContent).toContain('−$14.08 vs best');
    expect(list.textContent).toContain('Big mistake');
  });
  it('marks exactly one option best and tags the figures exact', () => {
    const { container } = render(<EvSheet {...baseProps()} />);
    expect(container.querySelectorAll('[data-tier="best"]')).toHaveLength(2); // headline + row
    expect(container.querySelectorAll('.sim-evrow-cost')[0]!.textContent).toBe('Best');
    expect(container.textContent).toContain('exact');
  });
  it('every badge carries a text label, never colour alone', () => {
    const { container } = render(<EvSheet {...baseProps()} />);
    for (const b of container.querySelectorAll('.sim-badge'))
      expect(b.textContent.trim().length).toBeGreaterThan(2);
  });
  it('shows the cost against the best option and the preflop-only cost per hour (AA = $1.91)', () => {
    sheet({ selected: 'check', handsPerHour: 30 });
    const cost = screen.getByTestId('cost-vs-best').textContent;
    expect(cost).toContain('$14.08');
    expect(cost).toContain('Bet 4x');
    expect(cost).not.toContain('an hour');
    expect(screen.getByTestId('per-hour').textContent).toContain('about $1.91 an hour');
  });
  it('the alternative card switches the selection with "Use this"', () => {
    const props = sheet({ selected: 'check' });
    const alt = screen.getByTestId('alternative');
    expect(alt.textContent).toContain('Bet 4x instead');
    fireEvent.click(within(alt).getByText('Use this'));
    expect(props.onSelect).toHaveBeenCalledWith('play-4');
  });
  it('has no alternative card for the best option', () => {
    sheet({ selected: 'play-4' });
    expect(screen.queryByTestId('alternative')).toBeNull();
  });
  it('as the confirm step a blunder shows its warning and "Do it anyway" at once; one tap acts (D40)', () => {
    const props = sheet({ selected: 'check', confirming: true });
    expect(screen.getByTestId('blunder-warning').textContent).toBe(
      'This is a big mistake: Bet 4x is the better play.',
    );
    const btn = screen.getByTestId('confirm');
    expect(btn.textContent).toBe('Do it anyway');
    expect(btn.className).toContain('sim-btn-danger');
    fireEvent.click(btn);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledWith('check');
  });
  it('the warning follows the selection', () => {
    const props = baseProps({ selected: 'check', confirming: true });
    const { rerender } = render(<EvSheet {...props} />);
    expect(screen.getByTestId('confirm').textContent).toBe('Do it anyway');
    rerender(<EvSheet {...props} selected="play-4" />);
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm Bet 4x');
    expect(screen.queryByTestId('blunder-warning')).toBeNull();
  });
  it('outside a confirm step Confirm still acts in one tap, with the warning inline', () => {
    const props = sheet({ selected: 'check' });
    expect(screen.getByTestId('blunder-warning')).toBeTruthy();
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm Check');
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('check');
  });
  it('confirm step x tier: Mistakes read "Do it anyway", other tiers "Confirm Check"; one click acts', () => {
    const tiers = ['best', 'close', 'small', 'costly', 'blunder'] as const;
    for (const tier of tiers) {
      const base = PREFLOP_AA.preview;
      const preview: DecisionPreview = {
        ...base,
        options: base.options.map((o) => (optionKeyOf(o.action) === 'check' ? { ...o, tier } : o)),
      };
      const props = sheet({ preview, selected: 'check', confirming: true });
      const warn = tier === 'costly' || tier === 'blunder';
      const btn = screen.getByTestId('confirm');
      expect(btn.textContent, tier).toBe(warn ? 'Do it anyway' : 'Confirm Check');
      expect(screen.queryByTestId('blunder-warning') !== null, tier).toBe(tier === 'blunder');
      expect(screen.queryByTestId('mistake-warning') !== null, tier).toBe(tier === 'costly');
      expect(screen.queryByText(/Tap again|Yes, Check/)).toBeNull();
      fireEvent.click(btn);
      expect(props.onConfirm, tier).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });
  it("evMode 'never': no option rows and no numbers; Confirm works with EV off (D40)", () => {
    const props = sheet({ selected: 'play-4', evMode: 'never', confirming: true });
    const el = screen.getByTestId('ev-sheet');
    expect(within(el).queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByTestId('cost-vs-best')).toBeNull();
    expect(el.textContent).not.toMatch(/\$|ante/i);
    expect(screen.getByTestId('confirm-move').textContent).toBe('Confirm this move.');
    expect(screen.getByRole('heading').textContent).toBe('Bet 4x');
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('play-4');
    cleanup();
    sheet({ selected: 'check', evMode: 'never', confirming: true });
    const w = screen.getByTestId('blunder-warning').textContent;
    expect(w).toContain('big mistake');
    expect(w).toContain('Bet 4x');
    expect(screen.getByTestId('ev-sheet').textContent).not.toMatch(/\$|ante/i);
    expect(screen.queryByTestId('confirm-move')).toBeNull();
    expect(screen.getByTestId('confirm').textContent).toBe('Do it anyway');
  });
  it('a tiered confirm waiting for the preview shows "Checking your move…" and Cancel only', () => {
    sheet({ preview: null, selected: 'check', confirming: true, checking: true });
    expect(screen.getByTestId('ev-checking').textContent).toContain('Checking your move…');
    expect(screen.queryByTestId('confirm')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
  it('a non-blunder mistake confirms in one tap', () => {
    const props = sheet({
      preview: FLOP_HIDDEN_PAIR.preview,
      selected: 'check',
    });
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('check');
  });
  it('Why? opens the rows with counts and the formula', () => {
    sheet({ preview: RIVER_ACE_HIGH.preview, selected: 'play-1' });
    expect(screen.queryByTestId('why-table')).toBeNull();
    fireEvent.click(screen.getByText('Why?'));
    const why = screen.getByTestId('why-table');
    expect(why.textContent).toContain('308 of 990');
    expect(why.textContent).toContain('625 of 990');
    expect(why.textContent).toContain('−1663/990');
    expect(within(why).getAllByRole('row')).toHaveLength(6); // header + five cases
  });
  it('a scene can open Why? from the start, and basic detail hides it', () => {
    const { unmount } = render(
      <EvSheet
        {...baseProps({ preview: RIVER_ACE_HIGH.preview, selected: 'play-1', whyOpen: true })}
      />,
    );
    expect(screen.getByTestId('why-table')).toBeTruthy();
    unmount();
    render(<EvSheet {...baseProps({ detail: 'basic', selected: 'check' })} />);
    expect(screen.queryByText('Why?')).toBeNull();
    expect(screen.queryByTestId('alternative')).toBeNull();
  });
  it('when the confirm sheet turns into the reveal, focus moves to Continue', () => {
    const props = baseProps({ evMode: 'after', selected: 'check', confirming: true });
    const { rerender } = render(<EvSheet {...props} variant="rail" focusOnOpen />);
    expect(document.activeElement?.getAttribute('data-autofocus')).not.toBeNull();
    rerender(<EvSheet {...props} variant="rail" focusOnOpen chosen="check" />);
    expect(document.activeElement?.textContent).toBe('Continue');
  });
  it("evMode 'after' hides every EV until the move, then shows the result", () => {
    const props = baseProps({ evMode: 'after', selected: 'check' });
    const { container, rerender } = render(<EvSheet {...props} />);
    expect(container.textContent).not.toContain('$36.01');
    expect(container.textContent).not.toContain('Big mistake');
    expect(screen.getByTestId('ev-hidden').textContent).toBe('EV is hidden until you act.');
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm Check');
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('check');
    rerender(<EvSheet {...props} chosen="check" />);
    expect(container.textContent).toContain('$36.01');
    expect(screen.getByTestId('reveal-result').textContent).toContain(
      'Bet 4x was worth $14.08 more than Check',
    );
  });
  it('shows "Calculating…" at once, the skeleton and progress after 150 ms, and Confirm stays on', () => {
    vi.useFakeTimers();
    try {
      const props = sheet({ preview: null, progress: 0.4, selected: 'play-2' });
      expect(screen.getByText('Calculating…')).toBeTruthy();
      expect(screen.queryByRole('progressbar')).toBeNull();
      void act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
      fireEvent.click(screen.getByTestId('confirm'));
      expect(props.onConfirm).toHaveBeenCalledWith('play-2');
    } finally {
      vi.useRealTimers();
    }
  });
  it('is a labelled modal dialog; Escape cancels', () => {
    const props = sheet();
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.getAttribute('aria-labelledby')).toBeTruthy();
    fireEvent.keyDown(dlg, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalled();
  });
  it('the rail variant is a region, not a modal', () => {
    sheet({ variant: 'rail' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region')).toBeTruthy();
  });
});

describe('EvSheet flop basic-card rule line (I058)', () => {
  const request = (f: {
    hole: [PlayingCard, PlayingCard];
    board: PlayingCard[];
  }): PreviewRequest => ({
    street: 'flop',
    hole: f.hole,
    board: f.board,
    blindPaytable: 'blind-standard',
    ante: 1000,
  });
  it('names the rule and says perfect play agrees', () => {
    sheet({
      preview: FLOP_HIDDEN_PAIR.preview,
      selected: 'play-2',
      request: request(FLOP_HIDDEN_PAIR),
    });
    expect(screen.getByTestId('flop-rule').textContent).toBe(
      'Basic card: rule (b), a hidden pair of sevens: Bet 2x. Perfect play agrees.',
    );
  });
  it('says so when perfect play prefers the other option (curriculum 8.4 wording)', () => {
    // Same cards, but Check is the exact best: the card's Bet 2x is the rare exception.
    const p = FLOP_HIDDEN_PAIR.preview;
    const swapped = {
      ...p,
      bestIndex: 1,
      options: [
        {
          ...p.options[0]!,
          tier: 'small' as const,
          evCents: frac(-100_000, 100),
          ev: frac(-1, 100),
        },
        { ...p.options[1]!, tier: 'best' as const },
      ],
    } as unknown as DecisionPreview;
    sheet({ preview: swapped, selected: 'check', request: request(FLOP_HIDDEN_PAIR) });
    const line = screen.getByTestId('flop-rule').textContent;
    expect(line).toMatch(
      /^Basic card: rule \(b\), a hidden pair of sevens: Bet 2x\. Perfect play prefers Check\. \(This is a rare exception, worth \$[\d,.]+\.\)$/,
    );
  });
  it("is hidden while evMode 'after' hides the EV, and shown after the move", () => {
    const props = {
      preview: FLOP_HIDDEN_PAIR.preview,
      selected: 'play-2' as OptionKey,
      request: request(FLOP_HIDDEN_PAIR),
      evMode: 'after' as const,
    };
    sheet(props);
    expect(screen.queryByTestId('flop-rule')).toBeNull();
    cleanup();
    sheet({ ...props, chosen: 'play-2' });
    expect(screen.getByTestId('flop-rule')).toBeTruthy();
  });
  it('is absent on the river and without cards', () => {
    sheet({ preview: FLOP_HIDDEN_PAIR.preview, selected: 'play-2' });
    expect(screen.queryByTestId('flop-rule')).toBeNull();
  });
});

describe('EvSheet river dealer outs (lesson 12)', () => {
  const request = (f: {
    hole: [PlayingCard, PlayingCard];
    board: PlayingCard[];
  }): PreviewRequest => ({
    street: 'river',
    hole: f.hole,
    board: f.board,
    blindPaytable: 'blind-standard',
    ante: 1000,
  });
  it('shows the count, the cards, the hidden pair and the basic card before the move', () => {
    sheet({
      preview: RIVER_ACE_HIGH.preview,
      selected: 'play-1',
      request: request(RIVER_ACE_HIGH),
    });
    const outs = screen.getByTestId('dealer-outs');
    expect(outs.getAttribute('data-mode')).toBe('before');
    expect(outs.textContent).toContain('Dealer outs: 15 of 45');
    expect(screen.getByTestId('dealer-outs-list').textContent).toBe(
      ' (any king (3), any nine (3), any five (3), any three (3), any two (3))',
    );
    expect(screen.getByTestId('hidden-pair').textContent).toBe('Hidden pair or better: no');
    expect(screen.getByTestId('basic-river').textContent).toBe('Basic card: bet 1x (outs < 21)');
  });
  it('says fold with 21+ outs and no hidden pair', () => {
    sheet({
      preview: RIVER_PLAY_BOARD.preview,
      selected: 'fold',
      request: request(RIVER_PLAY_BOARD),
    });
    expect(screen.getByTestId('dealer-outs').textContent).toContain('Dealer outs: 27 of 45');
    expect(screen.getByTestId('basic-river').textContent).toBe(
      'Basic card: fold (21+ outs, no hidden pair)',
    );
  });
  it('after the move (revealed result) the facts, basic card included, sit in the result', () => {
    sheet({
      preview: RIVER_ACE_HIGH.preview,
      selected: 'fold',
      evMode: 'after',
      request: request(RIVER_ACE_HIGH),
    });
    expect(screen.queryByTestId('dealer-outs')).toBeNull(); // 'after': nothing until the move
    cleanup();
    sheet({
      preview: RIVER_ACE_HIGH.preview,
      selected: 'fold',
      evMode: 'after',
      chosen: 'fold',
      request: request(RIVER_ACE_HIGH),
    });
    const outs = screen.getByTestId('dealer-outs');
    expect(outs.getAttribute('data-mode')).toBe('after');
    expect(screen.getByTestId('reveal-result').contains(outs)).toBe(true);
    expect(outs.textContent).toContain('Dealer outs: 15 of 45');
    expect(outs.textContent).toContain('Hidden pair or better: no');
    expect(screen.getByTestId('basic-river').textContent).toBe('Basic card: bet 1x (outs < 21)');
  });
  it('a read-only result sheet (drill) is after mode and still shows the basic card', () => {
    render(
      <EvSheet
        preview={RIVER_PLAY_BOARD.preview}
        selected="play-1"
        variant="inline"
        request={request(RIVER_PLAY_BOARD)}
      />,
    );
    expect(screen.getByTestId('dealer-outs').getAttribute('data-mode')).toBe('after');
    expect(screen.getByTestId('basic-river').textContent).toBe(
      'Basic card: fold (21+ outs, no hidden pair)',
    );
  });
  it('appears only on a river preview whose request is the same street', () => {
    sheet({ request: { ...request(RIVER_ACE_HIGH), street: 'preflop', board: [] } });
    expect(screen.queryByTestId('dealer-outs')).toBeNull();
    cleanup();
    sheet({ preview: RIVER_ACE_HIGH.preview, selected: 'play-1' });
    expect(screen.queryByTestId('dealer-outs')).toBeNull();
    cleanup();
    // A stale request from another street never pairs with a river preview.
    sheet({
      preview: RIVER_ACE_HIGH.preview,
      selected: 'play-1',
      request: { ...request(FLOP_HIDDEN_PAIR), street: 'flop' },
    });
    expect(screen.queryByTestId('dealer-outs')).toBeNull();
  });
});

function baseProps(over: Partial<EvSheetProps> = {}): EvSheetProps {
  return {
    preview: PREFLOP_AA.preview,
    selected: 'play-4',
    onSelect: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
}

describe('ActionBar', () => {
  it('shows Deal and Clear while betting, with the bet summary', () => {
    const onDeal = vi.fn();
    render(<ActionBar street="betting" bets={{ ante: 1000, trips: 500 }} onDeal={onDeal} />);
    expect(screen.getByText('Ante + Blind $20 · Trips $5')).toBeTruthy();
    fireEvent.click(screen.getByText('Deal'));
    expect(onDeal).toHaveBeenCalled();
    expect(screen.getByText('Clear')).toBeTruthy();
  });
  it('puts the passive action first and the bets by size on every street (I012)', () => {
    expect(optionsFor('preflop')).toEqual(['check', 'play-3', 'play-4']);
    expect(optionsFor('flop')).toEqual(['check', 'play-2']);
    expect(optionsFor('river')).toEqual(['fold', 'play-1']);
    expect(optionsFor('river', ['fold'])).toEqual(['fold']);
    for (const street of ['preflop', 'flop', 'river'] as const) {
      const keys = optionsFor(street);
      expect(OPTION_SLOT[keys[0]!]).toBe('a');
      const bets = keys.slice(1).map((k) => Number(k.slice(5)));
      expect(bets).toEqual([...bets].sort((x, y) => x - y));
      expect(bets.length).toBeGreaterThan(0);
    }
  });
  it('gives each option a fixed slot whatever the street', () => {
    expect(OPTION_SLOT).toEqual({
      check: 'a',
      fold: 'a',
      'play-3': 'b',
      'play-4': 'c',
      'play-2': 'bc',
      'play-1': 'bc',
    });
  });
  it('labels buttons with Bet/Check/Fold in slot order and fires onOption', () => {
    const onOption = vi.fn();
    render(<ActionBar street="preflop" onOption={onOption} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Check', 'Bet 3x', 'Bet 4x']);
    expect(buttons.map((b) => b.dataset.slot)).toEqual(['a', 'b', 'c']);
    fireEvent.click(screen.getByText('Bet 3x'));
    expect(onOption).toHaveBeenCalledWith('play-3' satisfies OptionKey);
  });
  it('the rail lists the largest bet first and the passive action last (DOM = visual order)', () => {
    render(<ActionBar street="preflop" layout="rail" />);
    expect(screen.getAllByRole('button').map((b) => b.dataset.slot)).toEqual(['c', 'b', 'a']);
    cleanup();
    render(<ActionBar street="settled" layout="rail" />);
    expect(screen.getAllByRole('button').map((b) => b.dataset.action)).toEqual([
      'rebet',
      'change-bets',
    ]);
  });
  it('a lone allowed preflop bet spans b + c like the flop and river bets', () => {
    expect(slotOf('play-4', ['check', 'play-4'])).toBe('bc');
    expect(slotOf('play-3', ['play-3'])).toBe('bc');
    expect(slotOf('play-4', ['check', 'play-3', 'play-4'])).toBe('c');
    expect(slotOf('check', ['check', 'play-4'])).toBe('a');
    render(<ActionBar street="preflop" allowed={['play-4']} />);
    expect(screen.getByText('Bet 4x').closest('button')!.dataset.slot).toBe('bc');
  });
  it('Clear and Change bets take slot a; Deal and Rebet span b + c', () => {
    render(<ActionBar street="betting" />);
    expect(screen.getAllByRole('button').map((b) => [b.dataset.action, b.dataset.slot])).toEqual([
      ['clear', 'a'],
      ['deal', 'bc'],
    ]);
  });
  it('reserves the EV line while EV is idle, not when EV is off or hidden', () => {
    render(<ActionBar street="flop" />);
    for (const b of screen.getAllByRole('button')) {
      const sub = b.querySelector('.sim-act-sub');
      expect(sub).not.toBeNull();
      expect(sub!.getAttribute('aria-hidden')).toBe('true');
    }
    cleanup();
    render(<ActionBar street="flop" evOff />);
    for (const b of screen.getAllByRole('button'))
      expect(b.querySelector('.sim-act-sub')).toBeNull();
    cleanup();
    render(<ActionBar street="flop" hideEv />);
    for (const b of screen.getAllByRole('button'))
      expect(b.querySelector('.sim-act-sub')).toBeNull();
  });
  it('carries EV and a tier word when EV is on, and a spoken name', () => {
    render(<ActionBar street="preflop" preview={PREFLOP_AA.preview} />);
    const b = screen.getByText('Bet 4x').closest('button')!;
    expect(b.textContent).toContain('+3.601 · Best');
    expect(screen.getByText('Check').closest('button')!.textContent).toContain('Big mistake');
  });
  it('shows no EV when practice mode leaves the preview off', () => {
    render(<ActionBar street="flop" />);
    expect(screen.getByText('Bet 2x').closest('button')!.textContent).toBe('Bet 2x');
  });
  it('offers Rebet & Deal and Change bets once settled', () => {
    render(<ActionBar street="settled" />);
    expect(screen.getByText('Rebet & Deal')).toBeTruthy();
    expect(screen.getByText('Change bets')).toBeTruthy();
  });
});

describe('Felt', () => {
  const felt = (over = {}) =>
    render(
      <Felt
        orientation="portrait"
        hole={RIVER_ACE_HIGH.hole}
        dealerDealt
        board={RIVER_ACE_HIGH.board.slice(0, 3)}
        bets={{ ante: 1000, blind: 1000, trips: 500 }}
        {...over}
      />,
    );
  it('shows your cards, the board so far and slots for the rest', () => {
    const { container } = felt();
    expect(screen.getByRole('img', { name: 'Ace of spades' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Seven of clubs' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'King of diamonds' })).toBeTruthy();
    expect(container.querySelectorAll('.sim-slot')).toHaveLength(2);
  });
  it('keeps the dealer face down until revealed', () => {
    felt({ dealer: FOLDED_DEALER_CARDS });
    expect(screen.getAllByRole('img', { name: /Dealer card \d, face down/ })).toHaveLength(2);
    expect(screen.queryByRole('img', { name: 'Ten of diamonds' })).toBeNull();
  });
  it('shows the dealer cards after a fold', () => {
    felt({ dealer: FOLDED_DEALER_CARDS, dealerShown: true });
    expect(screen.getByRole('img', { name: 'Ten of diamonds' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Ten of spades' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /face down/ })).toBeNull();
  });
  it('draws nothing for the dealer or you before the deal', () => {
    render(<Felt orientation="landscape" bets={{ ante: 1000, blind: 1000 }} />);
    expect(screen.queryAllByRole('img', { name: /card/i })).toHaveLength(0);
  });
  it('announces the hands to screen readers', () => {
    felt({ labels: { player: 'ace high', dealer: 'pair of tens, qualifies' } });
    const live = document.querySelector('.sim-sr')!;
    // Not a live region: it is spoken through the one app announcer (I036).
    expect(live.hasAttribute('aria-live')).toBe(false);
    expect(live.textContent).toContain('Dealer: pair of tens, qualifies');
    expect(heard()).toEqual([expect.stringContaining('Dealer: pair of tens, qualifies')]);
  });
  it('puts the multiple on the Play circle', () => {
    felt({ bets: { ante: 1000, blind: 1000, play: 4000 }, playMultiple: 4 });
    expect(screen.getByText('4x')).toBeTruthy();
  });
  it('animates new cards by delay and skips to instant', () => {
    const tl = buildTimeline([{ type: 'player-dealt', cards: [0, 5] }], 'normal');
    const { container, rerender } = felt({ timeline: tl });
    const cards = container.querySelectorAll('.sim-card.is-anim');
    expect(cards.length).toBeGreaterThan(0);
    expect(container.querySelector('.sim-instant')).toBeNull();
    rerender(
      <Felt orientation="portrait" hole={RIVER_ACE_HIGH.hole} bets={{}} timeline={tl} skipped />,
    );
    expect(container.querySelector('.sim-instant')).toBeTruthy();
  });
  it('instant speed adds no animation classes', () => {
    const { container } = felt({ timeline: buildTimeline([], 'instant') });
    expect(container.querySelectorAll('.sim-card.is-anim')).toHaveLength(0);
  });
  it('tapping the felt asks to skip', () => {
    const onSkip = vi.fn();
    felt({ onSkip });
    fireEvent.click(screen.getByTestId('felt'));
    expect(onSkip).toHaveBeenCalled();
  });
});

describe('BetCircle', () => {
  const circle = (over = {}) => {
    const onTap = vi.fn();
    const { container } = render(
      <svg>
        <BetCircle
          id="ante"
          c={{ x: 100, y: 100 }}
          r={34}
          label="ANTE"
          amount={1000}
          minTap={44}
          onTap={onTap}
          hint="Blind matches."
          {...over}
        />
      </svg>,
    );
    return { onTap, container };
  };
  it('is a labelled button with a hit box of at least 44 units', () => {
    const { container } = circle({ r: 22 });
    const b = screen.getByRole('button', { name: 'Ante, $10. Blind matches.' });
    expect(b).toBeTruthy();
    const hit = container.querySelector('[data-hit]')!;
    expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(44);
    expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(44);
  });
  it('taps by click, Enter and Space', () => {
    const { onTap } = circle();
    const b = screen.getByRole('button');
    fireEvent.click(b);
    fireEvent.keyDown(b, { key: 'Enter' });
    fireEvent.keyDown(b, { key: ' ' });
    expect(onTap).toHaveBeenCalledTimes(3);
    expect(onTap).toHaveBeenCalledWith('ante');
  });
  it('is not a button without a handler and names an empty bet', () => {
    circle({ onTap: undefined, amount: 0 });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: /Ante, no bet/ })).toBeTruthy();
  });
});

describe('Card', () => {
  it('names face-up cards and draws suits as shapes', () => {
    const [c] = parseCards('Qh');
    const { container } = render(
      <svg>
        <Card card={c} x={0} y={0} w={70} h={98} />
      </svg>,
    );
    expect(screen.getByRole('img', { name: 'Queen of hearts' })).toBeTruthy();
    expect(container.querySelectorAll('path.sim-suit-h')).toHaveLength(2);
    expect(container.textContent).toBe('Q');
  });
  it('uses four colours when asked, and two otherwise', () => {
    const [d, c] = parseCards('9d 9c');
    const { container } = render(
      <svg>
        <Card card={d} x={0} y={0} w={70} h={98} fourColor />
        <Card card={c} x={80} y={0} w={70} h={98} fourColor />
        <Card card={d} x={160} y={0} w={70} h={98} />
      </svg>,
    );
    expect(container.querySelectorAll('.sim-suit-d.is-four').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.sim-suit-c.is-four').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('path.sim-suit-d:not(.is-four)').length).toBeGreaterThan(0);
  });
  it('a card back is not a face', () => {
    render(
      <svg>
        <Card faceDown x={0} y={0} w={70} h={98} />
      </svg>,
    );
    expect(screen.getByRole('img', { name: 'Face-down card' })).toBeTruthy();
  });
});

describe('TierBadge', () => {
  it.each([
    ['best', 'Best play'],
    ['close', 'Close'],
    ['small', 'Small mistake'],
    ['costly', 'Mistake'],
    ['blunder', 'Big mistake'],
    ['free', 'Free bet'],
    ['good', 'Good bet'],
    ['fair', 'Fair'],
    ['poor', 'Poor bet'],
    ['avoid', 'Sucker bet'],
  ] as const)('%s reads "%s"', (tier, text) => {
    render(<TierBadge tier={tier} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe('small pieces', () => {
  it('ChipRack picks a chip', () => {
    const onSelect = vi.fn();
    render(<ChipRack selected={500} onSelect={onSelect} />);
    expect(screen.getByRole('radio', { name: '$5' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '$25' }));
    expect(onSelect).toHaveBeenCalledWith(2500);
  });
  it('StatusBar keeps a signed result for win, lose, push and fold (I051)', () => {
    const cases = [
      { hand: { outcome: 'win' as const, net: 2000 }, want: 'Won' },
      { hand: { outcome: 'lose' as const, net: -3500 }, want: 'Lost' },
      { hand: { outcome: 'tie' as const, net: 0 }, want: 'Push' },
      { hand: { outcome: 'fold' as const, net: -2000 }, want: 'Folded' },
    ];
    for (const { hand, want } of cases) {
      const { unmount } = render(<StatusBar bankroll={49_000} onFelt={0} hand={hand} />);
      const col = screen.getByTestId('hand-result');
      expect(col.textContent).toContain(want);
      expect(col.textContent).not.toContain('-');
      unmount();
    }
    render(<StatusBar bankroll={49_000} onFelt={0} hand={{ outcome: 'lose', net: -3500 }} />);
    expect(screen.getByTestId('hand-result').textContent).toContain('\u2212$35');
  });
  it('StatusBar shows EV / Details in the third column until a result is showing (I092)', () => {
    const onDetails = vi.fn();
    const { rerender } = render(
      <StatusBar bankroll={49_000} onFelt={2000} hand={null} onDetails={onDetails} />,
    );
    const btn = screen.getByTestId('ev-details');
    expect(btn.textContent).toBe('Details');
    expect(btn.getAttribute('aria-label')).toBe('EV details');
    expect(screen.queryByTestId('hand-result')).toBeNull();
    fireEvent.click(btn);
    expect(onDetails).toHaveBeenCalledTimes(1);
    // a settled result wins over Details
    rerender(
      <StatusBar
        bankroll={49_000}
        onFelt={0}
        hand={{ outcome: 'win', net: 1000 }}
        onDetails={onDetails}
      />,
    );
    expect(screen.queryByTestId('ev-details')).toBeNull();
    expect(screen.getByTestId('hand-result').textContent).toContain('Won');
    // without a handler the column is the reserved "Hand —"
    rerender(<StatusBar bankroll={49_000} onFelt={2000} hand={null} />);
    expect(screen.getByTestId('hand-result').textContent).toContain('Hand');
    expect(screen.getByLabelText('Table status')).toBeTruthy();
  });
  it('StatusBar keeps a one-line hand result, reserved before the hand settles (I012)', () => {
    const { rerender } = render(<StatusBar bankroll={49_000} onFelt={2000} hand={null} />);
    expect(screen.getByTestId('hand-result').textContent).toBe('Hand\u2014');
    for (const [outcome, net, text] of [
      ['win', 15_000, 'Won+$150'],
      ['lose', -3000, 'Lost\u2212$30'],
      ['tie', 0, 'Push$0'],
      ['fold', -2000, 'Folded\u2212$20'],
    ] as const) {
      rerender(<StatusBar bankroll={49_000} onFelt={0} hand={{ outcome, net }} />);
      expect(screen.getByTestId('hand-result').textContent).toBe(text);
    }
    rerender(<StatusBar bankroll={49_000} onFelt={0} />);
    expect(screen.queryByTestId('hand-result')).toBeNull();
  });
  it('StatusBar shows bankroll, felt and session', () => {
    render(<StatusBar bankroll={49_000} onFelt={2500} sessionNet={-1000} />);
    expect(screen.getByTestId('bankroll').textContent).toBe('$490');
    expect(screen.getByTestId('on-felt').textContent).toBe('$25');
    expect(screen.getByTestId('session-net').textContent).toBe('\u2212$10');
  });
  it('Toasts announce politely and dismiss', () => {
    const onDismiss = vi.fn();
    render(<Toasts toasts={[{ id: 3, text: 'Net +$50.' }]} onDismiss={onDismiss} />);
    expect(
      document.querySelector('[aria-live],[role="log"],[role="status"],[role="alert"]'),
    ).toBeNull();
    expect(heard()).toEqual(['Net +$50.']);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(3);
  });
  it('FoldReveal says what you would have done', () => {
    render(<FoldReveal result={FOLDED_RESULT} />);
    expect(screen.getByTestId('fold-reveal').textContent).toContain(
      'You would have lost $30 (folding saved $10).',
    );
  });
  it('a spoken toast shows its money to sight only and announces the spoken line', () => {
    render(
      <Toasts
        toasts={[
          {
            id: 2,
            text: 'Folded. Ante -$10, Blind -$10. Net -$20.',
            spoken: 'You folded. Net -$20. The dealer had a pair of tens (qualifies).',
          },
        ]}
      />,
    );
    expect(
      screen.getByText('Folded. Ante -$10, Blind -$10. Net -$20.').getAttribute('aria-hidden'),
    ).toBe('true');
    const spoken = screen.getByText(
      'You folded. Net -$20. The dealer had a pair of tens (qualifies).',
    );
    expect(spoken.className).toContain('sim-sr');
    expect(heard()).toEqual(['You folded. Net -$20. The dealer had a pair of tens (qualifies).']);
  });
  it('Table lays out portrait and landscape with the actions present in both', () => {
    for (const o of ['portrait', 'landscape'] as const) {
      const { unmount } = render(
        <Table orientation={o} felt={<i />} actions={<button>Deal</button>} />,
      );
      expect(screen.getByText('Deal')).toBeTruthy();
      unmount();
    }
  });
  it('Table puts toasts after the actions, so a result never pushes a button (I012)', () => {
    for (const o of ['portrait', 'landscape'] as const) {
      const { unmount } = render(
        <Table
          orientation={o}
          felt={<i />}
          status={<p>status</p>}
          actions={<button>Deal</button>}
          toasts={<p>result</p>}
        />,
      );
      const deal = screen.getByText('Deal');
      const toast = screen.getByText('result');
      expect(deal.compareDocumentPosition(toast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      if (o === 'portrait')
        expect(
          screen.getByText('status').compareDocumentPosition(deal) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      unmount();
    }
  });
});

describe('StrategyChart', () => {
  it('has 169 cells and bets 4x with 69 of them', () => {
    const { container } = render(<StrategyChart strategy="perfect" view="preflop" />);
    expect(container.querySelectorAll('.sim-chart-cell')).toHaveLength(169);
    expect(container.querySelectorAll('.sim-chart-cell.is-bet')).toHaveLength(69);
    expect(chartClasses()).toHaveLength(169);
  });
  it('matches decisions.md section 3 at the boundaries', () => {
    const s = preflop4xSet('basic');
    for (const yes of ['33', 'A2o', 'K2s', 'K5o', 'Q6s', 'Q8o', 'J8s', 'JTo'])
      expect(s.has(yes), yes).toBe(true);
    for (const no of ['22', 'K4o', 'Q5s', 'Q7o', 'J7s', 'J9o', 'T9s', '72o'])
      expect(s.has(no), no).toBe(false);
  });
  it('simple follows D16', () => {
    const s = preflop4xSet('simple');
    for (const yes of ['K2o', 'Q8s', 'Q8o', 'JTs', 'JTo', '33']) expect(s.has(yes), yes).toBe(true);
    for (const no of ['Q7s', 'J9s', 'T9s', '22']) expect(s.has(no), no).toBe(false);
  });
  it('names each cell and shows the answer on tap, text not colour', () => {
    const onSelect = vi.fn();
    render(<StrategyChart strategy="basic" view="preflop" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('gridcell', { name: 'K4o: Check' }));
    expect(onSelect).toHaveBeenCalledWith('K4o');
    expect(document.querySelector('.sim-chart-legend')!.textContent).toBe('K4o: Check.');
  });
  it('accepts the strategy module data', () => {
    const { container } = render(
      <StrategyChart strategy="basic" view="preflop" preflop4x={['AA', 'KK']} />,
    );
    expect(container.querySelectorAll('.sim-chart-cell.is-bet')).toHaveLength(2);
  });
  it('lists flop and river rules in words', () => {
    render(<StrategyChart strategy="basic" view="river" />);
    expect(screen.getByText(/Fewer than 21 dealer outs/)).toBeTruthy();
  });
});

describe('layout tap targets', () => {
  it('both layouts keep the 44 unit minimum', () => {
    expect(portraitLayout.minTapUnits).toBeGreaterThanOrEqual(44);
    expect(landscapeLayout.minTapUnits).toBeGreaterThanOrEqual(44);
  });
});

const zeroPreview: DecisionPreview = {
  ...PREFLOP_AA.preview,
  options: PREFLOP_AA.preview.options.map((o) => ({
    ...o,
    ev: { num: 0n, den: 1n },
    evCents: { num: 0n, den: 1n },
    regret: { num: 0n, den: 1n },
    tier: 'best' as const,
  })),
};

describe('missing EV is never shown as a value or a tier (no invented zeros)', () => {
  it('ActionBar pending: "Calculating…", no badges', () => {
    render(<ActionBar street="preflop" preview={null} evStatus="pending" />);
    expect(screen.getAllByText('Calculating…')).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/Best|0\.000/);
  });
  it('ActionBar error: "EV not available", buttons still usable', () => {
    const onOption = vi.fn();
    render(<ActionBar street="preflop" preview={null} evStatus="error" onOption={onOption} />);
    expect(screen.getAllByText('EV not available')).toHaveLength(3);
    expect(document.body.textContent).not.toContain('Best');
    fireEvent.click(screen.getByText('Bet 4x'));
    expect(onOption).toHaveBeenCalledWith('play-4');
  });
  it('ActionBar treats an all-zero preview as unavailable', () => {
    render(<ActionBar street="preflop" preview={zeroPreview} />);
    expect(document.body.textContent).not.toMatch(/Best|0\.000/);
    expect(screen.getAllByText('EV not available')).toHaveLength(3);
  });
  it('EvSheet pending: skeleton with Calculating…, no tier badge, Confirm works', () => {
    const props = sheet({ preview: null, selected: 'play-4' });
    expect(screen.getByText('Calculating…')).toBeTruthy();
    expect(document.querySelectorAll('.sim-badge')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('play-4');
  });
  it('EvSheet error and all-zero preview: "EV not available", no badge, never Best', () => {
    for (const p of [{ preview: null, error: true }, { preview: zeroPreview }]) {
      const { unmount } = render(<EvSheet {...baseProps(p)} />);
      expect(screen.getByTestId('ev-unavailable').textContent).toContain('EV not available');
      expect(document.querySelectorAll('.sim-badge')).toHaveLength(0);
      expect(document.body.textContent).not.toContain('Best');
      unmount();
    }
  });
});

describe('session net and next-hand chips (D38)', () => {
  it('session net is the equity change after a lost hand, from the real engine', () => {
    const start = createGame({
      seed: 7,
      bets: { ante: 1000, trips: 500 },
      startAt: {
        street: 'river',
        deal: {
          player: ['As', '7c'],
          dealer: ['Td', 'Ts'],
          flop: ['Kd', '9h', '5c'],
          turn: '3s',
          river: '2d',
        },
      },
    });
    const r = applyAction(start, { type: 'fold' });
    if (!r.ok) throw new Error('fold rejected');
    const net = equity(r.state) - equity(start);
    expect(net).toBe(-2500);
    render(<StatusBar bankroll={equity(r.state)} onFelt={0} sessionNet={net} />);
    expect(screen.getByTestId('session-net').textContent).toBe('\u2212$25');
  });
  it('Felt ghosts the chips and captions them "Next hand"', () => {
    const { container } = render(
      <Felt orientation="portrait" bets={{ ante: 1000, blind: 1000, trips: 500 }} nextHand />,
    );
    expect(container.querySelectorAll('.sim-circle.is-ghost')).toHaveLength(3);
    expect(container.textContent).toContain('Next hand');
    expect(screen.getByRole('img', { name: /Next hand: Ante, \$10/ })).toBeTruthy();
  });
  it('no caption or ghost for live bets', () => {
    const { container } = render(
      <Felt orientation="portrait" bets={{ ante: 1000, blind: 1000 }} />,
    );
    expect(container.querySelectorAll('.is-ghost')).toHaveLength(0);
    expect(container.textContent).not.toContain('Next hand');
  });
});

describe('HandHistory (simulator.md 3.7)', () => {
  const rec = (n: number, over: Partial<HandRecord> = {}): HandRecord => ({
    n,
    p: 'Qc7d',
    d: 'TdTs',
    b: 'KdJh9s5c2d',
    w: [1000, 0],
    a: [
      ['p', 'check', 'b', '0'],
      ['f', 'check', 'c', '1/90'],
      ['r', 'fold', 'm', '317/990'],
    ],
    net: -2000,
    ...over,
  });
  const rules = createGame().rules;
  it('is one heading and a list, newest first, with cards, choices, tier words and the net', () => {
    render(
      <HandHistory
        records={[rec(2, { net: 4500, a: [['p', '4x', 'b', '0']] }), rec(1)]}
        rules={rules}
      />,
    );
    const section = screen.getByTestId('hand-history');
    expect(section.querySelectorAll('h2')).toHaveLength(1);
    expect(section.querySelector('h2')!.textContent).toBe('Hand history');
    const rows = screen.getAllByTestId('hand-history-row');
    expect(rows).toHaveLength(2);
    expect(section.querySelector('ol')).toBeTruthy();
    expect(rows[0]!.textContent).toContain('#2');
    expect(rows[0]!.textContent).toContain('4x (best)');
    expect(rows[0]!.textContent).toContain('+$45');
    expect(rows[1]!.textContent).toContain('check (best), check (close), fold (mistake)');
    expect(rows[1]!.textContent).toContain('\u2212$20');
    expect(
      within(rows[1]!).getByRole('img', { name: 'You: Queen of clubs, Seven of diamonds' }),
    ).toBeTruthy();
    expect(
      within(rows[1]!).getByRole('img', { name: 'Dealer: Ten of diamonds, Ten of spades' }),
    ).toBeTruthy();
    // Each row's button says the hand, its net and the choices in one name.
    expect(within(rows[1]!).getByRole('button').getAttribute('aria-label')).toBe(
      'Hand 1, net \u2212$20, check (best), check (close), fold (mistake)',
    );
    expect(screen.queryByRole('status')).toBeNull(); // no live region of its own
  });
  it('a row expands to the settlement sentence and the replay link at the costliest street', () => {
    render(<HandHistory records={[rec(1)]} rules={rules} replayHref={(q) => `#/play?${q}`} />);
    const btn = screen.getByRole('button', { name: /^Hand 1,/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('replay-spot')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const row = screen.getByTestId('hand-history-row');
    // The settlement sentence is re-derived from the deal (describeResult, I010's fold wording).
    expect(row.textContent).toContain(
      'Folded. Ante \u2212\u2060$10, Blind \u2212\u2060$10. Net \u2212\u2060$20.',
    );
    const link = screen.getByTestId<HTMLAnchorElement>('replay-spot');
    expect(link.getAttribute('href')).toBe(
      '#/play?hole=Qc7d&board=KdJh9s5c2d&dealer=TdTs&street=river',
    );
    fireEvent.click(btn);
    expect(screen.queryByTestId('replay-spot')).toBeNull();
  });
  it('picks the costliest scored street, falls back to the first decision, and hides the link without replayHref', () => {
    expect(costliestStreet(rec(1))).toBe('river');
    expect(
      costliestStreet(
        rec(1, {
          a: [
            ['p', 'check', 'm', '3/10'],
            ['f', 'check', 'c', '1/90'],
            ['r', '1x', 'b', '0'],
          ],
        }),
      ),
    ).toBe('preflop');
    expect(
      costliestStreet(
        rec(1, {
          a: [
            ['p', 'check'],
            ['f', '2x'],
          ],
        }),
      ),
    ).toBe('preflop');
    expect(
      actionsText(
        rec(1, {
          a: [
            ['p', 'check'],
            ['f', '2x'],
          ],
        }),
      ),
    ).toBe('check, 2x');
    render(<HandHistory records={[rec(1)]} rules={rules} />);
    fireEvent.click(screen.getByRole('button', { name: /^Hand 1,/ }));
    expect(screen.queryByTestId('replay-spot')).toBeNull();
  });
  it('lists the newest 10 and the rest behind "Show more"', () => {
    const many = Array.from({ length: 23 }, (_, i) => rec(23 - i));
    render(<HandHistory records={many} rules={rules} />);
    expect(screen.getAllByTestId('hand-history-row')).toHaveLength(10);
    const more = screen.getByTestId('history-more');
    expect(more.textContent).toBe('Show 13 more');
    fireEvent.click(more);
    expect(screen.getAllByTestId('hand-history-row')).toHaveLength(23);
    expect(screen.queryByTestId('history-more')).toBeNull();
  });
  it('a corrupt regret never crashes a row (it is skipped for the replay street)', () => {
    const bad = rec(1, {
      a: [
        ['p', 'check', 'm', '1/0'],
        ['f', 'check', 'c', '1/90'],
      ],
    });
    expect(costliestStreet(bad)).toBe('flop');
  });
  it('renders nothing without hands', () => {
    const { container } = render(<HandHistory records={[]} rules={rules} />);
    expect(container.textContent).toBe('');
  });
});

describe('SessionPanel (curriculum 8.5)', () => {
  it('links the table mistakes to Drill (I056)', () => {
    const base = {
      hands: 2,
      scored: 2,
      mistakes: 2,
      mistakesRoundedCents: 500,
      edgePerAnte: null,
    } as Partial<SessionView>;
    const spots = ['p:AsAh.', 'f:2dJd.4h6d9d'];
    const { unmount } = render(
      <SessionPanel session={view({ ...base, mistakeSpots: spots })} defaultOpen />,
    );
    const a = screen.getByTestId('session-review');
    expect(a.textContent).toBe('Review 2 mistakes');
    expect(a.getAttribute('href')).toBe('#/drill?focus=p:AsAh.,f:2dJd.4h6d9d');
    unmount();
    render(<SessionPanel session={view({ ...base, mistakeSpots: [spots[0]!] })} defaultOpen />);
    expect(screen.getByTestId('session-review').textContent).toBe('Review 1 mistake');
    cleanup();
    render(<SessionPanel session={view({ ...base, mistakeSpots: [] })} defaultOpen />);
    expect(screen.queryByTestId('session-review')).toBeNull();
  });

  const view = (over: Partial<SessionView> = {}): SessionView => ({
    hands: 3,
    scored: 2,
    expectedCents: frac(-9176, 10),
    mistakeCents: frac(1204, 10),
    scoredMainCents: -3000,
    scoredAnteCents: 20_000,
    tripsCents: 2500,
    tripsWageredCents: 21_000,
    topUpCents: 0,
    tripsExpectedCents: frac(-400),
    sixCardCents: 0,
    sixCardWageredCents: 0,
    sixCardExpectedCents: frac(0),
    decisions: 5,
    mistakes: 3,
    watchedHands: 0,
    watchedCents: 0,
    watchedWageredCents: 0,
    net: -3500,
    wageredCents: 178_000,
    perfectCents: -918 + -400,
    mistakesRoundedCents: 120,
    luckCents: -3500 - (-918 + -400) + 120,
    tripsExpectedRoundedCents: -400,
    sixCardExpectedRoundedCents: 0,
    edgePerAnte: frac(24, 1000),
    mistakeSpots: [],
    ...over,
  });
  it('shows wagered, perfect, mistakes with the count, luck, the edge per Ante and the Trips line', () => {
    const s = view();
    render(<SessionPanel session={s} defaultOpen />);
    expect(screen.getByTestId('session-net-detail').textContent).toBe('\u2212$35');
    expect(screen.getByTestId('session-wagered').textContent).toBe('$1,780');
    expect(screen.getByTestId('session-perfect').textContent).toBe('\u2212$13.18');
    expect(screen.getByTestId('session-mistakes').textContent).toBe('3 mistakes · \u2212$1.20');
    expect(screen.getByTestId('session-luck').textContent).toBe('\u2212$20.62');
    expect(screen.getByTestId('session-edge').textContent).toBe('2.40% (perfect play 2.18%)');
    expect(screen.getByTestId('session-trips').textContent).toBe(
      'wagered $210 · expected \u2212$4 · actual +$25',
    );
    // The displayed split adds up to the result to the cent.
    expect(s.perfectCents - s.mistakesRoundedCents + s.luckCents).toBe(s.net);
    const text = screen.getByTestId('session-panel').textContent;
    expect(text).toContain('1 hand had no EV');
    expect(text).toMatch(/on average/);
    expect(text).not.toMatch(/you will (win|lose)/i);
  });
  it('hides rows whose figures are missing or zero, and uses the singular', () => {
    render(
      <SessionPanel
        session={view({ wageredCents: 0, tripsWageredCents: 0, mistakes: 1, hands: 2, scored: 2 })}
        defaultOpen
      />,
    );
    expect(screen.queryByTestId('session-wagered')).toBeNull();
    expect(screen.queryByTestId('session-trips')).toBeNull();
    expect(screen.getByTestId('session-mistakes').textContent).toContain('1 mistake ·');
    expect(screen.getByTestId('session-panel').textContent).not.toContain('had no EV');
  });
  it('before any scored hand it asks you to play with the EV sheet, and has no edge', () => {
    render(
      <SessionPanel
        session={view({ hands: 0, scored: 0, scoredAnteCents: 0, edgePerAnte: null, net: 0 })}
        defaultOpen
      />,
    );
    expect(screen.queryByTestId('session-perfect')).toBeNull();
    expect(screen.queryByTestId('session-edge')).toBeNull();
    expect(screen.getByTestId('session-panel').textContent).toContain(
      'Play a hand with the EV sheet',
    );
  });
  it('a negative edge (you are ahead of the house so far) keeps its sign; the toggle is a 44 px button', () => {
    render(<SessionPanel session={view({ edgePerAnte: frac(-5, 1000) })} />);
    const btn = screen.getByTestId('session-toggle');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(screen.getByTestId('session-edge').textContent).toContain('\u22120.50%');
  });
});

describe('EvSheet read-only mode', () => {
  it('shows no Confirm/Cancel and no selectable rows without handlers', () => {
    render(<EvSheet preview={PREFLOP_AA.preview} selected="play-4" variant="inline" />);
    expect(screen.queryByTestId('confirm')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
  it('a preview missing fields shows "EV not available" instead of crashing', () => {
    const bad = {
      ...PREFLOP_AA.preview,
      options: [{ label: 'Bet 4x', action: { type: 'check' } }],
    };
    render(
      <EvSheet preview={bad as unknown as DecisionPreview} selected="check" variant="inline" />,
    );
    expect(screen.getByTestId('ev-unavailable')).toBeTruthy();
  });
});

describe('StrategyChart keyboard', () => {
  it('has one tab stop and arrow keys move between cells', () => {
    const { container } = render(<StrategyChart strategy="basic" view="preflop" />);
    expect(container.querySelectorAll('.sim-chart-cell[tabindex="0"]')).toHaveLength(1);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    const aa = container.querySelector<HTMLElement>('[data-class="AA"]')!;
    aa.focus();
    fireEvent.keyDown(aa, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('data-class')).toBe('AKs');
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(document.querySelector('.sim-chart-legend')!.textContent).toBe('AKs: Bet 4x.');
  });
});

describe('review fixes', () => {
  it('per-hour cost is preflop only: none on the flop or river', () => {
    sheet({ preview: FLOP_HIDDEN_PAIR.preview, selected: 'check', handsPerHour: 30 });
    expect(screen.queryByTestId('per-hour')).toBeNull();
  });
  it('shown costs add up with shown EVs', () => {
    const { container } = render(<EvSheet {...baseProps()} />);
    // $36.01 - $21.93 = $14.08
    expect(container.textContent).toContain('\u2212$14.08 vs best');
    expect(container.textContent).toContain('+$36.01');
    expect(container.textContent).toContain('+$21.93');
  });
  it('a real cost under a cent reads "−<$0.01 vs best"', () => {
    const p = structuredClone(PREFLOP_AA.preview);
    p.options[1]!.evCents = { ...p.options[0]!.evCents };
    p.options[1]!.tier = 'close';
    render(<EvSheet {...baseProps({ preview: p })} />);
    expect(document.body.textContent).toContain('\u2212<$0.01 vs best');
  });
  it('renders the curriculum 8.4 copy for a math alternative', () => {
    sheet({
      selected: 'check',
      alternative: {
        copyKey: 'pre-check-chart-hand',
        bestIndex: 0,
        chosenIndex: 2,
        regret: { num: 1n, den: 1n },
        vars: { hand: 'AA' },
      },
    });
    expect(screen.getByTestId('alternative').textContent).toContain(
      'Bet 4x instead: AA is a 4x hand. +$36.01 vs +$21.93.',
    );
  });
  it('ActionBar practice mode shows no EV', () => {
    render(<ActionBar street="preflop" preview={PREFLOP_AA.preview} hideEv />);
    expect(document.body.textContent).not.toMatch(/Best|3\.601|Calculating|not available/);
  });
  it('Escape returns focus to the opener', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<EvSheet {...baseProps()} />);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it('statusMoney uses equity once settled (D38)', () => {
    const start = createGame({ seed: 7, bets: { ante: 1000 } });
    const s = statusMoney(start, equity(start));
    expect(s.sessionNet).toBeUndefined();
    expect(s.onFelt).toBe(2000);
  });
  it('check-to-river never bets 4x preflop and the chart agrees with the strategy module', () => {
    expect(preflop4xSet('check-to-river').size).toBe(0);
    expect(preflop4xSet('perfect').size).toBe(69);
  });
});
