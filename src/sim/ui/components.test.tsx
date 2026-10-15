import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCards } from '../engine';
import type { OptionKey } from '../scene';
import { ActionBar, optionsFor } from './ActionBar';
import { BetCircle } from './BetCircle';
import { Card } from './Card';
import { ChipRack } from './ChipRack';
import { EvSheet } from './EvSheet';
import type { EvSheetProps } from './EvSheet';
import { Felt } from './Felt';
import { FoldReveal } from './FoldReveal';
import {
  FLOP_HIDDEN_PAIR,
  FOLDED_DEALER_CARDS,
  FOLDED_RESULT,
  PREFLOP_AA,
  RIVER_ACE_HIGH,
} from './fixtures';
import { StatusBar } from './StatusBar';
import { StrategyChart, chartClasses, preflop4xSet } from './StrategyChart';
import { Table } from './Table';
import { TierBadge } from './TierBadge';
import { Toasts } from './Toasts';
import { buildTimeline } from './animation';
import { landscapeLayout, portraitLayout } from './layouts';

afterEach(cleanup);

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
  it('shows the cost against the best option and hands per hour', () => {
    sheet({ selected: 'check', handsPerHour: 30 });
    const cost = screen.getByTestId('cost-vs-best').textContent;
    expect(cost).toContain('$14.08');
    expect(cost).toContain('Bet 4x');
    expect(cost).toContain('$422.44 an hour');
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
  it('a blunder needs a second tap ("Do it anyway")', () => {
    const props = sheet({ selected: 'check' });
    const btn = screen.getByTestId('confirm');
    expect(btn.textContent).toBe('Confirm Check');
    fireEvent.click(btn);
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('blunder-warning')).toBeTruthy();
    expect(btn.textContent).toBe('Do it anyway');
    fireEvent.click(btn);
    expect(props.onConfirm).toHaveBeenCalledWith('check');
  });
  it('re-arms when the selection changes', () => {
    const props = baseProps({ selected: 'check' });
    const { rerender } = render(<EvSheet {...props} />);
    fireEvent.click(screen.getByTestId('confirm'));
    expect(screen.getByTestId('confirm').textContent).toBe('Do it anyway');
    rerender(<EvSheet {...props} selected="play-3" />);
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm Bet 3x');
  });
  it('confirms in one tap when confirmCostlyMoves is off', () => {
    const props = sheet({ selected: 'check', confirmCostlyMoves: false });
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('check');
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
  it('practice mode hides every EV until confirm, then shows the result', () => {
    const props = baseProps({ hideEv: true, selected: 'check' });
    const { container, rerender } = render(<EvSheet {...props} />);
    expect(container.textContent).not.toContain('$36.01');
    expect(container.textContent).not.toContain('Big mistake');
    expect(screen.getByTestId('practice-hidden')).toBeTruthy();
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm Check');
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('check'); // no second tap while hidden
    rerender(<EvSheet {...props} chosen="check" />);
    expect(container.textContent).toContain('$36.01');
    expect(screen.getByTestId('practice-result').textContent).toContain(
      'Bet 4x was worth $14.08 more than Check',
    );
  });
  it('shows a skeleton and progress while the flop EV computes, and Confirm stays on', () => {
    const props = sheet({ preview: null, progress: 0.4, selected: 'play-2' });
    expect(screen.getByTestId('ev-loading')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    fireEvent.click(screen.getByTestId('confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith('play-2');
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
  it('shows the right options per street in the D31 order', () => {
    expect(optionsFor('preflop')).toEqual(['play-4', 'play-3', 'check']);
    expect(optionsFor('flop')).toEqual(['check', 'play-2']);
    expect(optionsFor('river')).toEqual(['play-1', 'fold']);
    expect(optionsFor('river', ['fold'])).toEqual(['fold']);
  });
  it('labels buttons with Bet/Check/Fold and fires onOption', () => {
    const onOption = vi.fn();
    render(<ActionBar street="preflop" onOption={onOption} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Bet 4x',
      'Bet 3x',
      'Check',
    ]);
    fireEvent.click(screen.getByText('Bet 3x'));
    expect(onOption).toHaveBeenCalledWith('play-3' satisfies OptionKey);
  });
  it('carries EV and a tier word when EV is on, and a spoken name', () => {
    render(<ActionBar street="preflop" preview={PREFLOP_AA.preview} />);
    const b = screen.getByRole('button', { name: 'Bet 4x, EV plus $36.01, best play' });
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
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Dealer: pair of tens, qualifies');
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
    ['fair', 'Fair bet'],
    ['poor', 'Poor bet'],
    ['avoid', 'Avoid'],
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
  it('StatusBar shows bankroll, felt and session', () => {
    render(<StatusBar bankroll={49_000} onFelt={2500} sessionNet={-1000} />);
    expect(screen.getByTestId('bankroll').textContent).toBe('$490');
    expect(screen.getByTestId('on-felt').textContent).toBe('$25');
    expect(screen.getByTestId('session-net').textContent).toBe('-$10');
  });
  it('Toasts announce politely and dismiss', () => {
    const onDismiss = vi.fn();
    render(<Toasts toasts={[{ id: 3, text: 'Net +$50.' }]} onDismiss={onDismiss} />);
    expect(screen.getByRole('log').getAttribute('aria-live')).toBe('polite');
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(3);
  });
  it('FoldReveal says what you would have done', () => {
    render(<FoldReveal result={FOLDED_RESULT} />);
    expect(screen.getByTestId('fold-reveal').textContent).toContain('You would have lost $30.');
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
    fireEvent.click(screen.getByRole('button', { name: 'K4o: Check' }));
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
    expect(screen.getByText(/fewer than 21 outs/)).toBeTruthy();
  });
});

describe('layout tap targets', () => {
  it('both layouts keep the 44 unit minimum', () => {
    expect(portraitLayout.minTapUnits).toBeGreaterThanOrEqual(44);
    expect(landscapeLayout.minTapUnits).toBeGreaterThanOrEqual(44);
  });
});
