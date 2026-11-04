import { describe, expect, it } from 'vitest';
import * as app from '../../src/app/settingValues';
import { WAGER_IDS as APP_WAGER_IDS } from '../../src/app/wagers';
import { PAYTABLE_PRESET_IDS, WAGER_IDS } from '../../src/sim/engine';
import { CONFIRM_ON, EV_MODES } from '../../src/sim/scene/modes';
import { DRILL_CATEGORY_IDS } from '../../src/sim/strategy/types';
import { evModeOfPractice } from '../../src/sim/ui/settings';

// I095: the app keeps plain copies of these lists so Home loads no simulator chunk.
describe("app value lists equal the simulator's", () => {
  it('paytables, EV modes, confirm policies, drill categories and wagers', () => {
    expect(app.PAYTABLE_PRESET_IDS).toEqual(PAYTABLE_PRESET_IDS);
    expect(app.EV_MODES).toEqual(EV_MODES);
    expect(app.CONFIRM_ON).toEqual(CONFIRM_ON);
    expect(app.DRILL_CATEGORY_IDS).toEqual(DRILL_CATEGORY_IDS);
    expect(APP_WAGER_IDS).toEqual(WAGER_IDS);
  });
  it('the practice-flag migration agrees', () => {
    for (const on of [true, false]) expect(app.evModeOfPractice(on)).toBe(evModeOfPractice(on));
  });
});
