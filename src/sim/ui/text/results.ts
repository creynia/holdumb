// Text helpers (results); re-exported unchanged by ../text.ts (I082 split).
import { formatMoney, nearMisses } from '../../engine';
import { signedMoney } from './format';
import { BLIND_PAYTABLES, DEFAULT_PAYTABLE_PRESET, TRIPS_PAYTABLES } from '../../engine/paytables';
import type { GameState, Paytable, TripsPaytableId } from '../../engine/types';
import type { Deal, Cents, EvaluatedHand, HandResult, WagerSettlement } from '../../engine';
import type { DecisionPreview, Fraction } from '../../math';
import {
  CATEGORY_NAME,
  describeAllRanks,
  handName,
  handNameVs,
  plural,
  withArticle,
} from './hands';

const WAGER_NAME = { ante: 'Ante', blind: 'Blind', play: 'Play', trips: 'Trips' } as const;

/** The paytables a settlement's odds come from: the blind table and the active Trips preset. */
export interface SettlementTables {
  blind: Paytable;
  trips: Paytable;
}
export const tablesFor = (tripsId: TripsPaytableId): SettlementTables => ({
  blind: BLIND_PAYTABLES['blind-standard'],
  trips: TRIPS_PAYTABLES[tripsId],
});
const DEFAULT_TABLES = tablesFor(DEFAULT_PAYTABLE_PRESET);

function describeSettlement(s: WagerSettlement, hand: EvaluatedHand, t: SettlementTables): string {
  const name = WAGER_NAME[s.wager];
  if (s.result === 'push') {
    const why =
      s.reason === 'blind-push-under-straight'
        ? ' (needs a straight)'
        : s.reason === 'dealer-not-qualified'
          ? " (dealer doesn't qualify)"
          : '';
    return `${name} push${why}`;
  }
  const money = signedMoney(s.profit);
  if (s.result !== 'win') return `${name} ${money}`;
  const hn = CATEGORY_NAME[hand.category];
  if (s.wager === 'blind') {
    const odds = t.blind.pays[hand.category];
    return odds ? `${name} ${money} (${hn} pays ${odds[0]} to ${odds[1]})` : `${name} ${money}`;
  }
  if (s.wager === 'trips') {
    const odds = t.trips.pays[hand.category];
    return odds
      ? `${name} ${money} (${hn} pays ${odds[0]} to ${odds[1]} on ${t.trips.label})`
      : `${name} ${money}`;
  }
  return `${name} ${money}`;
}

/** "a pair of kings", "two pair", "three queens", "ace high": the right article for a hand name. */
function tieLead(p: EvaluatedHand, d: EvaluatedHand): string {
  const sameCards = p.best5.length === d.best5.length && p.best5.every((c) => d.best5.includes(c));
  if (p.value === d.value && sameCards)
    return `Tie: you both play the board (${describeAllRanks(p)}).`;
  return 'Tie: same five-card hand.';
}

/** The player's near-miss suffix, "(four clubs, one short of a flush)", or '' (settled hands only). */
function nearSuffix(r: HandResult, deal?: Deal): string {
  const note = playerNearMiss(r, deal);
  return note ? ` (${note})` : '';
}

/** The one near-miss note for the player's seven cards, or null. Never for folds or the dealer. */
export function playerNearMiss(r: HandResult, deal?: Deal): string | null {
  if (!deal || r.outcome === 'fold') return null;
  return nearMisses([...deal.player, ...deal.board], r.player.category)[0] ?? null;
}

/** A hand's felt label: its name, plus the player's near-miss note when there is one. */
export function handLabel(h: EvaluatedHand, note?: string | null): string {
  return `${handName(h)}${note ? ` (${note})` : ''}`;
}

/** The result toast: "Your pair of kings beats the dealer's pair of nines. Ante +$10, ... Net +$50." */
export function describeResult(
  r: HandResult,
  t: SettlementTables = DEFAULT_TABLES,
  deal?: Deal,
): string {
  const near = nearSuffix(r, deal);
  let lead: string;
  if (r.outcome === 'win') {
    const p = `${handNameVs(r.player, r.dealer)}${near}`;
    lead = `Your ${p} ${plural(r.player) ? 'beat' : 'beats'} the dealer's ${handNameVs(r.dealer, r.player)}.`;
  } else if (r.outcome === 'lose') {
    const d = handNameVs(r.dealer, r.player);
    lead = `The dealer's ${d} ${plural(r.dealer) ? 'beat' : 'beats'} your ${handNameVs(r.player, r.dealer)}${near}.`;
  } else if (r.outcome === 'tie') lead = tieLead(r.player, r.dealer);
  else lead = 'Folded.';
  const parts = r.wagers.map((w) => describeSettlement(w, r.player, t)).join(', ');
  return `${lead} ${parts}. Net ${signedMoney(r.net)}.`;
}

/** The settled toast, with the Trips preset the hand actually settled at (the event's own rules). */
export function settledToastText(e: { result: HandResult; state: GameState }): string {
  return describeResult(e.result, tablesFor(e.state.rules.tripsPaytable), e.state.hand?.deal);
}

/** The one spoken fold announcement: the real net, then the reveal's dealer and would-have lines. */
export function foldAnnouncement(r: HandResult): string {
  return `You folded. Net ${signedMoney(r.net)}. ${foldRevealText(r)}`;
}

/**
 * D7: what the fold would have been. The money difference is ifPlayed.net minus the fold's ante and
 * blind result: positive means folding cost that much, negative means folding saved it.
 */
export function foldRevealText(r: HandResult): string {
  const d = handName(r.dealer);
  const q = r.dealerQualifies ? 'qualifies' : "doesn't qualify";
  const had = `The dealer had ${withArticle(d)} (${q}).`;
  if (!r.ifPlayed) return had;
  const { outcome, net } = r.ifPlayed;
  // Trips settles the same whether you fold or play, and ifPlayed leaves it out, so compare
  // against what the fold itself lost: ante + blind.
  const folded = r.wagers
    .filter((w) => w.wager === 'ante' || w.wager === 'blind')
    .reduce((s, w) => s + w.profit, 0);
  const diff = net - folded;
  const effect =
    diff < 0
      ? ` (folding saved ${formatMoney(-diff)})`
      : diff > 0
        ? ` (folding cost ${formatMoney(diff)})`
        : '';
  const would =
    outcome === 'win'
      ? `You would have won ${formatMoney(Math.abs(net))}${effect}.`
      : outcome === 'lose'
        ? `You would have lost ${formatMoney(Math.abs(net))}${effect}.`
        : `You would have pushed${effect}.`;
  return `${had} ${would}`;
}

export function money(c: Cents, sign = false): string {
  return formatMoney(c, { sign });
}

export type EvStatus = 'pending' | 'ready' | 'error';

/**
 * A preview is usable only if it has options and is not an all-zero placeholder (e.g. from a
 * missing table). Anything else must show "Calculating…" or "EV not available", never a tier.
 */
export function isUsablePreview(p: DecisionPreview | null | undefined): p is DecisionPreview {
  if (!p || p.options.length === 0) return false;
  const frac = (f: unknown): boolean =>
    !!f && typeof (f as Fraction).num === 'bigint' && (f as Fraction).den !== 0n;
  if (p.options.some((o) => !frac(o.ev) || !frac(o.evCents) || !o.label || !o.tier)) return false;
  return !p.options.every((o) => o.ev.num === 0n);
}
