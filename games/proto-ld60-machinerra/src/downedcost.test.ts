import { describe, expect, it } from 'vitest';
import { leavingNote, lyingTip } from './downedcost';
import { REPAIR } from './hub/economy';
import { REBUILD } from './hub/workshop';

describe('the cost of leaving a downed robot is stated (P5)', () => {
  it('over a robot lying down: carry home against leave, from the economy\'s numbers', () => {
    const t = lyingTip('Rivet');
    expect(t).toContain('Rivet is down');
    expect(t).toContain(`Carry home: ${REPAIR.carried.scrap} scrap`);
    expect(t).toContain(`a wreck, ${REBUILD.scrap} scrap`);
  });

  it('over a wreck that is not yet ours: how to mend it, no cost of leaving', () => {
    const t = lyingTip('Spill', true);
    expect(t).toContain('Spill lies here');
    expect(t).toContain('mend it');
    expect(t).not.toContain('scrap');
  });

  it('on the lift\'s ask: nothing when none is left, the costs when some are', () => {
    expect(leavingNote(0)).toBe('');
    expect(leavingNote(1)).toMatch(/Leave 1 down: 30 scrap to rebuild \(core, spec, relic kept\)/);
    expect(leavingNote(1)).toContain(`Carry up: ${REPAIR.carried.scrap} scrap to repair`);
    expect(leavingNote(3)).toMatch(/Leave 3 down: 30 scrap each to rebuild/);
  });
});
