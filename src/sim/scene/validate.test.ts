import { describe, expect, it } from 'vitest';
import { buildContent } from '../../content/load';
import { validateScene } from './validate';

const base = { id: 'x', version: 1 };
const errs = (s: unknown): string[] => {
  const r = validateScene(s);
  return r.ok ? [] : r.errors;
};
const step = (o: object) => ({ id: 's', text: 't', completeWhen: { acknowledged: true }, ...o });

describe('validateScene', () => {
  it('accepts a minimal scene and a sandbox scene', () => {
    expect(validateScene(base).ok).toBe(true);
    expect(validateScene({ ...base, bankroll: 50000, bets: { ante: 1000 } }).ok).toBe(true);
  });
  it('accepts every real lesson scene', () => {
    const b = buildContent(process.cwd());
    const scenes = b.lessons.flatMap((l) =>
      l.blocks.flatMap((x) => (x.kind === 'scene' ? [x.scene] : [])),
    );
    expect(scenes.length).toBe(30);
    for (const s of scenes) expect(errs(s), s.id).toEqual([]);
  });
  it('rejects shape errors and unknown keys', () => {
    expect(errs(null)[0]).toMatch(/object/);
    expect(errs({ id: '', version: 2 })).toHaveLength(2);
    expect(errs({ ...base, allowed: [] }).join()).toMatch(/unknown key "allowed"/);
    expect(errs({ ...base, steps: [{ id: 'a' }] }).join()).toMatch(
      /text.*completeWhen|completeWhen/s,
    );
  });
  it('rejects bad and duplicate cards in forced deals (D25)', () => {
    expect(errs({ ...base, steps: [step({ deals: [{ player: ['As', 'As'] }] })] }).join()).toMatch(
      /Duplicate card "As"/,
    );
    expect(
      errs({
        ...base,
        steps: [step({ deals: [{ player: ['As', 'Kd'], flop: ['Kd', '2c', '3c'] }] })],
      }).join(),
    ).toMatch(/Duplicate/);
    expect(errs({ ...base, steps: [step({ deals: [{ player: ['Zs', 'Kd'] }] })] }).join()).toMatch(
      /bad card code/,
    );
    expect(errs({ ...base, steps: [step({ deals: [{ player: ['As'] }] })] }).join()).toMatch(
      /2 cards/,
    );
  });
  it('checks startAt coverage and string form', () => {
    expect(errs({ ...base, steps: [step({ startAt: 'preflop' })] }).join()).toMatch(/startAt/);
    expect(
      errs({
        ...base,
        steps: [step({ startAt: { street: 'flop', deal: { player: ['As', 'Kd'] } } })],
      }).join(),
    ).toMatch(/needs deal.flop/);
    expect(
      errs({
        ...base,
        steps: [
          step({
            startAt: {
              street: 'river',
              deal: { player: ['As', 'Kd'], flop: ['2c', '3c', '4c'], turn: '9d', river: '9h' },
              play: 2,
            },
          }),
        ],
      }).join(),
    ).toMatch(/not a river play/);
  });
  it('rejects unknown conditions, strategies and bad money', () => {
    expect(errs({ ...base, steps: [step({ completeWhen: { next: true } })] }).join()).toMatch(
      /unknown completeWhen kind "next"/,
    );
    expect(errs({ ...base, steps: [step({ completeWhen: { tapped: 'moon' } })] }).join()).toMatch(
      /tap target/,
    );
    expect(
      errs({
        ...base,
        autoPlay: { enabled: true, defaultStrategy: { id: 'nope', ante: 1000, trips: 0 } },
      }).join(),
    ).toMatch(/unknown strategy/);
    expect(errs({ ...base, bets: { ante: 1050 } }).join()).toMatch(/multiple of 100/);
    expect(errs({ ...base, bankroll: 1000.5 }).join()).toMatch(/integer/);
  });
  it('fails a dead end: a street with no allowed option (D27a)', () => {
    const s = {
      ...base,
      steps: [
        step({
          id: 'deal',
          allowedActions: ['deal'],
          deals: [{ player: ['As', 'Kd'] }],
          completeWhen: { action: { type: 'deal' } },
        }),
        step({
          id: 'go',
          allowedActions: ['check'],
          completeWhen: { street: 'settled' },
        }),
      ],
    };
    expect(errs(s).join()).toMatch(/dead end: the river/);
    const fixed = {
      ...s,
      steps: [s.steps[0], { ...s.steps[1], allowedActions: ['check', 'play', 'fold'] }],
    };
    expect(errs(fixed)).toEqual([]);
  });
  it('fails a bestDecisions street the step never reaches', () => {
    const s = {
      ...base,
      steps: [
        step({
          id: 'a',
          startAt: { street: 'flop', deal: { player: ['As', 'Kd'], flop: ['2c', '3c', '4c'] } },
          allowedActions: ['check', 'play'],
          completeWhen: { bestDecisions: { count: 1, street: 'preflop' } },
        }),
      ],
    };
    expect(errs(s).join()).toMatch(/never reached/);
  });
  it('counts bestDecisions only on the street it names (no false positive)', () => {
    const s = {
      ...base,
      steps: [
        step({
          startAt: { street: 'preflop', deal: { player: ['As', 'Kd'] } },
          allowedActions: ['check'],
          completeWhen: { bestDecisions: { count: 1, street: 'river' } },
        }),
      ],
    };
    expect(errs(s).join()).toMatch(/dead end: the river/);
  });
  it('rejects expect best while Deal is allowed (D27)', () => {
    const s = {
      ...base,
      steps: [
        step({
          startAt: { street: 'preflop', deal: { player: ['As', 'Ad'] } },
          expect: [{ type: 'play', best: true }],
          completeWhen: { bestDecisions: { count: 1, street: 'preflop' } },
        }),
      ],
    };
    expect(errs(s).join()).toMatch(/Deal locked/);
    expect(errs({ ...s, steps: [{ ...s.steps[0], allowedActions: ['check', 'play'] }] })).toEqual(
      [],
    );
  });
  it('needs EV for best-decision steps', () => {
    const s = {
      ...base,
      showEV: false,
      steps: [
        step({
          allowedActions: ['check', 'play'],
          expect: [{ type: 'play', best: true }],
          completeWhen: { street: 'settled' },
          startAt: { street: 'preflop', deal: { player: ['As', 'Ad'] } },
        }),
      ],
    };
    expect(errs(s).join()).toMatch(/needs showEV/);
    expect(errs({ ...s, practice: true })).toEqual([]);
  });
  it('requires a fully forced hand for win/lose/tie results', () => {
    const s = {
      ...base,
      steps: [
        step({
          deals: [{ player: ['As', 'Ad'] }],
          allowedActions: ['deal'],
          completeWhen: { all: [{ action: { type: 'deal' } }, { handResult: { outcome: 'win' } }] },
        }),
      ],
    };
    expect(errs(s).join()).toMatch(/fully forced/);
  });
  it('flags a step that can never complete', () => {
    const s = { ...base, steps: [step({ allowedActions: [], completeWhen: { street: 'flop' } })] };
    expect(errs(s).join()).toMatch(/can never complete/);
  });
  it('flags a sandbox scene whose options leave a street empty', () => {
    expect(errs({ ...base, allowedOptions: ['play-4', 'check'] }).join()).toMatch(
      /dead end: the river/,
    );
  });
});
