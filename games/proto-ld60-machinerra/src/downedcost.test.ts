import { describe, expect, it } from 'vitest';
import { leaving, lyingTip } from './downedcost';
import { Sim } from './sim/sim';
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

  it("on the lift's ask: every robot left behind, alive or downed, with its cost", () => {
    const sim = new Sim(7, [], 'desert', [], undefined, undefined, { crew: [{ role: 'gatherer', name: 'Ladle', uid: 'r1' }, { role: 'guard', name: 'Anvil', uid: 'r2' }] });
    const [a, b] = sim.fielded;
    a.x = b.x = sim.lift.x + 900;
    a.y = b.y = sim.lift.y;
    b.downed = { by: null };
    const rows = leaving(sim);
    expect(rows.map((r) => r.name).sort()).toEqual([a.name, b.name].sort());
    expect(rows.find((r) => r.name === a.name)).toMatchObject({ down: false, rebuild: REBUILD.scrap, carry: null });
    expect(rows.find((r) => r.name === b.name)).toMatchObject({ down: true, rebuild: REBUILD.scrap, carry: REPAIR.carried.scrap });
    a.x = b.x = sim.lift.x;
    expect(leaving(sim)).toEqual([]);
  });
});
