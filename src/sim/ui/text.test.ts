import { describe, expect, it } from 'vitest';
import { parseCards, resolveRules, settleHand } from '../engine';
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
  foldAnnouncement,
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
  it('makes a fold toast carry only the money (the reveal has the rest)', () => {
    expect(describeResult(FOLDED_RESULT)).toBe('Folded. Ante -$10, Blind -$10. Net -$20.');
  });
  it('says what a fold would have done (D7) with the net difference', () => {
    // FOLDED_RESULT: folded -$20; playing would have lost $30, so folding saved $10.
    expect(foldRevealText(FOLDED_RESULT)).toBe(
      'The dealer had a pair of tens (qualifies). You would have lost $30 (folding saved $10).',
    );
    // Playing would have won $40: folding cost $60 (40 - -20).
    const won = { ...FOLDED_RESULT, ifPlayed: { outcome: 'win' as const, net: 4000 } };
    expect(foldRevealText(won)).toContain('You would have won $40 (folding cost $60).');
    // Playing would have pushed: folding cost the $20 it lost.
    const tie = { ...FOLDED_RESULT, ifPlayed: { outcome: 'tie' as const, net: 0 } };
    expect(foldRevealText(tie)).toContain('You would have pushed (folding cost $20).');
    // Same money either way: no difference clause.
    const same = { ...FOLDED_RESULT, ifPlayed: { outcome: 'lose' as const, net: -2000 } };
    expect(foldRevealText(same)).toContain('You would have lost $20.');
  });
  it('announces the real net once, with the dealer and the would-have line', () => {
    expect(foldAnnouncement(FOLDED_RESULT)).toBe(
      'You folded. Net -$20. The dealer had a pair of tens (qualifies). You would have lost $30 (folding saved $10).',
    );
  });
  it('compares only the ante and blind when a Trips bet is up (trips settles either way)', () => {
    const fold = (player: string, dealer: string, board: string) => {
      const p = parseCards(player);
      const d = parseCards(dealer);
      const b = parseCards(board);
      const deal = {
        player: [p[0]!, p[1]!] as const,
        dealer: [d[0]!, d[1]!] as const,
        board: [b[0]!, b[1]!, b[2]!, b[3]!, b[4]!] as const,
        forced: true,
      };
      return settleHand(deal, { ante: 1000, blind: 1000, trips: 1000 }, null, true, resolveRules());
    };
    // Trips aces (pays 3:1 = +$30) beat the dealer's two pair. Folding lost ante + blind = -$20,
    // so the fold's net is +$10. Playing would have won ante $10 + play $10 (blind pushes under a
    // straight) = +$20. Folding cost $20 - (-$20) = $40. The old code gave $10.
    const won = fold('Ah Ad', '7d 9c', 'Ac 7h 2d 9s 4c');
    expect(won.wagers.find((w) => w.wager === 'trips')!.profit).toBe(3000);
    expect(won.net).toBe(1000);
    expect(foldRevealText(won)).toContain('You would have won $20 (folding cost $40).');
    // Trips miss (-$10) and the dealer's three nines beat ace high. Ante + blind lost = -$20;
    // playing would have lost $30 (ante, blind, play). Folding saved $30 - $20 = $10.
    // The old code saw the trips loss and printed no difference at all.
    const lost = fold('As Kd', '9d 9c', 'Qc 7h 2d 9s 4c');
    expect(lost.wagers.find((w) => w.wager === 'trips')!.profit).toBe(-1000);
    expect(lost.net).toBe(-3000);
    expect(foldRevealText(lost)).toContain('You would have lost $30 (folding saved $10).');
  });
  it('announces the real net once, with the dealer and the would-have line', () => {
    expect(foldAnnouncement(FOLDED_RESULT)).toBe(
      'You folded. Net -$20. The dealer had a pair of tens (qualifies). You would have lost $30 (folding saved $10).',
    );
  });
  it('compares only the ante and blind when a Trips bet is up (trips settles either way)', () => {
    const fold = (player: string, dealer: string, board: string) => {
      const p = parseCards(player);
      const d = parseCards(dealer);
      const b = parseCards(board);
      const deal = {
        player: [p[0]!, p[1]!] as const,
        dealer: [d[0]!, d[1]!] as const,
        board: [b[0]!, b[1]!, b[2]!, b[3]!, b[4]!] as const,
        forced: true,
      };
      return settleHand(deal, { ante: 1000, blind: 1000, trips: 1000 }, null, true, resolveRules());
    };
    // Trips aces pay +$30 (3:1) and beat the dealer's two pair. Folding lost ante + blind = -$20,
    // so the fold's net is +$10. Playing would have won ante +$10 and play +$10 (blind pushes under
    // a straight) = +$20. Folding cost $20 - (-$20) = $40. The old code gave $10.
    const won = fold('Ah Ad', '7d 9c', 'Ac 7h 2d 9s 4c');
    expect(won.wagers.find((w) => w.wager === 'trips')!.profit).toBe(3000);
    expect(won.net).toBe(1000);
    expect(foldRevealText(won)).toContain('You would have won $20 (folding cost $40).');
    // Trips miss (-$10); the dealer's three nines beat ace high. Ante + blind lost = -$20 and
    // playing would have lost $30 (ante, blind, play), so folding saved $10. The old code saw
    // the trips loss and printed no difference at all.
    const lost = fold('As Kd', '9d 9c', 'Qc 7h 2d 9s 4c');
    expect(lost.wagers.find((w) => w.wager === 'trips')!.profit).toBe(-1000);
    expect(lost.net).toBe(-3000);
    expect(foldRevealText(lost)).toContain('You would have lost $30 (folding saved $10).');
  });
  it('does the saved/cost arithmetic in integer cents', () => {
    // Ante and blind lost $10.50 in total, so folding saved $30.01 - $10.50... see below.
    const odd = {
      ...FOLDED_RESULT,
      net: -1050,
      wagers: [
        { ...FOLDED_RESULT.wagers[0]!, profit: -525 },
        { ...FOLDED_RESULT.wagers[1]!, profit: -525 },
      ],
      ifPlayed: { outcome: 'lose' as const, net: -2001 },
    };
    // -$20.01 played vs -$10.50 folded: folding saved $9.51.
    expect(foldRevealText(odd)).toContain('You would have lost $20.01 (folding saved $9.51).');
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
