import { beforeEach, describe, expect, it } from 'vitest';
import { SPEC_IDS, SPECS } from '../sim/specs';
import { NO_INPUT, Sim } from '../sim/sim';
import { slot, hub, snapshot } from './save';
import { land } from './carry';
import { freshHub, haulFrom } from './state';
import { DEEDS, boostPick, grantBoost, fill, freshProfile, gaugesOf, isUnlocked, profile, statKey, unlock } from './deeds';

beforeEach(() => hub.wipe());

const run = (s: Sim, sec: number) => {
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, NO_INPUT);
    s.events.length = 0;
  }
};

describe('the deed table', () => {
  it('every spec has a deed; every inverted deed is the same kicked-crash counter', () => {
    expect(Object.keys(DEEDS).sort()).toEqual([...SPEC_IDS].sort());
    for (const id of SPEC_IDS) {
      expect(DEEDS[id].size, id).toBeGreaterThan(0);
      if (SPECS[id].focus === 'inverted') expect(DEEDS[id]).toMatchObject({ counter: 'kickCrash', size: 25 });
    }
    expect(DEEDS.siphoner.size).toBe(15); // ruins stripped
    expect(DEEDS.medic.size).toBe(2000);
    expect(DEEDS.ghost).toMatchObject({ mode: 'best', size: 20 });
  });
});

describe('gauges fill from a mission\'s stats', () => {
  it('sums add up across missions and unlock at their size, once', () => {
    const k = statKey('gatherer', 'siphon');
    let r = fill(freshProfile(), { [k]: 9 });
    expect(r.unlocked).toEqual([]);
    expect(r.profile.gauges.siphoner).toBe(9);
    r = fill(r.profile, { [k]: 7 });
    expect(r.unlocked).toEqual(['siphoner']); // 16 reaches the 15
    expect(r.profile.gauges.siphoner).toBe(15); // capped
    expect(isUnlocked(r.profile, 'siphoner')).toBe(true);
    expect(isUnlocked(r.profile, 'carrier')).toBe(false);
    expect(fill(r.profile, { [k]: 50 }).unlocked).toEqual([]); // already open: nothing rings again
  });

  it('a mission fills only the gauges of the type that did it', () => {
    const r = fill(freshProfile(), { [statKey('guard', 'tank')]: 400, [statKey('guard', 'cannonKill')]: 30, 'deed.guard.kickCrash': 5 });
    expect(r.profile.gauges).toEqual({ bulwark: 400, cannoneer: 30, berserker: 5 });
    expect(gaugesOf(r.profile, 'guard').map((g) => [g.name, g.have, g.size, g.full])).toEqual([['Bulwark', 400, 1500, false], ['Cannoneer', 30, 100, false], ['Berserker', 5, 25, false]]);
    expect(gaugesOf(r.profile, 'gatherer').every((g) => g.have === 0)).toBe(true);
  });


  it('a best-of deed keeps the best mission, not the sum', () => {
    let p = fill(freshProfile(), { [statKey('stalker', 'scoutPct')]: 12 }).profile;
    p = fill(p, { [statKey('stalker', 'scoutPct')]: 9 }).profile;
    expect(p.gauges.ghost).toBe(12);
    expect(fill(p, { [statKey('stalker', 'scoutPct')]: 21 }).unlocked).toEqual(['ghost']);
  });


  it('unlock opens a spec for good, even if its size later grows', () => {
    const p = unlock(freshProfile(), 'condenser');
    expect(p.gauges.condenser).toBe(25);
    expect(isUnlocked(p, 'condenser')).toBe(true);
    expect(() => unlock(p, 'nonsense' as never)).toThrow(/unknown spec/);
  });
});

describe('the mission counts what each type did', () => {
  it('gatherers strip ruins, guards take damage, repairers heal: counters in Sim.stats', () => {
    const s = new Sim(7);
    s.setClock('day');
    for (const b of s.crew) if (b.role === 'gatherer') s.assign(b.id, 1);
    const ruin = s.ruins.find((r) => !r.live)!;
    s.order(1, ruin.x, ruin.y);
    run(s, 25);
    expect(ruin.searched).toBe(true);
    expect(s.stats[statKey('gatherer', 'siphon')]).toBeGreaterThanOrEqual(1); // one count a ruin stripped

    const guard = s.crew.find((b) => b.role === 'guard')!;
    const before = s.stats[statKey('guard', 'tank')] ?? 0;
    s.hurt(guard, 25);
    expect(s.stats[statKey('guard', 'tank')] - before).toBeGreaterThan(0);
    expect(s.stats[statKey('guard', 'tank')] - before).toBeLessThanOrEqual(25);
    const gone = s.stats[statKey('guard', 'tank')];
    s.hurt(guard, 9999); // only the oil it had counts, not the overkill
    expect(s.stats[statKey('guard', 'tank')] - gone).toBeLessThanOrEqual(guard.maxHp);

    const healer = s.crew.find((b) => b.role === 'repairer')!;
    const patient = s.crew.find((b) => b.role === 'gatherer')!;
    patient.hp = patient.maxHp * 0.3;
    patient.x = healer.x + 30;
    patient.y = healer.y;
    run(s, 4);
    expect(s.stats[statKey('repairer', 'heal')]).toBeGreaterThan(0);
  });
});

describe('the lift docks', () => {
  const haulWith = (id: string, stats: Record<string, number>) => {
    const s = new Sim(3);
    s.bots = [s.controller];
    s.finish();
    Object.assign(s.stats, stats);
    return haulFrom(s, id);
  };

  it('fills the gauges once per haul, like the lines', () => {
    const haul = haulWith('m1', { [statKey('repairer', 'heal')]: 800 });
    const once = land(freshHub(), haul);
    expect(profile.get().gauges.medic).toBe(800);
    land(once, haul); // the same haul again changes nothing
    expect(profile.get().gauges.medic).toBe(800);
    land(hub.get(), haulWith('m2', { [statKey('repairer', 'heal')]: 1500 }));
    expect(profile.get().unlocked).toEqual(['medic']);
  });

  it('the profile survives New game, and a file of only the profile offers no Continue', () => {
    land(freshHub(), haulWith('m1', { [statKey('guard', 'tank')]: 1500 }));
    expect(hub.exists()).toBe(true);
    expect(hub.get().missions).toBe(1);
    hub.reset(); // New game, as the title's wipe does
    expect(hub.get().missions).toBe(0);
    expect(hub.exists()).toBe(false);
    expect(slot.latest()).toBeGreaterThanOrEqual(0); // the profile is in the file...
    expect(profile.get()).toMatchObject({ unlocked: ['bulwark'], gauges: { bulwark: 1500 } });
    // ...and the next game goes on from it.
    land(freshHub(), haulWith('m1', { [statKey('guard', 'cannonKill')]: 40 }));
    expect(profile.get().gauges).toMatchObject({ bulwark: 1500, cannoneer: 40 });
    expect(Object.keys(snapshot().slices)).toContain('deeds');
  });

});



describe('sprocket.2: one type\'s gauges +25%', () => {
  it('names a type, or picks the one nearest to opening a spec', () => {
    expect(grantBoost(freshProfile(), 'marksman')).toMatchObject({ type: 'marksman', profile: { boost: 'marksman' } });
    const p = fill(freshProfile(), { [statKey('guard', 'tank')]: 1000, [statKey('repairer', 'heal')]: 500 }).profile;
    expect(boostPick(p)).toBe('guard');
    expect(grantBoost(p, 'auto').profile.boost).toBe('guard');
    // A type with everything open is passed over.
    const done = unlock(unlock(unlock(p, 'bulwark'), 'cannoneer'), 'berserker');
    expect(boostPick(done)).toBe('repairer');
    expect(grantBoost(done, 'nonsense').type).toBe('repairer'); // an unknown name falls back to the pick
  });

});
