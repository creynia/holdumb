// Strict scene validation (simulator.md 4.1, decisions D25-D27a). Runs at build time on every
// lesson scene and at runtime on anything handed to the Simulator. Returns every error found.
import { parseCard } from '../engine/cards';
import { DEFAULT_RULES } from '../engine/rules';
import type { Action, DecisionStreet, ForcedDeal, GameEvent, Street } from '../engine/types';
import { STRATEGY_IDS } from '../strategy/ids';
import {
  ACTION_TYPES,
  OPTION_KEYS,
  actionOfOption,
  effectiveGate,
  gateAllows,
  gatedOptions,
  matchAction,
} from './gate';
import type { Gate } from './gate';
import type { ActionMatcher, Condition, OptionKey, SceneConfig, SceneStep } from './types';

export type SceneValidation = { ok: true; scene: SceneConfig } | { ok: false; errors: string[] };

const SCENE_KEYS = new Set([
  'id',
  'version',
  'title',
  'rules',
  'bankroll',
  'bets',
  'seed',
  'deals',
  'onDealsExhausted',
  'startAt',
  'allowedActions',
  'allowedOptions',
  'highlight',
  'showEV',
  'evDetail',
  'whyOpen',
  'revealDealer',
  'practice',
  'ui',
  'autoPlay',
  'steps',
]);
const STEP_KEYS = new Set([
  'id',
  'text',
  'hint',
  'math',
  'setup',
  'deals',
  'startAt',
  'allowedActions',
  'allowedOptions',
  'highlight',
  'expect',
  'completeWhen',
  'advance',
  'showEV',
  'revealDealer',
]);
const UI_KEYS = new Set([
  'orientation',
  'chips',
  'defaultChip',
  'showChipRack',
  'showBankroll',
  'showHistory',
  'showSettings',
  'showSession',
  'speed',
  'compact',
]);
const DEAL_KEYS = ['player', 'dealer', 'flop', 'turn', 'river'] as const;
const EVENT_TYPES: readonly GameEvent['type'][] = [
  'bet-set',
  'hand-started',
  'player-dealt',
  'dealer-dealt',
  'checked',
  'played',
  'folded',
  'board-dealt',
  'dealer-revealed',
  'showdown',
  'wager-settled',
  'hand-settled',
  'cleared',
];
const STREETS: readonly Street[] = ['betting', 'preflop', 'flop', 'river', 'settled'];
const WAGERS = ['ante', 'blind', 'play', 'trips'];
const CIRCLES = ['trips', 'ante', 'blind', 'play'];
const COND_KEYS = [
  'all',
  'any',
  'action',
  'event',
  'hands',
  'street',
  'handResult',
  'betOnFelt',
  'bankrollAtLeast',
  'bankrollAtMost',
  'previewed',
  'bestDecisions',
  'autoPlayCompleted',
  'acknowledged',
  'tapped',
];

type Obj = Record<string, unknown>;
const show = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isOption = (v: unknown): v is OptionKey =>
  typeof v === 'string' && (OPTION_KEYS as readonly string[]).includes(v);

class Errs {
  list: string[] = [];
  add(path: string, msg: string): void {
    this.list.push(`${path}: ${msg}`);
  }
}

function money(e: Errs, path: string, v: unknown, unit = true): void {
  if (!isInt(v) || v < 0)
    e.add(path, `must be a non-negative integer number of cents, got ${String(v)}`);
  else if (unit && v % DEFAULT_RULES.betUnit !== 0)
    e.add(path, `must be a multiple of ${DEFAULT_RULES.betUnit} cents, got ${v}`);
}

function keysOnly(e: Errs, path: string, o: Obj, allowed: ReadonlySet<string>): void {
  for (const k of Object.keys(o)) if (!allowed.has(k)) e.add(path, `unknown key "${k}"`);
}

function checkActionList(e: Errs, path: string, v: unknown): void {
  if (!Array.isArray(v)) return e.add(path, 'must be an array');
  for (const a of v)
    if (!(ACTION_TYPES as readonly unknown[]).includes(a))
      e.add(path, `unknown action "${String(a)}"`);
}
function checkOptionList(e: Errs, path: string, v: unknown): void {
  if (!Array.isArray(v)) return e.add(path, 'must be an array');
  for (const a of v) if (!isOption(a)) e.add(path, `unknown option "${String(a)}"`);
}

/** Card codes parse, and no card appears twice in the deal. Returns the number of cards. */
function checkDeal(e: Errs, path: string, v: unknown): void {
  if (!isObj(v)) return e.add(path, 'must be an object');
  const seen = new Set<string>();
  const one = (p: string, c: unknown): void => {
    if (typeof c !== 'string') return e.add(p, 'card must be a string like "As"');
    try {
      parseCard(c);
    } catch {
      return e.add(p, `bad card code "${c}"`);
    }
    if (seen.has(c)) e.add(p, `Duplicate card "${c}" in this deal`);
    seen.add(c);
  };
  for (const k of Object.keys(v)) {
    if (!(DEAL_KEYS as readonly string[]).includes(k)) e.add(path, `unknown key "${k}"`);
  }
  const lens = { player: 2, dealer: 2, flop: 3 } as const;
  for (const k of DEAL_KEYS) {
    const x = v[k];
    if (x === undefined) continue;
    if (k === 'turn' || k === 'river') one(`${path}.${k}`, x);
    else if (!Array.isArray(x) || x.length !== lens[k])
      e.add(`${path}.${k}`, `must be a list of ${lens[k]} cards`);
    else x.forEach((c, i) => one(`${path}.${k}[${i}]`, c));
  }
}

function checkStartAt(e: Errs, path: string, v: unknown): void {
  if (!isObj(v)) return e.add(path, 'must be an object {street, deal, play?}');
  keysOnly(e, path, v, new Set(['street', 'deal', 'play']));
  const street = v.street;
  if (street !== 'preflop' && street !== 'flop' && street !== 'river')
    return e.add(path, 'street must be preflop, flop or river (D25: startAt is {street, deal})');
  checkDeal(e, `${path}.deal`, v.deal);
  if (isObj(v.deal)) {
    const d = v.deal;
    const need =
      street === 'preflop'
        ? ['player']
        : street === 'flop'
          ? ['player', 'flop']
          : ['player', 'flop', 'turn', 'river'];
    for (const k of need) if (d[k] === undefined) e.add(path, `a ${street} start needs deal.${k}`);
  }
  if (v.play !== undefined) {
    const ok =
      (street === 'preflop' && (v.play === 3 || v.play === 4)) ||
      (street === 'flop' && v.play === 2) ||
      (street === 'river' && v.play === 1);
    if (!ok) e.add(`${path}.play`, `${show(v.play)}x is not a ${street} play`);
  }
}

function checkMatcher(e: Errs, path: string, m: unknown): void {
  if (!isObj(m)) return e.add(path, 'must be an object');
  keysOnly(
    e,
    path,
    m,
    new Set(['type', 'option', 'wager', 'amount', 'minAmount', 'maxAmount', 'best']),
  );
  if (!(ACTION_TYPES as readonly unknown[]).includes(m.type))
    e.add(path, `unknown action type "${String(m.type)}"`);
  if (m.option !== undefined) {
    const list = Array.isArray(m.option) ? (m.option as unknown[]) : [m.option];
    for (const o of list) {
      if (!isOption(o)) e.add(path, `unknown option "${String(o)}"`);
      else if (m.type === 'play' && !o.startsWith('play-'))
        e.add(path, `option "${o}" is not a play`);
      else if (m.type === 'check' && o !== 'check') e.add(path, `option "${o}" is not a check`);
      else if (m.type === 'fold' && o !== 'fold') e.add(path, `option "${o}" is not a fold`);
      else if (m.type !== 'play' && m.type !== 'check' && m.type !== 'fold')
        e.add(path, 'option only applies to check, play and fold');
    }
  }
  if (m.wager !== undefined && m.wager !== 'ante' && m.wager !== 'trips')
    e.add(path, 'wager must be ante or trips');
  for (const k of ['amount', 'minAmount', 'maxAmount'])
    if (m[k] !== undefined) money(e, `${path}.${k}`, m[k]);
  if (m.best !== undefined && typeof m.best !== 'boolean') e.add(path, 'best must be a boolean');
}

function checkCondition(e: Errs, path: string, c: unknown): void {
  if (!isObj(c)) return e.add(path, 'condition must be an object');
  const keys = Object.keys(c).filter((k) => k !== 'count');
  if (keys.length !== 1)
    return e.add(path, `condition needs exactly one kind, got [${keys.join(', ')}]`);
  const kind = keys[0]!;
  if (!COND_KEYS.includes(kind)) return e.add(path, `unknown completeWhen kind "${kind}"`);
  if (c.count !== undefined && kind !== 'action' && kind !== 'event')
    e.add(path, 'count only applies to action and event');
  if (c.count !== undefined && (!isInt(c.count) || c.count < 1))
    e.add(path, 'count must be a positive integer');
  const v = c[kind];
  const p = `${path}.${kind}`;
  switch (kind) {
    case 'all':
    case 'any':
      if (!Array.isArray(v) || v.length === 0) e.add(p, 'must be a non-empty array');
      else v.forEach((x, i) => checkCondition(e, `${p}[${i}]`, x));
      break;
    case 'action':
      checkMatcher(e, p, v);
      break;
    case 'event':
      if (!(EVENT_TYPES as readonly unknown[]).includes(v))
        e.add(p, `unknown event "${String(v)}"`);
      break;
    case 'hands':
      if (!isInt(v) || v < 1) e.add(p, 'must be a positive integer');
      break;
    case 'street':
      if (!(STREETS as readonly unknown[]).includes(v)) e.add(p, `unknown street "${String(v)}"`);
      break;
    case 'handResult':
      if (!isObj(v)) e.add(p, 'must be an object');
      else {
        keysOnly(e, p, v, new Set(['outcome', 'minNet']));
        if (
          v.outcome !== undefined &&
          !['win', 'lose', 'tie', 'fold'].includes(v.outcome as string)
        )
          e.add(p, `unknown outcome "${show(v.outcome)}"`);
        if (v.minNet !== undefined && !isInt(v.minNet)) e.add(p, 'minNet must be integer cents');
      }
      break;
    case 'betOnFelt':
      if (!isObj(v)) e.add(p, 'must be an object');
      else {
        keysOnly(e, p, v, new Set(['wager', 'minAmount']));
        if (!WAGERS.includes(v.wager as string)) e.add(p, `unknown wager "${String(v.wager)}"`);
        if (v.minAmount !== undefined) money(e, `${p}.minAmount`, v.minAmount);
      }
      break;
    case 'bankrollAtLeast':
    case 'bankrollAtMost':
      money(e, p, v, false);
      break;
    case 'previewed':
      if (!isObj(v)) e.add(p, 'must be an object');
      else {
        keysOnly(e, p, v, new Set(['option', 'whyOpened']));
        if (v.option !== undefined && !isOption(v.option))
          e.add(p, `unknown option "${show(v.option)}"`);
        if (v.whyOpened !== undefined && typeof v.whyOpened !== 'boolean')
          e.add(p, 'whyOpened must be a boolean');
      }
      break;
    case 'bestDecisions':
      if (!isObj(v)) e.add(p, 'must be an object');
      else {
        keysOnly(e, p, v, new Set(['count', 'street']));
        if (!isInt(v.count) || v.count < 1) e.add(p, 'count must be a positive integer');
        if (v.street !== undefined && !['preflop', 'flop', 'river'].includes(v.street as string))
          e.add(p, 'street must be preflop, flop or river');
      }
      break;
    case 'autoPlayCompleted':
      if (!isObj(v)) e.add(p, 'must be an object');
      else {
        keysOnly(e, p, v, new Set(['minHands', 'strategy']));
        if (v.minHands !== undefined && (!isInt(v.minHands) || v.minHands < 1))
          e.add(p, 'minHands must be a positive integer');
        if (v.strategy !== undefined && !(STRATEGY_IDS as readonly unknown[]).includes(v.strategy))
          e.add(p, `unknown strategy "${show(v.strategy)}"`);
      }
      break;
    case 'acknowledged':
      if (v !== true) e.add(p, 'must be true');
      break;
    case 'tapped':
      if (v !== 'session' && !CIRCLES.includes(v as string))
        e.add(p, `unknown tap target "${String(v)}"`);
      break;
  }
}

function checkSpec(e: Errs, path: string, s: unknown): void {
  if (!isObj(s)) return e.add(path, 'must be {id, ante, trips}');
  if (!(STRATEGY_IDS as readonly unknown[]).includes(s.id))
    e.add(path, `unknown strategy id "${String(s.id)}"`);
  money(e, `${path}.ante`, s.ante);
  money(e, `${path}.trips`, s.trips);
}

function checkBets(e: Errs, path: string, v: unknown): void {
  if (!isObj(v)) return e.add(path, 'must be an object');
  keysOnly(e, path, v, new Set(['ante', 'trips']));
  if (v.ante !== undefined) {
    money(e, `${path}.ante`, v.ante);
    if (isInt(v.ante) && v.ante < DEFAULT_RULES.anteMin)
      e.add(`${path}.ante`, `below the ${DEFAULT_RULES.anteMin} cent minimum`);
  }
  if (v.trips !== undefined) {
    money(e, `${path}.trips`, v.trips);
    if (isInt(v.trips) && v.trips > 0 && v.trips < DEFAULT_RULES.tripsMin)
      e.add(`${path}.trips`, `below the ${DEFAULT_RULES.tripsMin} cent minimum`);
  }
}

// ---------- symbolic exploration (dead ends, reachable streets) ----------

interface Sym {
  street: Street;
  hands: number;
  log: { action: Action; best: boolean }[];
}
const symKey = (s: Sym): string =>
  `${s.street}|${s.hands}|${s.log.map((l) => JSON.stringify(l.action)).join(',')}`;

/** Optimistic satisfaction: anything the learner can always do (preview, tap, press) counts as done. */
function symSatisfied(c: Condition, s: Sym): boolean {
  if ('all' in c) return c.all.every((x) => symSatisfied(x, s));
  if ('any' in c) return c.any.some((x) => symSatisfied(x, s));
  if ('action' in c) {
    const n = s.log.filter((l) => matchAction(c.action, l.action, l.best)).length;
    return n >= (c.count ?? 1);
  }
  if ('event' in c) {
    const has = (t: GameEvent['type']): number => {
      const acts = s.log.map((l) => l.action.type);
      switch (t) {
        case 'hand-started':
          return acts.filter((a) => a === 'deal').length;
        case 'hand-settled':
        case 'dealer-revealed':
        case 'wager-settled':
          return s.hands;
        case 'checked':
          return acts.filter((a) => a === 'check').length;
        case 'played':
          return acts.filter((a) => a === 'play').length;
        case 'folded':
          return acts.filter((a) => a === 'fold').length;
        default:
          return 1;
      }
    };
    return has(c.event) >= (c.count ?? 1);
  }
  if ('hands' in c) return s.hands >= Math.min(c.hands, 2);
  if ('street' in c) return s.street === c.street;
  if ('bestDecisions' in c) {
    const n = s.log.filter((l) => {
      if (!l.best) return false;
      return true;
    }).length;
    return n >= Math.min(c.bestDecisions.count, 3);
  }
  return true; // handResult, betOnFelt, bankroll*, previewed, autoPlayCompleted, acknowledged, tapped
}

function bestStreetsOf(c: Condition): DecisionStreet[] {
  if ('all' in c) return c.all.flatMap(bestStreetsOf);
  if ('any' in c) return c.any.flatMap(bestStreetsOf);
  if ('bestDecisions' in c && c.bestDecisions.street) return [c.bestDecisions.street];
  return [];
}

interface Explored {
  exits: Sym[];
  visited: Set<DecisionStreet>;
  deadEnds: DecisionStreet[];
}

function explore(
  cond: Condition,
  gate: Gate,
  expect: readonly ActionMatcher[] | undefined,
  entry: Sym[],
): Explored {
  const out: Explored = { exits: [], visited: new Set(), deadEnds: [] };
  const stack: Sym[] = entry.map((s) => ({ ...s, hands: 0, log: [] }));
  const seen = new Set<string>();
  while (stack.length) {
    const s = stack.pop()!;
    const k = symKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    if (symSatisfied(cond, s)) {
      out.exits.push(s);
      continue;
    }
    if (s.log.length > 10) continue;
    if (s.street === 'preflop' || s.street === 'flop' || s.street === 'river') {
      out.visited.add(s.street);
      let opts = gatedOptions(gate, s.street);
      if (expect && expect.length)
        opts = opts.filter((o) => expect.some((m) => matchAction(m, actionOfOption(o), true)));
      if (opts.length === 0) {
        if (!out.deadEnds.includes(s.street)) out.deadEnds.push(s.street);
        continue;
      }
      for (const o of opts) {
        const action = actionOfOption(o);
        const log = [...s.log, { action, best: true }];
        if (action.type === 'check')
          stack.push({ street: s.street === 'preflop' ? 'flop' : 'river', hands: s.hands, log });
        else stack.push({ street: 'settled', hands: s.hands + 1, log });
      }
    } else if (gateAllows(gate, { type: 'deal' })) {
      stack.push({
        street: 'preflop',
        hands: s.hands,
        log: [...s.log, { action: { type: 'deal' }, best: false }],
      });
    }
  }
  return out;
}

function dedupe(states: Sym[]): Sym[] {
  const m = new Map<string, Sym>();
  for (const s of states) m.set(s.street, { street: s.street, hands: 0, log: [] });
  return [...m.values()];
}

function hasHandOutcome(c: Condition): boolean {
  if ('all' in c) return c.all.some(hasHandOutcome);
  if ('any' in c) return c.any.some(hasHandOutcome);
  return 'handResult' in c && ['win', 'lose', 'tie'].includes(c.handResult.outcome as string);
}
const fullyForced = (d: ForcedDeal | undefined): boolean =>
  !!d && !!d.player && !!d.dealer && !!d.flop && !!d.turn && !!d.river;

function semantic(scene: SceneConfig, e: Errs): void {
  const steps = scene.steps ?? [];
  const startEntry = (s: { street: DecisionStreet; play?: number } | undefined): Sym[] => [
    { street: s ? (s.play ? 'settled' : s.street) : 'betting', hands: 0, log: [] },
  ];
  if (steps.length === 0) {
    const gate = effectiveGate(scene);
    const r = explore({ hands: 2 }, gate, undefined, startEntry(scene.startAt));
    for (const st of r.deadEnds) e.add('scene', `dead end: the ${st} has no allowed option (D27a)`);
    return;
  }
  const ids = new Set<string>();
  let entry = startEntry(scene.startAt);
  let forced: ForcedDeal | undefined = scene.deals?.[0] ?? scene.startAt?.deal;
  steps.forEach((step, i) => {
    const path = `steps[${i}] "${step.id}"`;
    if (ids.has(step.id)) e.add(path, 'duplicate step id');
    ids.add(step.id);
    if (step.startAt) {
      entry = startEntry(step.startAt);
      forced = step.startAt.deal;
    } else if (step.deals?.length) forced = step.deals[0];
    if (hasHandOutcome(step.completeWhen) && !fullyForced(forced))
      e.add(
        path,
        'handResult win/lose/tie needs the hand fully forced (player, dealer, flop, turn, river), or the result is not guaranteed',
      );
    const gate = effectiveGate(scene, step);
    const r = explore(step.completeWhen, gate, step.expect, entry);
    for (const st of r.deadEnds)
      e.add(path, `dead end: the ${st} has no allowed option, so the scene cannot continue (D27a)`);
    for (const st of bestStreetsOf(step.completeWhen))
      if (!r.visited.has(st))
        e.add(path, `bestDecisions street "${st}" is never reached while this step is active`);
    if (r.exits.length === 0 && r.deadEnds.length === 0)
      e.add(path, 'this step can never complete with its allowed actions');
    if (r.exits.length) entry = dedupe(r.exits);
  });
}

function usesBest(step: SceneStep): boolean {
  const inCond = (c: Condition): boolean =>
    'all' in c
      ? c.all.some(inCond)
      : 'any' in c
        ? c.any.some(inCond)
        : 'bestDecisions' in c || ('action' in c && !!c.action.best);
  return !!step.expect?.some((m) => m.best) || inCond(step.completeWhen);
}

export function validateScene(json: unknown): SceneValidation {
  const e = new Errs();
  if (!isObj(json)) return { ok: false, errors: ['scene must be an object'] };
  const s = json;
  keysOnly(e, 'scene', s, SCENE_KEYS);
  if (typeof s.id !== 'string' || s.id === '') e.add('scene.id', 'must be a non-empty string');
  if (s.version !== 1) e.add('scene.version', 'must be 1');
  if (s.bankroll !== undefined) money(e, 'scene.bankroll', s.bankroll, false);
  if (s.bets !== undefined) checkBets(e, 'scene.bets', s.bets);
  if (isObj(s.bets) && isInt(s.bankroll) && isInt(s.bets.ante)) {
    const trips = isInt(s.bets.trips) ? s.bets.trips : 0;
    if (s.bankroll < s.bets.ante * 2 + trips)
      e.add('scene.bankroll', 'cannot cover the preset bets');
  }
  if (s.seed !== undefined && !isInt(s.seed)) e.add('scene.seed', 'must be an integer');
  if (s.deals !== undefined) {
    if (!Array.isArray(s.deals)) e.add('scene.deals', 'must be an array');
    else s.deals.forEach((d, i) => checkDeal(e, `scene.deals[${i}]`, d));
  }
  if (s.startAt !== undefined) checkStartAt(e, 'scene.startAt', s.startAt);
  if (s.allowedActions !== undefined) checkActionList(e, 'scene.allowedActions', s.allowedActions);
  if (s.allowedOptions !== undefined) checkOptionList(e, 'scene.allowedOptions', s.allowedOptions);
  if (s.rules !== undefined && !isObj(s.rules)) e.add('scene.rules', 'must be an object');
  if (s.ui !== undefined) {
    if (!isObj(s.ui)) e.add('scene.ui', 'must be an object');
    else {
      keysOnly(e, 'scene.ui', s.ui, UI_KEYS);
      if (Array.isArray(s.ui.chips))
        s.ui.chips.forEach((c, i) => money(e, `scene.ui.chips[${i}]`, c));
    }
  }
  if (s.autoPlay !== undefined) {
    const a = s.autoPlay;
    if (!isObj(a)) e.add('scene.autoPlay', 'must be an object');
    else {
      keysOnly(
        e,
        'scene.autoPlay',
        a,
        new Set(['enabled', 'strategies', 'defaultStrategy', 'handOptions', 'sessions', 'compare']),
      );
      if (typeof a.enabled !== 'boolean') e.add('scene.autoPlay.enabled', 'must be a boolean');
      if (a.defaultStrategy !== undefined)
        checkSpec(e, 'scene.autoPlay.defaultStrategy', a.defaultStrategy);
      if (Array.isArray(a.compare))
        a.compare.forEach((c, i) => checkSpec(e, `scene.autoPlay.compare[${i}]`, c));
      if (Array.isArray(a.strategies))
        for (const id of a.strategies)
          if (!(STRATEGY_IDS as readonly unknown[]).includes(id))
            e.add('scene.autoPlay.strategies', `unknown strategy id "${String(id)}"`);
      for (const k of ['handOptions', 'sessions'])
        if (
          a[k] !== undefined &&
          (!Array.isArray(a[k]) || (a[k] as unknown[]).some((n) => !isInt(n) || n < 1))
        )
          e.add(`scene.autoPlay.${k}`, 'must be a list of positive integers');
    }
  }
  if (s.steps !== undefined) {
    if (!Array.isArray(s.steps)) e.add('scene.steps', 'must be an array');
    else
      s.steps.forEach((step: unknown, i) => {
        const p = `steps[${i}]`;
        if (!isObj(step)) return e.add(p, 'must be an object');
        keysOnly(e, p, step, STEP_KEYS);
        if (typeof step.id !== 'string' || step.id === '')
          e.add(`${p}.id`, 'must be a non-empty string');
        if (typeof step.text !== 'string') e.add(`${p}.text`, 'must be a string');
        if (step.completeWhen === undefined) e.add(`${p}.completeWhen`, 'is required');
        else checkCondition(e, `${p}.completeWhen`, step.completeWhen);
        if (step.advance !== undefined && step.advance !== 'auto' && step.advance !== 'button')
          e.add(`${p}.advance`, 'must be auto or button');
        if (step.allowedActions !== undefined)
          checkActionList(e, `${p}.allowedActions`, step.allowedActions);
        if (step.allowedOptions !== undefined)
          checkOptionList(e, `${p}.allowedOptions`, step.allowedOptions);
        if (step.deals !== undefined) {
          if (!Array.isArray(step.deals)) e.add(`${p}.deals`, 'must be an array');
          else step.deals.forEach((d, j) => checkDeal(e, `${p}.deals[${j}]`, d));
        }
        if (step.startAt !== undefined) checkStartAt(e, `${p}.startAt`, step.startAt);
        if (step.setup !== undefined) {
          if (!isObj(step.setup)) e.add(`${p}.setup`, 'must be an object');
          else {
            keysOnly(e, `${p}.setup`, step.setup, new Set(['bankroll', 'bets']));
            if (step.setup.bankroll !== undefined)
              money(e, `${p}.setup.bankroll`, step.setup.bankroll, false);
            if (step.setup.bets !== undefined) checkBets(e, `${p}.setup.bets`, step.setup.bets);
          }
        }
        if (step.expect !== undefined) {
          if (!Array.isArray(step.expect)) e.add(`${p}.expect`, 'must be an array');
          else step.expect.forEach((m, j) => checkMatcher(e, `${p}.expect[${j}]`, m));
        }
      });
  }
  // The semantic pass needs a well-formed scene.
  if (e.list.length === 0) {
    const scene = json as unknown as SceneConfig;
    const steps = scene.steps ?? [];
    steps.forEach((step, i) => {
      if (usesBest(step) && (step.showEV ?? scene.showEV) === false && !scene.practice)
        e.add(
          `steps[${i}] "${step.id}"`,
          'best-decision matching needs showEV on (or practice mode)',
        );
    });
    semantic(scene, e);
    if (e.list.length === 0) return { ok: true, scene };
  }
  return { ok: false, errors: e.list };
}
