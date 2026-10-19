import { beforeEach, describe, expect, it } from 'vitest';
import { Sim } from '../sim/sim';
import { } from '../sim/defs';
import { } from '../sim/defs';
import { } from '../sim/loadout';
import { slot, hub, snapshot } from './save';
import { discovered, land, loadout, totals } from './carry';
import { depart, economy } from './economy';
import { freshHub, haulFrom } from './state';

beforeEach(() => hub.reset());

/** A mission on seed 3 where the Communicator takes the steam gun from the shrine and rides home. */
function missionWithGun(seed = 3, id = 'm1') {
  const s = new Sim(seed, [], 'desert', [], loadout.get());
  s.bots = [s.controller];
  if (s.secondary !== 'steamGun') s.triggerPlace('shrine');
  s.finish();
  return haulFrom(s, id);
}

describe('the loadout and totals slices', () => {

  it('the steam gun survives mission -> save -> reload -> next mission', () => {
    const haul = missionWithGun();
    expect(haul.carry?.loadout).toMatchObject({ weapon: 'shovel', secondary: 'steamGun' }); // the find fills the free slot
    land(freshHub(), haul);
    // "Reload": nothing is cached; the next mission reads the file.
    expect(slot.latest()).toBe(0);
    expect(loadout.get()).toEqual({ weapons: ['shovel', 'steamGun'], weapon: 'shovel', secondary: 'steamGun', support: ['barrage'] });
    const next = new Sim(8, [], 'desert', [], loadout.get());
    expect(next.secondary).toBe('steamGun');
    expect(next.weapons.has('steamGun')).toBe(true);
    // And on to the mission after, without finding a gun again.
    next.bots = [next.controller];
    next.finish();
    land(hub.get(), haulFrom(next, 'm2'));
    expect(new Sim(9, [], 'desert', [], loadout.get()).secondary).toBe('steamGun');
  });

  it('the whole save holds every slice, and the hub slice is the hub as before', () => {
    land(freshHub(), missionWithGun());
    const slices = snapshot().slices;
    expect(Object.keys(slices)).toEqual(expect.arrayContaining(['hub', 'loadout', 'totals', 'lines'])); // every slice imported is written
    expect(hub.get().missions).toBe(1);
    expect(hub.get().lastHaul?.id).toBe('m1');
  });

  it('arriving twice with one haul changes nothing; totals add up across missions', () => {
    const haul = missionWithGun();
    const once = land(freshHub(), haul);
    const stats = totals.get();
    land(once, haul);
    expect(totals.get()).toEqual(stats);
    const second = { ...haul, id: 'm2', carry: { ...haul.carry!, stats: { killed: 5, ruins: 2 } } };
    land(once, second);
    expect(totals.get().killed).toBe((stats.killed ?? 0) + 5);
    expect(totals.get().ruins).toBe((stats.ruins ?? 0) + 2);
  });

});

describe('old and partial saves', () => {

  it('a save with a hub slice only (before the loadout existed) keeps the hub and starts the shovel', () => {
    slot.put(0, { slices: { hub: { v: 1, d: { ...freshHub(), resources: 10 } } } });
    expect(hub.get().city).toBe(10);
    expect(loadout.get().weapon).toBe('shovel');
  });

  it('hub v2: resources become the city, spent goes, and the perks that gave a free can are dropped', () => {
    const { city: _c, ...v1 } = freshHub();
    slot.put(0, { slices: { hub: { v: 1, d: { ...v1, resources: 640, spent: 180, perks: ['scavenger', 'spareCan', 'kick', 'secondCan'] } } } });
    const h = hub.get() as unknown as Record<string, unknown>;
    expect(h.city).toBe(640);
    expect(h).not.toHaveProperty('resources');
    expect(h).not.toHaveProperty('spent');
    expect(h.perks).toEqual(['scavenger', 'kick']);
    // A save already at v2 is left alone.
    slot.put(0, { slices: { hub: { v: 2, d: { ...freshHub(), city: 7, perks: ['spareCan'] } } } });
    expect(hub.get().city).toBe(7);
  });

  it('a loadout naming a weapon or call this build does not know keeps the rest', () => {
    slot.put(0, { slices: { loadout: { v: 1, d: { weapons: ['shovel', 'steamGun', 'plasmaCannon'], weapon: 'plasmaCannon', support: ['barrage', 'orbital'] } } } });
    expect(loadout.get()).toEqual({ weapons: ['shovel', 'steamGun'], weapon: 'shovel', secondary: null, support: ['barrage'] });
    slot.put(0, { slices: { loadout: { v: 1, d: { weapons: ['steamGun'], weapon: 'steamGun' } } } });
    // A save from before the two slots had the gun in hand: it becomes the secondary.
    expect(loadout.get()).toEqual({ weapons: ['shovel', 'steamGun'], weapon: 'shovel', secondary: 'steamGun', support: ['barrage'] });
  });

  it('New game erases every slice', () => {
    land(freshHub(), missionWithGun());
    hub.reset();
    expect(hub.exists()).toBe(false);
    expect(loadout.get().weapon).toBe('shovel');
    expect(hub.get().missions).toBe(0);
  });
});


function lift(seed = 3, perks: string[] = []) {
  const d = depart(economy.get());
  economy.set(d.eco);
  const s = new Sim(seed, [], 'desert', perks, loadout.get());
  s.carryIn(d.cans, d.charges);
  s.bots = [s.controller];
  return s;
}

describe('what outlives a mission reaches the stores through the haul', () => {





  it('places discovered are kept across missions and a reload, without repeats', () => {
    const s = lift();
    for (const p of s.places) p.visited = p.id === 'graveyard';
    s.finish();
    const afterOne = land(freshHub(), haulFrom(s, 'm1'));
    expect(discovered.get().places).toEqual(['graveyard']);
    const t = lift(4);
    for (const p of t.places) p.visited = p.id === 'graveyard' || p.id === 'mast';
    t.finish();
    land(afterOne, haulFrom(t, 'm2'));
    expect(discovered.get().places).toEqual(['graveyard', ...t.places.some((p) => p.id === 'mast') ? ['mast'] : []]);
    expect(snapshot().slices.discovered.d).toEqual(discovered.get());
  });



});
