/** Gasket's Tune-up (P38 follow-up, quests.md): one worn body part's bonuses +20%, once per item, kept on the item. */
import { describe, expect, it } from 'vitest';
import { TUNE_UP, addItem, cleanGear, equip, freshGear, gearMods, gearSources, owned, scaled, tunable, tuneUp, type Gear } from '../sim/gear';
import { REPEATS, jobFor, type Job } from './repeats';
import { gear } from './carry';
import { payJob } from './questpay';

/** The shovel plus brass shins (+10 speed) and a piston fist (+25 melee damage, +40 knock) worn, and a can rack (no bonus) worn. */
const worn = () => {
  let g = freshGear();
  for (const [id, slot] of [['brassShins', 'legs'], ['pistonFist', 'arm'], ['canRack', 'pack']] as const) {
    const r = addItem(g, id);
    g = equip(r.gear, r.item.uid, 'comm', slot);
  }
  return g;
};
const owe = (g: Gear, n = 1): Gear => ({ ...g, tunes: n });

describe('the Tune-up', () => {
  it('a worn body part with a bonus and no tune yet can be tuned; a weapon, a part with no bonus or one not worn cannot', () => {
    const g = worn();
    expect(tunable(g).map((o) => o.id).sort()).toEqual(['brassShins', 'pistonFist']);
    const spare = addItem(g, 'brassShins');
    expect(tunable(spare.gear).map((o) => o.uid)).not.toContain(spare.item.uid);
  });

  it('+20% on the bonuses, drawbacks unchanged, once per item and one Tune-up spent', () => {
    let g = owe(worn(), 2);
    const shins = owned(g, g.comm.legs)!;
    const before = gearMods(g).comm.speed ?? 0;
    g = tuneUp(g, shins.uid);
    expect(owned(g, shins.uid)!.tuned).toBe(true);
    expect(gearMods(g).comm.speed).toBe(Math.round(10 * TUNE_UP.mult));
    expect(gearMods(g).comm.speed).toBeGreaterThan(before);
    expect(g.tunes).toBe(1);
    expect(() => tuneUp(g, shins.uid)).toThrow(/not tuned yet/); // once per item
    expect(() => tuneUp({ ...g, tunes: 0 }, owned(g, g.comm.arm)!.uid)).toThrow(/no Tune-up owed/);
    // A drawback stays: Bedspring heels' -4 armour is not scaled.
    const r = addItem(g, 'springHeels');
    const heels = equip(r.gear, r.item.uid, 'comm', 'legs');
    const t = tuneUp({ ...heels, tunes: 1 }, r.item.uid);
    expect(gearMods(t).comm.armour).toBe(-4);
    expect(gearMods(t).comm.speed).toBe(Math.round(18 * TUNE_UP.mult));
  });

  it('it rides on quality: Rare brass shins tuned give round(10 x 1.3 x 1.2)', () => {
    expect(scaled({ speed: 10 }, 'rare', true).speed).toBe(Math.round(10 * 1.3 * TUNE_UP.mult));
  });

  it('the engine sources carry it, named as tuned, and it is kept across a save', () => {
    let g = owe(worn());
    g = tuneUp(g, owned(g, g.comm.legs)!.uid);
    const src = gearSources(g).comm.find((s) => s.id === 'brassShins')!;
    expect(src.name).toMatch(/tuned/);
    const again = cleanGear(JSON.parse(JSON.stringify(g)));
    expect(owned(again, again.comm.legs)!.tuned).toBe(true);
    expect(cleanGear({ ...worn(), tunes: 2 }).tunes).toBe(2);
    expect(cleanGear({ ...worn(), tunes: 0 }).tunes).toBeUndefined();
  });
});

describe("Gasket's repeatable pays it", () => {
  const job = (): Job => {
    const j = jobFor({ biome: 'desert', seed: 1, tier: 1, foes: ['hornet'] }, ['gasket'])!;
    return { ...j };
  };
  it('the clean-day job is paid in Tune-ups', () => {
    expect(REPEATS.find((t) => t.id === 'rep.gasket.clean')!.reward).toBe('tuneUp');
    expect(job().reward).toBe('tuneUp');
  });
  it('with an untuned body part worn the job owes one; with nothing to tune he pays a Fine body piece', () => {
    gear.set(worn());
    payJob(job(), 'seed');
    expect(gear.get().tunes).toBe(1);
    gear.set(freshGear());
    const items = gear.get().items.length;
    payJob(job(), 'seed');
    expect(gear.get().tunes).toBeUndefined();
    expect(gear.get().items.length).toBe(items + 1);
  });
});
