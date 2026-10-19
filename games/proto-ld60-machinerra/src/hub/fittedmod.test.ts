import { describe, expect, it } from 'vitest';
import { MODS, type ModId } from '../sim/defs/mods';
import { addItem, freshGear, lugCount, modsOn, ownedMods, takeMod, equip } from '../sim/gear';
import { gear } from './carry';
import { settleJob } from './carry';
import { freshBook } from './questbook';
import { jobFor, REPEATS, type Job } from './repeats';
import { payExtras, fittedPick } from './questpay';
import { STORY_LINES } from './storylines';

const land = (tier: number) => ({ biome: 'desert' as const, seed: 7, tier, foes: ['hornet' as const] });
/** Hob's kill job at a tier (his repeatable has two kinds of goal; both pay the Fitted mod). */
const hobJob = (tier: number): Job => {
  for (let seed = 1; seed < 99; seed++) {
    const j = jobFor({ ...land(tier), seed }, ['hob']);
    if (j) return j;
  }
  throw new Error('no job');
};

describe("Hob's Fitted mod (P57)", () => {
  it('his repeatable pays a Fitted mod, not a Fine weapon', () => {
    expect(REPEATS.find((t) => t.giver === 'hob')!.reward).toBe('mod');
    expect(hobJob(1).tier).toBe(1);
  });

  it('a pick of two mods you do not own; at tier III one of them is wild; the pick is seeded', () => {
    const g = freshGear();
    const two = fittedPick(g, 'a', 1);
    expect(two.length).toBe(2);
    expect(new Set(two).size).toBe(2);
    expect(two.some((m) => MODS[m].wild)).toBe(false);
    expect(fittedPick(g, 'a', 1)).toEqual(two);
    const three = fittedPick(g, 'a', 3);
    expect(three.filter((m) => MODS[m].wild).length).toBe(1);
    expect(three.length).toBe(2);
    // the shovel is in hand: both fit it (melee or any), so the free fit lands somewhere
    for (const m of [...two, ...three]) expect(MODS[m].fits, m).not.toBe('gun');
    // with a gun in a slot the gun mods are offered too
    let gun = addItem(g, 'steamGun').gear;
    gun = equip(gun, gun.items.find((o) => o.id === 'steamGun')!.uid, 'comm', 'secondary');
    const kinds = new Set(Array.from({ length: 30 }, (_, i) => fittedPick(gun, `k${i}`, 1).map((m) => MODS[m].fits)).flat());
    expect(kinds.has('gun')).toBe(true);
    // not the ones you own, nor the ones already owed
    const owned = addItem(addItem(g, 'bayonetLug').gear, 'flywheel').gear;
    for (let i = 0; i < 20; i++) expect(fittedPick(owned, `s${i}`, 1)).not.toContain('bayonetLug');
    expect(fittedPick({ ...g, modPicks: [['tuningFork', 'magnetHead']] }, 'z', 1).some((m) => m === 'tuningFork' || m === 'magnetHead')).toBe(false);
  });

  it('a job done leaves the pair at Hob\'s forge; taking one fits it free on the weapon in hand', () => {
    gear.set(freshGear());
    const job = hobJob(1);
    const done = settleJob({ ...freshBook(), job }, { [job.goal.stat]: 999 }, 'fm1');
    expect(done.lastJob).toMatchObject({ done: true });
    expect(done.lastJob!.text).toMatch(/Fitted mod/);
    const pair = gear.get().modPicks![0];
    expect(pair.length).toBe(2);
    // the shovel is in hand: give the pair as melee mods so one fits it
    gear.set({ ...gear.get(), modPicks: [['flywheel', 'tuningFork']] });
    const r = takeMod(gear.get(), 'tuningFork');
    gear.set(r.gear);
    expect(r.onto?.id).toBe('shovel');
    expect(modsOn(gear.get(), r.onto!.uid).map((o) => o.id)).toEqual(['tuningFork']);
    expect(gear.get().modPicks).toBeUndefined();
    expect(ownedMods(gear.get())).toEqual(['tuningFork']); // the other is gone: it was one of two
  });

  it('a mod that fits neither weapon in hand goes to the inventory unfitted; a mod not on offer cannot be taken', () => {
    const g = { ...freshGear(), modPicks: [['bayonetLug', 'ricochetCog'] as ModId[]] };
    const r = takeMod(g, 'ricochetCog');
    expect(r.onto).toBeUndefined();
    expect(ownedMods(r.gear)).toEqual(['ricochetCog']);
    expect(() => takeMod(g, 'flywheel')).toThrow(/not on offer/);
    // with a gun in the secondary slot it goes there
    let h = addItem(g, 'steamGun').gear;
    h = equip(h, h.items.find((o) => o.id === 'steamGun')!.uid, 'comm', 'secondary');
    expect(takeMod(h, 'bayonetLug').onto?.id).toBe('steamGun');
  });

  it('with every mod owned he pays a Fine weapon instead', () => {
    let g = freshGear();
    for (const m of Object.keys(MODS) as ModId[]) g = addItem(g, m).gear;
    gear.set(g);
    const job = hobJob(1);
    const before = gear.get().items.length;
    const done = settleJob({ ...freshBook(), job }, { [job.goal.stat]: 999 }, 'fm2');
    expect(done.lastJob!.done).toBe(true);
    expect(gear.get().items.length).toBe(before + 1);
    expect(gear.get().modPicks).toBeUndefined();
  });
});

describe('the second lug (hob.2)', () => {
  it('Hob\'s second step puts a second lug on every weapon; the reward pays it once', () => {
    const step = STORY_LINES['hob.story'].steps[1];
    expect(step.reward?.lugs).toBe(2);
    gear.set(freshGear());
    expect(lugCount(gear.get())).toBe(1);
    expect(payExtras({ lugs: 2 })[0]).toMatch(/second lug/);
    expect(lugCount(gear.get())).toBe(2);
    payExtras({ lugs: 2 });
    expect(lugCount(gear.get())).toBe(2);
  });
});
