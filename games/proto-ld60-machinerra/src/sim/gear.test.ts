import { describe, expect, it } from 'vitest';
import { rng } from '../../../../harness/kit/rng';
import { WEAPONS } from './defs';
import { Effects, type Unit } from './effects';
import {
  CREW_ROLES, ITEMS, LANDS, craftable, SKILLS, STATS, addItem, armourMul, cleanGear, craft, equip, fitsBotSlot, freshGear, gearMods, gearSources, itemIds, landsOf, salvage,
  shortfall, slotWeapons, unequip, type Gear, type ItemId, type Quality, type Stats, type CrewRole
} from './gear';

const give = (g: Gear, ...ids: Parameters<typeof addItem>[1][]) => ids.reduce((acc, id) => addItem(acc, id).gear, g);
const uidOf = (g: Gear, id: string) => g.items.find((o) => o.id === id)!.uid;

describe('catalogue', () => {
  it('every item fits somewhere, has a recipe, a look and a flavour', () => {
    for (const id of itemIds) {
      const d = ITEMS[id];
      expect(d.weapon || d.comm || d.bot || d.mod, id).toBeTruthy();
      if (craftable(id)) expect(d.recipe.scrap, id).toBeGreaterThan(0); // a wild mod is found, never made (P57)
      expect(d.look.length && d.flavour.length, id).toBeTruthy();
      if (d.weapon) expect(WEAPONS[d.weapon], id).toBeTruthy();
      if (d.skill) expect(SKILLS[d.skill].key, id).toBe(d.comm === 'rear' ? 'dash' : 'skill');
    }
  });
});

describe('crafting', () => {
  const wallet = { scrap: 100, parts: { 'hornet-stinger': 2 } };
  it('pays the recipe and adds the item at the rolled quality', () => {
    const r = craft(freshGear(), 'hornetSpear', wallet, 0.995);
    expect(r.item).toMatchObject({ id: 'hornetSpear', q: 'legendary' });
    expect(r.wallet).toEqual({ scrap: 55, parts: { 'hornet-stinger': 0 } });
    expect(r.gear.crafted).toBe(1);
  });
  it('says what is missing', () => {
    expect(shortfall('supportAntenna', wallet)).toEqual(['2 Mechahornet heads']);
    expect(() => craft(freshGear(), 'supportAntenna', wallet, 0)).toThrow(/needs 2 Mechahornet heads/);
  });
});

describe('wearing', () => {
  it('weapons swap between primary and secondary; the primary never empties', () => {
    let g = give(freshGear(), 'slingshot');
    g = equip(g, uidOf(g, 'slingshot'), 'comm', 'secondary');
    expect(slotWeapons(g)).toEqual({ weapon: 'shovel', secondary: 'slingshot' });
    g = equip(g, uidOf(g, 'slingshot'), 'comm', 'primary');
    expect(slotWeapons(g)).toEqual({ weapon: 'slingshot', secondary: 'shovel' });
    expect(() => unequip(g, uidOf(g, 'slingshot'))).toThrow(/primary/);
    expect(() => equip(g, uidOf(g, 'slingshot'), 'comm', 'head')).toThrow();
  });
  it('role pieces fit only their role', () => {
    const g = give(freshGear(), 'deepHose');
    expect(() => equip(g, uidOf(g, 'deepHose'), 'guard', 'arms')).toThrow();
    expect(gearMods(equip(g, uidOf(g, 'deepHose'), 'gatherer', 'arms')).roles.gatherer.gather).toBe(50);
  });
  it('quality scales bonuses, not drawbacks', () => {
    let g = addItem(freshGear(), 'boilerCorset', 'legendary').gear;
    g = equip(g, uidOf(g, 'boilerCorset'), 'comm', 'core');
    expect(gearMods(g).comm).toEqual({ armour: 32, speed: -10 });
    expect(armourMul(80)).toBeCloseTo(100 / 180);
  });
  it('salvage gives half the scrap back, only when not worn', () => {
    let g = give(freshGear(), 'pipeWrench');
    expect(salvage(g, uidOf(g, 'pipeWrench')).scrap).toBe(17);
    g = equip(g, uidOf(g, 'pipeWrench'), 'comm', 'secondary');
    expect(() => salvage(g, uidOf(g, 'pipeWrench'))).toThrow();
  });
});

describe('loadout and saves', () => {
  it('an old or damaged save cleans up', () => {
    const g = cleanGear({ items: [{ uid: 3, id: 'nope' as never, q: 'standard' }, { uid: 4, id: 'deepHose', q: 'rare' }], comm: { head: 4 }, bots: { gatherer: { arms: 4 }, guard: {}, repairer: {} } as never, next: 0, crafted: NaN });
    expect(g.items.map((o) => o.id)).toEqual(['deepHose']);
    expect(g.comm).toEqual({});
    expect(g.bots.gatherer.arms).toBe(4);
    expect(g.next).toBe(5);
  });
});

// ---- Gear as effect sources (P10): the engine gives the numbers `gearMods` gives -------------------------------------------

/** An engine with the Communicator, one bot of each crew role and a bystander, all wearing what `gearSources` says. */
function world(g: Gear, seed = 'gear') {
  const fx = new Effects(rng(seed));
  const s = gearSources(g);
  const comm = fx.add({ x: 0, y: 0, hp: 100, maxHp: 100 }, { team: 'crew' });
  const bots = Object.fromEntries(CREW_ROLES.map((r, i) => [r, fx.add({ x: 2000 * (i + 1), y: 0, hp: 100, maxHp: 100 }, { team: 'crew' })])) as Record<CrewRole, ReturnType<typeof fx.add>>;
  for (const src of s.comm) fx.addSource(comm, src);
  for (const r of CREW_ROLES) for (const src of s.roles[r]) fx.addSource(bots[r], src);
  // These tests are about the gear's numbers, not about which hits happen to roll a status.
  for (const u of [comm, ...Object.values(bots)]) fx.addSource(u, { id: 'noRiders', effects: [{ when: 'always', do: { do: 'stat', stat: 'rider', pct: -1 } }] });
  return { fx, comm, bots, s };
}

/** The gear stats an engine unit ends up with, read back in gear's own units. */
function readStats(fx: Effects, u: Unit): Stats {
  const pct = (stat: Parameters<Effects['stat']>[1], hit?: Parameters<Effects['stat']>[4]) => Math.round((fx.stat(u, stat, 100, undefined, hit) - 100) * 1e6) / 1e6;
  const flat = (stat: Parameters<Effects['stat']>[1]) => fx.stat(u, stat, 1000) - 1000;
  const out: Stats = {
    dmg: pct('damage'),
    meleeDmg: pct('damage', { via: 'melee' }) - pct('damage'),
    rangedDmg: pct('damage', { via: 'gun' }) - pct('damage'),
    atkSpeed: pct('attackRate'),
    crit: fx.stat(u, 'crit', 0) * 100,
    armour: -pct('damageTaken'),
    oil: flat('maxHp'),
    speed: pct('speed'),
    steam: flat('maxSteam'),
    steamRegen: pct('steamRegen'),
    accuracy: pct('accuracy'),
    range: pct('range'),
    knock: pct('knockback'),
    gather: pct('siphonRate'),
    repair: pct('repairRate'),
    magnet: pct('magnet'),
    plating: fx.stat(u, 'plating', 0),
    parry: fx.stat(u, 'parry', 0) * 100,
  };
  for (const k of Object.keys(out) as (keyof Stats)[]) if (Math.abs(out[k]!) < 1e-9) delete out[k];
  return out;
}
const close = (a: Stats, b: Stats, label: string) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Stats>;
  for (const k of keys) expect(a[k] ?? 0, `${label}: ${k}`).toBeCloseTo(b[k] ?? 0, 6);
};

/** Every way to wear an item: on the Communicator, or on each crew role it fits; with an antenna on when it needs one. */
function wearings(id: ItemId, q: Quality): { label: string; g: Gear }[] {
  const d = ITEMS[id];
  const out: { label: string; g: Gear }[] = [];
  const base = () => {
    let g = addItem(freshGear(), id, q).gear;
    const uid = g.items[g.items.length - 1].uid;
    if (d.needs) {
      g = addItem(g, 'supportAntenna').gear;
      g = equip(g, g.items.find((o) => o.id === 'supportAntenna')!.uid, 'comm', 'pack');
    }
    return { g, uid };
  };
  if (d.comm && !(d.needs && d.comm === 'pack')) {
    const { g, uid } = base();
    out.push({ label: `${id} on the Communicator`, g: equip(g, uid, 'comm', d.comm) });
  }
  if (d.weapon) {
    const { g, uid } = base();
    out.push({ label: `${id} as secondary`, g: equip(g, uid, 'comm', 'secondary') });
  }
  if (d.bot)
    for (const r of CREW_ROLES)
      if (fitsBotSlot(d, d.bot, r)) {
        const { g, uid } = base();
        out.push({ label: `${id} on the ${r}`, g: equip(g, uid, r, d.bot!) });
      }
  return out;
}

describe('gearSources', () => {
  it('every item, at standard and legendary, gives the numbers gearMods does: stats, crew, calm, ghostly, skills', () => {
    let n = 0;
    for (const id of itemIds)
      for (const q of ['standard', 'legendary'] as Quality[])
        for (const { label, g } of wearings(id, q)) {
          n++;
          const m = gearMods(g);
          const { fx, comm, bots, s } = world(g);
          close(readStats(fx, comm), m.comm, `${label} (${q}) comm`);
          fx.setPhase('day');
          for (const r of CREW_ROLES) {
            close(readStats(fx, bots[r]), m.roles[r], `${label} (${q}) ${r}`);
            expect(fx.flag(bots[r], 'calm'), `${label} calm ${r}`).toBe(m.calm.includes(r));
            expect(fx.flag(bots[r], 'ghostly'), `${label} ghostly ${r}`).toBe(m.ghostly.includes(r));
          }
          expect(fx.flag(comm, 'calm'), `${label} calm`).toBe(m.calm.includes('controller'));
          expect(fx.flag(comm, 'ghostly'), `${label} ghostly`).toBe(m.ghostly.includes('controller'));
          expect([s.dash, s.skill], label).toEqual([m.dash, m.skill]);
        }
    expect(n).toBeGreaterThan(itemIds.length);
  });

  it('every aura item reaches allies within its radius with the numbers gearMods gives, once, and not the wearer', () => {
    let n = 0;
    for (const id of itemIds.filter((i) => ITEMS[i].aura))
      for (const q of ['standard', 'rare'] as Quality[])
        for (const { label, g } of wearings(id, q)) {
          n++;
          const m = gearMods(g);
          const { fx, comm, bots } = world(g);
          const a = m.auras[0];
          const wearer = a.who === 'controller' ? comm : bots[a.who];
          wearer.x = 0;
          wearer.y = 0;
          const near = fx.add({ x: a.r - 1, y: 0, hp: 100, maxHp: 100 }, { team: 'crew' });
          const far = fx.add({ x: a.r + 1, y: 0, hp: 100, maxHp: 100 }, { team: 'crew' });
          const foe = fx.add({ x: 5, y: 0, hp: 100, maxHp: 100 }, { team: 'foe' });
          close(readStats(fx, near), a.stats, `${label} near`);
          expect(readStats(fx, far), `${label} far`).toEqual({});
          expect(readStats(fx, foe), `${label} foe`).toEqual({});
          expect(readStats(fx, wearer), `${label} wearer`).not.toMatchObject(a.stats);
        }
    expect(n).toBeGreaterThan(0);
  });


  it('the antenna gates the auto-trigger live: no antenna, no bonus; the antenna downed, it stops', () => {
    let g = addItem(addItem(freshGear(), 'autoTrigger').gear, 'supportAntenna').gear;
    g = equip(g, uidOf(g, 'autoTrigger'), 'comm', 'arm');
    const off = world(g);
    expect(readStats(off.fx, off.bots.guard)).toEqual({});
    g = equip(g, uidOf(g, 'supportAntenna'), 'comm', 'pack');
    const on = world(g);
    close(readStats(on.fx, on.bots.guard), gearMods(g).roles.guard, 'guard');
    expect(readStats(on.fx, on.bots.guard).atkSpeed).toBe(20);
    on.fx.down(on.comm);
    expect(readStats(on.fx, on.bots.guard)).toEqual({});
  });

  it('plating and parry are gear stats with a name, and ride into the engine', () => {
    expect(STATS.plating).toEqual({ name: 'Plating', pts: true });
    expect(STATS.parry.name).toBe('Parry');
    const { fx, comm } = world(freshGear());
    fx.addSource(comm, { id: 'rivetMail', effects: [{ when: 'always', do: [{ do: 'stat', stat: 'plating', add: 3 }, { do: 'stat', stat: 'parry', add: 0.15 }] }] });
    expect(readStats(fx, comm)).toMatchObject({ plating: 3, parry: 15 });
  });
});




describe('lands', () => {
  it('every land has a piece for every crew role, made from what that land drops', () => {
    for (const b of LANDS)
      for (const r of CREW_ROLES) {
        const set = itemIds.filter((id) => ITEMS[id].roles?.length === 1 && ITEMS[id].roles![0] === r && landsOf(id).length === 1 && landsOf(id)[0] === b);
        expect(set.length, `${b} ${r}`).toBeGreaterThan(0);
      }
  });
  it('a crew set piece goes on its role only, as a source for that role', () => {
    const g0 = addItem(freshGear(), 'frostBore').gear;
    const uid = uidOf(g0, 'frostBore');
    expect(fitsBotSlot(ITEMS.frostBore, 'arms', 'guard')).toBe(false);
    const g = equip(g0, uid, 'marksman', 'arms');
    expect(gearSources(g).roles.marksman.map((s) => s.id)).toContain('frostBore');
    expect(gearSources(g).roles.guard).toEqual([]);
  });
});
