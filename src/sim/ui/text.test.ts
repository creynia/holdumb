import { describe, expect, it } from 'vitest';
import {
  FOLDED_RESULT,
  FLOP_HIDDEN_PAIR,
  PREFLOP_AA,
  RIVER_ACE_HIGH,
  WON_RESULT,
  frac,
} from './fixtures';
import {
  withArticle,
  OPTION_LABELS,
  OPTION_ORDER,
  actionOfKey,
  ariaForOption,
  describeResult,
  fmtAnteUnits,
  fmtCentsFraction,
  fmtCost,
  fmtFixed,
  fmtVsBest,
  foldRevealText,
  handName,
  headline,
  optionKeyOf,
} from './text';

describe('exact fraction formatting', () => {
  it('rounds half away from zero', () => {
    expect(fmtFixed(frac(1, 2), 0)).toBe('1');
    expect(fmtFixed(frac(-1, 2), 0)).toBe('-1');
    expect(fmtFixed(frac(-1663, 990), 3)).toBe('-1.680');
  });
  it('shows ante units to three decimals with a sign', () => {
    expect(fmtAnteUnits(frac(178661, 178365))).toBe('+1.002');
    expect(fmtAnteUnits(frac(-2))).toBe('-2.000');
    expect(fmtAnteUnits(frac(0))).toBe('0.000');
  });
  it('shows dollars from cents fractions', () => {
    const aa4 = PREFLOP_AA.preview.options[0]!;
    expect(fmtCentsFraction(aa4.evCents)).toBe('+$36.01');
    expect(fmtCentsFraction(PREFLOP_AA.preview.options[2]!.evCents)).toBe('+$21.93');
  });
  it('says "less than 1¢" for a cost that rounds to nothing', () => {
    expect(fmtCost(frac(1, 10))).toBe('less than 1¢');
    expect(fmtVsBest(frac(1, 10))).toBe('less than 1¢');
    expect(fmtVsBest(frac(1408))).toBe('−$14.08');
    expect(fmtCost(frac(0))).toBe('$0');
  });
});

describe('option labels (D31)', () => {
  it('uses Bet / Check / Fold in the D31 order and never "Raise"', () => {
    expect(OPTION_ORDER.map((k) => OPTION_LABELS[k]).join(' · ')).toBe(
      'Bet 4x · Bet 3x · Check · Bet 2x · Bet 1x · Fold',
    );
    for (const f of [PREFLOP_AA, FLOP_HIDDEN_PAIR, RIVER_ACE_HIGH])
      for (const o of f.preview.options) expect(o.label).not.toMatch(/raise/i);
  });
  it('maps actions and option keys both ways', () => {
    for (const k of OPTION_ORDER) expect(optionKeyOf(actionOfKey(k))).toBe(k);
  });
  it('builds the headline and the spoken name', () => {
    expect(headline(PREFLOP_AA.preview, 0)).toBe('Bet 4x: +$36.01 · Best play');
    expect(ariaForOption(PREFLOP_AA.preview.options[2]!)).toBe(
      'Check, EV plus $21.93, big mistake',
    );
  });
});

describe('prose', () => {
  it('names hands', () => {
    expect(handName(WON_RESULT.player)).toBe('pair of kings');
    expect(handName(FOLDED_RESULT.player)).toBe('ace high');
  });
  it('describes a settled hand', () => {
    expect(describeResult(WON_RESULT)).toBe(
      "Your pair of kings beats the dealer's pair of nines. Ante +$10, Blind push (needs a straight), Play +$40. Net +$50.",
    );
  });
  it('says what a fold would have done (D7)', () => {
    expect(foldRevealText(FOLDED_RESULT)).toBe(
      'The dealer had a pair of tens (qualifies). You would have lost $30.',
    );
    const won = { ...FOLDED_RESULT, ifPlayed: { outcome: 'win' as const, net: 2500 } };
    expect(foldRevealText(won)).toContain('You would have won $25.');
    const tie = { ...FOLDED_RESULT, ifPlayed: { outcome: 'tie' as const, net: 0 } };
    expect(foldRevealText(tie)).toContain('You would have pushed.');
  });
  it('uses the right article and verb for every kind of hand name', () => {
    expect(withArticle('pair of kings')).toBe('a pair of kings');
    expect(withArticle('full house')).toBe('a full house');
    expect(withArticle('two pair')).toBe('two pair');
    expect(withArticle('three queens')).toBe('three queens');
    expect(withArticle('ace high')).toBe('ace high');
    const trips = { ...WON_RESULT, player: { ...WON_RESULT.player, category: 'trips' as const } };
    // three aces: rank comes from the lead card of best5 (ace = 12 -> index 48..51)
    const aces = { ...trips, player: { ...trips.player, best5: [48, 49, 50, 4, 8] } };
    expect(describeResult(aces)).toMatch(/^Your three aces beat the dealer's pair of nines\./);
    const tie = { ...aces, outcome: 'tie' as const };
    expect(describeResult(tie)).toMatch(/^Tie: you and the dealer both have three aces\./);
  });
});
