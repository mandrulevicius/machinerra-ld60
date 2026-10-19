import { describe, expect, it } from 'vitest';
import { START_CREW } from '../sim/defs';
import { Sim } from '../sim/sim';
import { oldCrewEconomy, oldCrewRoster } from './fixtures';
import { freshHub } from './state';
import { STOKE_COST, cleanRoster, crewOf, landRoster, salvage, stoke, type Shop } from './workshop';

const shop = (coal = 20): Shop => ({
  eco: { ...oldCrewEconomy({ cores: START_CREW.length }), coal },
  hub: freshHub(),
  roster: oldCrewRoster(),
});

describe('stoking at the workshop (Minos: coal, a fixed cost, on or off, one mission)', () => {
  it('one click pays the fixed coal and stokes; the same click takes it back and returns the coal', () => {
    const s = shop(20);
    const on = stoke(s, 'r1');
    expect(on.on).toBe(true);
    expect(on.eco.coal).toBe(20 - STOKE_COST.coal);
    expect(on.roster.bots.find((b) => b.uid === 'r1')!.stoked).toBe(true);
    expect(on.roster.bots.filter((b) => b.stoked)).toHaveLength(1);
    const off = stoke(on, 'r1');
    expect(off.on).toBe(false);
    expect(off.eco.coal).toBe(20);
    expect(off.roster.bots.find((b) => b.uid === 'r1')!.stoked).toBeUndefined();
  });

  it('is refused without the coal (nothing spent), and for a wreck or a robot carried home down', () => {
    const poor = shop(STOKE_COST.coal - 1);
    expect(() => stoke(poor, 'r1')).toThrow(/needs 5 coal/);
    expect(poor.eco.coal).toBe(STOKE_COST.coal - 1);
    const s = shop();
    const wrecked = landRoster(s.roster, { robots: [], went: ['r2'] });
    expect(() => stoke({ ...s, roster: wrecked }, 'r2')).toThrow(/wreck/);
    const down = { ...s.roster, bots: s.roster.bots.map((b) => (b.uid === 'r3' ? { ...b, downed: true } : b)) };
    expect(() => stoke({ ...s, roster: down }, 'r3')).toThrow(/down/);
  });

  it('the stoked robots ride stoked and burn nothing else: the mission fields them with the flag', () => {
    const on = stoke(stoke(shop(), 'r1'), 'r4');
    const crew = crewOf(on.roster);
    expect(crew.filter((c) => c.stoked).map((c) => c.uid)).toEqual(['r1', 'r4']);
    const sim = new Sim(5, [], 'desert', [], undefined, undefined, { crew });
    expect(sim.crew.filter((b) => b.stoked).map((b) => b.uid)).toEqual(['r1', 'r4']);
  });

  it('lasts one mission: the lift docking cools every robot, with or without a list of who went', () => {
    const on = stoke(stoke(shop(), 'r1'), 'r4').roster;
    const home = landRoster(on, { robots: on.bots.map((b) => ({ uid: b.uid }) as never), went: on.bots.map((b) => b.uid) });
    expect(home.bots.some((b) => b.stoked)).toBe(false);
    expect(landRoster(on, { robots: [], downed: [] }).bots.some((b) => b.stoked)).toBe(false);
    // A robot lost on the sands comes back a wreck, cold, and its coal is gone with the mission.
    const lost = landRoster(on, { robots: [], went: ['r1'] });
    expect(lost.bots.find((b) => b.uid === 'r1')).toMatchObject({ wreck: true });
    expect(lost.bots.find((b) => b.uid === 'r1')!.stoked).toBeUndefined();
  });

  it('salvaging a stoked robot returns its coal; a wreck or downed robot in a save never reads stoked', () => {
    const on = stoke(shop(20), 'r1');
    expect(salvage(on, 'r1').eco.coal).toBe(20);
    const dirty = { ...on.roster, bots: on.roster.bots.map((b) => (b.uid === 'r1' ? { ...b, wreck: true } : b)) };
    expect(cleanRoster(dirty).bots.find((b) => b.uid === 'r1')!.stoked).toBeUndefined();
  });
});
