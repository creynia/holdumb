// Scene runner (simulator.md 4.1, decisions D26/D27): pure functions over a SceneRuntime.
// The container (driver.ts) owns the engine state and applies each step's `deals` / `startAt`;
// this file decides gating, counts inputs and says when a step is complete.
import type { Action, Cents, DecisionStreet, HandResult, Street, WagerId } from '../engine/types';
import { effectiveGate, gateAllows, matchAction } from './gate';
import type { Gate } from './gate';
import type { Condition, SceneConfig, SceneInput, SceneRuntime, SceneStep } from './types';

/** What the runner may look at after an input (level-triggered conditions read this). */
export interface SceneContext {
  street: Street;
  /** D38: bankroll conditions test equity, never the rack alone. */
  equity: Cents;
  bets: Readonly<Record<WagerId, Cents>>;
  /** Hands settled in the session so far (`state.stats.hands`). */
  hands: number;
  /** The street an action was taken on (for `bestDecisions.street`). */
  streetBefore?: Street;
}

export type GateResult =
  { ok: true } | { ok: false; code: 'not-allowed-by-scene'; message: string };

export function initScene(scene: SceneConfig, hands = 0): SceneRuntime {
  const done = (scene.steps?.length ?? 0) === 0;
  return { stepIndex: 0, stepStartHand: hands, counters: {}, done, satisfied: false };
}

export function currentStep(scene: SceneConfig, rt: SceneRuntime): SceneStep | undefined {
  return rt.done ? undefined : scene.steps?.[rt.stepIndex];
}

/** The gate in force: the current step's (over the scene's), or the scene's alone once done. */
export function activeGate(scene: SceneConfig, rt: SceneRuntime): Gate {
  return effectiveGate(scene, currentStep(scene, rt));
}

export const DEFAULT_REJECT = 'Not in this step. Follow the instruction above the table.';

/**
 * Decides whether the learner's action is accepted now. `wasBest` is the container's verdict from
 * the preview (needed only when an `expect` matcher says `best: true`).
 */
export function gateAction(
  scene: SceneConfig,
  rt: SceneRuntime,
  action: Action,
  wasBest?: boolean,
): GateResult {
  const step = currentStep(scene, rt);
  const reject = (): GateResult => ({
    ok: false,
    code: 'not-allowed-by-scene',
    message: step?.hint ?? DEFAULT_REJECT,
  });
  if (!gateAllows(effectiveGate(scene, step), action)) return reject();
  const expect = step?.expect;
  if (expect && expect.length > 0) {
    const decision = action.type === 'check' || action.type === 'play' || action.type === 'fold';
    const relevant = decision || expect.some((m) => m.type === action.type);
    if (relevant && !expect.some((m) => matchAction(m, action, wasBest))) return reject();
  }
  return { ok: true };
}

/** Does any matcher in the current step's `expect` need to know whether the move was best? */
export function needsBestVerdict(scene: SceneConfig, rt: SceneRuntime): boolean {
  const step = currentStep(scene, rt);
  if (!step) return false;
  if (step.expect?.some((m) => m.best)) return true;
  return conditionNeeds(step.completeWhen, (c) => 'bestDecisions' in c);
}

function conditionNeeds(c: Condition, pred: (c: Condition) => boolean): boolean {
  if (pred(c)) return true;
  if ('all' in c) return c.all.some((x) => conditionNeeds(x, pred));
  if ('any' in c) return c.any.some((x) => conditionNeeds(x, pred));
  return false;
}

/** Leaves of a condition tree. */
export function leaves(c: Condition): Condition[] {
  if ('all' in c) return c.all.flatMap(leaves);
  if ('any' in c) return c.any.flatMap(leaves);
  return [c];
}

export function hasAcknowledged(c: Condition): boolean {
  return leaves(c).some((l) => 'acknowledged' in l);
}

const key = (kind: string, leaf: unknown): string => `${kind}:${JSON.stringify(leaf)}`;

function bump(counters: Record<string, number>, k: string, by = 1): void {
  counters[k] = (counters[k] ?? 0) + by;
}

function settledResult(input: SceneInput): HandResult | null {
  if (input.kind !== 'action') return null;
  for (const e of input.events) if (e.type === 'hand-settled') return e.result;
  return null;
}

/** Fold one input into the counters of the current step's leaves. */
function countInto(
  c: Record<string, number>,
  step: SceneStep,
  input: SceneInput,
  ctx: SceneContext,
): Record<string, number> {
  const result = settledResult(input);
  for (const leaf of leaves(step.completeWhen)) {
    if ('action' in leaf) {
      if (input.kind === 'action' && matchAction(leaf.action, input.action, input.wasBest))
        bump(c, key('action', leaf.action));
    } else if ('event' in leaf) {
      if (input.kind === 'action') {
        const n = input.events.filter((e) => e.type === leaf.event).length;
        if (n) bump(c, `event:${leaf.event}`, n);
      }
    } else if ('previewed' in leaf) {
      if (input.kind === 'previewed') {
        const p = leaf.previewed;
        if ((!p.option || p.option === input.option) && (!p.whyOpened || input.whyOpened))
          c[key('previewed', p)] = 1;
      }
    } else if ('bestDecisions' in leaf) {
      const want = leaf.bestDecisions.street;
      if (
        input.kind === 'action' &&
        input.wasBest &&
        (ctx.streetBefore === 'preflop' ||
          ctx.streetBefore === 'flop' ||
          ctx.streetBefore === 'river') &&
        (want === undefined || want === (ctx.streetBefore as DecisionStreet))
      )
        bump(c, key('best', want ?? '*'));
    } else if ('handResult' in leaf) {
      const w = leaf.handResult;
      if (
        result &&
        (w.outcome === undefined || w.outcome === result.outcome) &&
        (w.minNet === undefined || result.net >= w.minNet)
      )
        c[key('handResult', w)] = 1;
    } else if ('acknowledged' in leaf) {
      if (input.kind === 'acknowledged') c.ack = 1;
    } else if ('tapped' in leaf) {
      if (input.kind === 'tapped' && input.target === leaf.tapped) c[`tapped:${leaf.tapped}`] = 1;
    } else if ('autoPlayCompleted' in leaf) {
      const w = leaf.autoPlayCompleted;
      if (
        input.kind === 'auto-play-completed' &&
        (w.minHands === undefined || input.hands >= w.minHands) &&
        (w.strategy === undefined || w.strategy === input.strategy)
      )
        c[key('auto', w)] = 1;
    }
  }
  return c;
}

/** Is the condition met, given the counters since step start and the level state? */
export function isSatisfied(
  cond: Condition,
  counters: Readonly<Record<string, number>>,
  rt: Pick<SceneRuntime, 'stepStartHand'>,
  ctx: SceneContext,
): boolean {
  const n = (k: string): number => counters[k] ?? 0;
  if ('all' in cond) return cond.all.every((x) => isSatisfied(x, counters, rt, ctx));
  if ('any' in cond) return cond.any.some((x) => isSatisfied(x, counters, rt, ctx));
  if ('action' in cond) return n(key('action', cond.action)) >= (cond.count ?? 1);
  if ('event' in cond) return n(`event:${cond.event}`) >= (cond.count ?? 1);
  if ('hands' in cond) return ctx.hands - rt.stepStartHand >= cond.hands;
  if ('street' in cond) return ctx.street === cond.street;
  if ('handResult' in cond) return n(key('handResult', cond.handResult)) > 0;
  if ('betOnFelt' in cond) return ctx.bets[cond.betOnFelt.wager] >= (cond.betOnFelt.minAmount ?? 1);
  if ('bankrollAtLeast' in cond) return ctx.equity >= cond.bankrollAtLeast;
  if ('bankrollAtMost' in cond) return ctx.equity <= cond.bankrollAtMost;
  if ('previewed' in cond) return n(key('previewed', cond.previewed)) > 0;
  if ('bestDecisions' in cond)
    return n(key('best', cond.bestDecisions.street ?? '*')) >= cond.bestDecisions.count;
  if ('autoPlayCompleted' in cond) return n(key('auto', cond.autoPlayCompleted)) > 0;
  if ('acknowledged' in cond) return n('ack') > 0;
  return n(`tapped:${cond.tapped}`) > 0;
}

function advanceTo(scene: SceneConfig, rt: SceneRuntime, ctx: SceneContext): SceneRuntime {
  const next = rt.stepIndex + 1;
  return {
    stepIndex: next,
    stepStartHand: ctx.hands,
    counters: {},
    done: next >= (scene.steps?.length ?? 0),
    satisfied: false,
  };
}

/**
 * Folds an input in. A satisfied `advance: 'auto'` step moves on by one step (the container then
 * applies the new step's setup and calls `observe(scene, rt, null, ctx)` again, so chained steps
 * see the table as it is after their own deal). A `button` step waits for an `acknowledged` input.
 * Pass `null` to only re-read the level conditions.
 */
export function observe(
  scene: SceneConfig,
  rt: SceneRuntime,
  input: SceneInput | null,
  ctx: SceneContext,
): SceneRuntime {
  const step = currentStep(scene, rt);
  if (!step) return rt;
  const counters = input ? countInto({ ...rt.counters }, step, input, ctx) : rt.counters;
  const satisfied = isSatisfied(step.completeWhen, counters, rt, ctx);
  const ack = input?.kind === 'acknowledged';
  if (satisfied && (step.advance !== 'button' || ack)) return advanceTo(scene, rt, ctx);
  if (ack && rt.satisfied) return advanceTo(scene, rt, ctx);
  return { ...rt, counters, satisfied };
}
