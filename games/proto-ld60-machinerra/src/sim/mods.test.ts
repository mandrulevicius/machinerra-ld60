import { describe, expect, it } from 'vitest';
import { MOD, MODS, MOD_IDS, modOfBoss, type ModId } from './defs/mods';
import { BOSSES } from './defs';
import {
  ITEMS, addItem, addLug, cleanGear, craft, equip, fitMod, fittedOn, freshGear, gearSources, lugCount, modsOn, ownedMods, salvage, slotMods, unfitMod,
  type Gear, type ItemId, type Owned,
} from './gear';
import { hornetDown } from './foes';
import { NO_INPUT, Sim } from './sim';
import type { Hornet } from './types';

const uidOf = (g: Gear, id: ItemId) => g.items.find((o) => o.id === id)!.uid;
const give = (g: Gear, ...ids: ItemId[]) => ids.reduce((acc, id) => addItem(acc, id).gear, g);

/** The shovel in the primary slot, a gun in the secondary, and mods given (not fitted). */
const kit = (...mods: ModId[]) => {
  let g = give(freshGear(), 'steamGun', ...mods);
  g = equip(g, uidOf(g, 'steamGun'), 'comm', 'secondary');
  return g;
};

describe('lugs and fitting (P57)', () => {
  it('a weapon has one lug, two after Hob has put the second on', () => {
    let g = kit('bayonetLug', 'ricochetCog');
    expect(lugCount(g)).toBe(1);
    g = fitMod(g, uidOf(g, 'bayonetLug'), uidOf(g, 'steamGun'));
    g = fitMod(g, uidOf(g, 'ricochetCog'), uidOf(g, 'steamGun'));
    expect(modsOn(g, uidOf(g, 'steamGun')).map((o) => o.id)).toEqual(['ricochetCog']); // one lug: the newer takes it
    g = addLug(g);
    expect(lugCount(g)).toBe(2);
    g = fitMod(g, uidOf(g, 'bayonetLug'), uidOf(g, 'steamGun'));
    expect(modsOn(g, uidOf(g, 'steamGun')).map((o) => o.id)).toEqual(['ricochetCog', 'bayonetLug']);
  });

  it('a mod is on one lug at a time: fitting it elsewhere moves it', () => {
    let g = give(kit('magnetHead'), 'pipeWrench');
    g = fitMod(g, uidOf(g, 'magnetHead'), uidOf(g, 'steamGun'));
    expect(fittedOn(g, uidOf(g, 'magnetHead'))?.id).toBe('steamGun');
    g = fitMod(g, uidOf(g, 'magnetHead'), uidOf(g, 'pipeWrench'));
    expect(fittedOn(g, uidOf(g, 'magnetHead'))?.id).toBe('pipeWrench');
    expect(modsOn(g, uidOf(g, 'steamGun'))).toEqual([]);
    g = unfitMod(g, uidOf(g, 'magnetHead'));
    expect(fittedOn(g, uidOf(g, 'magnetHead'))).toBeUndefined();
    expect(ownedMods(g)).toEqual(['magnetHead']);
  });

  it('a mod fits only the kind of weapon its row says; the weapon\'s own numbers do not change', () => {
    const g = give(kit('bayonetLug', 'flywheel'), 'pipeWrench');
    expect(() => fitMod(g, uidOf(g, 'bayonetLug'), uidOf(g, 'pipeWrench'))).toThrow(/guns only/);
    expect(() => fitMod(g, uidOf(g, 'flywheel'), uidOf(g, 'steamGun'))).toThrow(/melee/);
    expect(() => fitMod(g, uidOf(g, 'steamGun'), uidOf(g, 'steamGun'))).toThrow(/not a mod/);
    const fitted = fitMod(g, uidOf(g, 'bayonetLug'), uidOf(g, 'steamGun'));
    const gun = (x: Gear) => x.items.find((o) => o.id === 'steamGun')!;
    expect(gun(fitted).q).toBe(gun(g).q);
    expect(gun(fitted).id).toBe(gun(g).id);
  });

  it('a mod has no quality, one copy; the wild ones cannot be crafted', () => {
    const wallet = { scrap: 500, parts: { 'hornet-stinger': 3, 'hornet-wings': 3 } };
    const r = craft(freshGear(), 'bayonetLug', wallet, 0.999);
    expect(r.item.q).toBe('standard'); // a roll of 0.999 is Legendary for a weapon
    expect(r.wallet).toEqual({ scrap: 450, parts: { 'hornet-stinger': 2, 'hornet-wings': 3 } });
    expect(() => craft(r.gear, 'bayonetLug', wallet, 0)).toThrow(/one of a kind/);
    expect(() => craft(freshGear(), 'pigeonLoft', wallet, 0)).toThrow(/found/);
  });

  it('a mod stays fitted on its weapon; salvaging it wants it off first', () => {
    let g = kit('ricochetCog');
    g = fitMod(g, uidOf(g, 'ricochetCog'), uidOf(g, 'steamGun'));
    expect(() => salvage(g, uidOf(g, 'ricochetCog'))).toThrow(/take it off/);
    g = unfitMod(g, uidOf(g, 'ricochetCog'));
    expect(salvage(g, uidOf(g, 'ricochetCog')).gear.items.some((o) => o.id === 'ricochetCog')).toBe(false);
  });

  it('cleanGear keeps what is valid: a lost mod, a second lug that is not there, a mod on two weapons', () => {
    let g = give(kit('bayonetLug', 'ricochetCog'), 'rivetScatter');
    const gun = uidOf(g, 'steamGun'), scatter = uidOf(g, 'rivetScatter'), bay = uidOf(g, 'bayonetLug'), cog = uidOf(g, 'ricochetCog');
    const raw = (mods: Record<number, number[]>): Gear => ({ ...g, items: g.items.map((o): Owned => (mods[o.uid] ? { ...o, mods: mods[o.uid] } : o)) });
    expect(modsOn(cleanGear(raw({ [gun]: [bay, cog] })), gun).map((o) => o.id)).toEqual(['bayonetLug']); // one lug
    expect(modsOn(cleanGear({ ...raw({ [gun]: [bay, cog] }), lugs: 2 }), gun).map((o) => o.id)).toEqual(['bayonetLug', 'ricochetCog']);
    const twice = cleanGear(raw({ [gun]: [bay], [scatter]: [bay] }));
    expect(modsOn(twice, gun).length + modsOn(twice, scatter).length).toBe(1);
    expect(modsOn(cleanGear(raw({ [gun]: [9999, cog, cog] })), gun).map((o) => o.id)).toEqual(['ricochetCog']);
    g = cleanGear(g);
    expect(g.lugs).toBeUndefined();
  });

  it('a fitted mod is a source on the Communicator for the weapon it sits on, and in the slots only', () => {
    let g = kit('tuningFork', 'condenserCoil');
    g = give(g, 'pipeWrench');
    g = fitMod(g, uidOf(g, 'condenserCoil'), uidOf(g, 'steamGun'));
    g = fitMod(g, uidOf(g, 'tuningFork'), uidOf(g, 'pipeWrench'));
    expect(gearSources(g).comm.filter((s) => s.kind === 'mod').map((s) => s.id)).toEqual(['mod:condenserCoil']); // the wrench is not in a slot
    expect(slotMods(g)).toEqual({ steamGun: ['condenserCoil'] });
    g = equip(g, uidOf(g, 'pipeWrench'), 'comm', 'primary');
    expect(slotMods(g)).toEqual({ pipeWrench: ['tuningFork'], steamGun: ['condenserCoil'] });
    expect(gearSources(g).comm.filter((s) => s.kind === 'mod').map((s) => s.id).sort()).toEqual(['mod:condenserCoil', 'mod:tuningFork']);
  });

  it('every mod has a row, a recipe part (regular) or a boss (wild), and a rule', () => {
    for (const id of MOD_IDS) {
      const m = MODS[id], d = ITEMS[id];
      expect(d.mod, id).toBe(id);
      expect(d.tags, id).toContain('mod');
      if (m.wild) expect(m.boss && BOSSES[m.boss], id).toBeTruthy();
      else expect(m.part, id).toBeTruthy();
      expect(m.look.length && m.flavour.length && m.text.length, id).toBeTruthy();
    }
    // the seven wild ones each sit in a different boss's cache
    const wild = MOD_IDS.filter((m) => MODS[m].wild);
    expect(wild.length).toBe(7);
    expect(new Set(wild.map((m) => MODS[m].boss)).size).toBe(7);
    for (const m of wild) expect(modOfBoss(MODS[m].boss!)).toBe(m);
  });
});

// ---- The rules --------------------------------------------------------------------------------------------------------

/** An arena: the Communicator with these mods fitted (the gun in the secondary slot unless a melee weapon is named), no foes, no hives. */
function arena(weapon: ItemId, mods: ModId[], o: { primary?: boolean; lugs?: number } = {}) {
  let g = give(freshGear(), weapon, ...mods);
  if (o.lugs === 2) g = addLug(g);
  g = equip(g, uidOf(g, weapon), 'comm', o.primary === false ? 'secondary' : 'primary');
  for (const m of mods) g = fitMod(g, uidOf(g, m), uidOf(g, weapon));
  const s = new Sim(3, [], 'desert', [], undefined, g, { crew: [] });
  s.god = true;
  s.nests.length = 0;
  s.hornets.length = 0;
  s.cfg.hornetSpeed = 0;
  s.cfg.swarm = 0;
  return s;
}
const step = (s: Sim, sec: number, input: Partial<typeof NO_INPUT> = {}) => {
  const n = Math.round(sec * 30);
  for (let i = 0; i < n; i++) s.step(1 / 30, { ...NO_INPUT, ...input });
};
const foe = (s: Sim, dx: number, dy = 0, elite = false) => {
  const c = s.controller;
  const h = s.spawnHornet(c.x + dx, c.y + dy, 0, elite, false, 'hornet');
  h.hp = h.maxHp = 100000;
  return h as Hornet;
};
/** Aim at (dx, dy) from the Communicator. */
const aim = (s: Sim, dx: number, dy = 0) => ({ ax: s.controller.x + dx, ay: s.controller.y + dy });

const swings = (s: Sim) => s.events.filter((e) => e.e === 'swing' && !e.kick).length;
const status = (s: Sim, h: Hornet, id: string) => s.engine.status(h, id as never);
const hold = (s: Sim, h: Hornet) => s.engine.apply(h, 'steady'); // a Steady foe is not shoved: it stays where the test put it

describe('Bayonet Lug', () => {
  it('stabs a foe within 50 px instead of shooting: the gun\'s hit as melee, no steam, a big shove', () => {
    const s = arena('steamGun', ['bayonetLug']);
    const h = foe(s, 40);
    const steam = s.controller.steam, hp = h.hp;
    step(s, 0.1, { fire: true, ...aim(s, 40) });
    expect(s.shots.length).toBe(0);
    expect(s.controller.steam).toBe(steam);
    expect(h.hp).toBeLessThan(hp);
    expect(h.vx).toBeGreaterThan(100); // shoved away from him
    expect(s.events.some((e) => e.e === 'mod' && e.what === 'stab')).toBe(true);
  });
  it('shoots as usual at a foe farther off, or on the other side of where he aims', () => {
    const s = arena('steamGun', ['bayonetLug']);
    foe(s, 200);
    foe(s, -30);
    step(s, 0.05, { fire: true, ...aim(s, 200) });
    expect(s.shots.length).toBe(1);
    expect(s.controller.steam).toBeLessThan(s.controller.maxSteam);
  });
  it('without the mod a gun fires at a close foe', () => {
    const s = arena('steamGun', []);
    foe(s, 40);
    step(s, 0.05, { fire: true, ...aim(s, 40) });
    expect(s.controller.steam).toBeLessThan(s.controller.maxSteam); // the bolt was shot (and landed at once)
  });
});

describe('Ricochet Cog', () => {
  it('bounces a bolt once off a wall, then it is spent', () => {
    const s = arena('steamGun', ['ricochetCog']);
    const x0 = s.controller.x;
    s.blocked = (x: number) => x > x0 + 90; // a wall 90 px east
    step(s, 0.05, { fire: true, ...aim(s, 300) });
    const shot = s.shots[0];
    expect(shot.ric).toBe(1);
    step(s, 0.3, aim(s, 300));
    expect(shot.dead).toBe(false);
    expect(shot.vx).toBeLessThan(0); // coming back
    expect(shot.ric).toBe(0);
    s.blocked = (x: number) => x > x0 + 90 || x < x0 - 60; // a wall behind him too
    step(s, 0.6, aim(s, 300));
    expect(shot.dead).toBe(true);
  });
  it('without it the bolt stops at the wall', () => {
    const s = arena('steamGun', []);
    const x0 = s.controller.x;
    s.blocked = (x: number) => x > x0 + 90;
    step(s, 0.05, { fire: true, ...aim(s, 300) });
    step(s, 0.5, aim(s, 300));
    expect(s.shots.length).toBe(0);
  });
});

describe('Condenser Coil', () => {
  it('a kill gives that shot\'s steam back', () => {
    const s = arena('steamGun', ['condenserCoil']);
    const h = foe(s, 100);
    h.hp = 1;
    const steam = s.controller.steam;
    step(s, 0.05, { fire: true, ...aim(s, 100) });
    step(s, 0.4, aim(s, 100));
    expect(h.dead).toBe(true);
    expect(s.controller.steam).toBe(steam);
  });
  it('a shot that does not kill keeps its cost', () => {
    const s = arena('steamGun', ['condenserCoil']);
    foe(s, 100);
    const steam = s.controller.steam;
    step(s, 0.05, { fire: true, ...aim(s, 100) });
    step(s, 0.4, aim(s, 100));
    expect(s.controller.steam).toBeLessThan(steam);
  });
});

describe('Pressure Valve', () => {
  it('after a quiet second the next shot is one bolt for three shots\' steam that pierces everything', () => {
    const s = arena('steamGun', ['pressureValve']);
    step(s, 1.2);
    const steam = s.controller.steam;
    step(s, 0.04, { fire: true, ...aim(s, 300) });
    expect(s.shots.length).toBe(1);
    expect(steam - s.controller.steam).toBeCloseTo(3 * s.cfg.steamShot, 5);
    expect(s.shots[0].pierce).toBe(99);
    expect(s.shots[0].dmg).toBe(3 * 10);
    // the very next shot is a plain one
    step(s, 0.3);
    const before = s.controller.steam;
    step(s, 0.04, { fire: true, ...aim(s, 300) });
    expect(before - s.controller.steam).toBeCloseTo(s.cfg.steamShot, 5);
    expect(s.shots.at(-1)!.pierce).toBe(0);
  });
  it('the bolt goes through every foe in its line', () => {
    const s = arena('steamGun', ['pressureValve']);
    const hs = [foe(s, 80), foe(s, 140), foe(s, 200)];
    step(s, 1.2);
    const hp = hs.map((h) => h.hp);
    step(s, 0.04, { fire: true, ...aim(s, 300) });
    step(s, 0.6);
    expect(hs.every((h, i) => h.hp < hp[i])).toBe(true);
  });
  it('says it is armed once, after the quiet second', () => {
    const s = arena('steamGun', ['pressureValve']);
    step(s, 0.9);
    expect(s.events.filter((e) => e.e === 'mod' && e.what === 'armed').length).toBe(0);
    step(s, 0.3);
    step(s, 1);
    expect(s.events.filter((e) => e.e === 'mod' && e.what === 'armed').length).toBe(1);
  });
  it('a gun fired steadily never charges it', () => {
    const s = arena('steamGun', ['pressureValve']);
    step(s, 1.5, { fire: true, ...aim(s, 300) });
    expect(s.shots.every((x) => x.pierce === 0)).toBe(true);
  });
});

describe('Flywheel', () => {
  const swingTimes = (s: Sim, sec: number) => {
    const at: number[] = [];
    for (let i = 0; i < Math.round(sec * 30); i++) {
      s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 100) });
      if (swings(s)) at.push(s.time);
      s.events.length = 0;
    }
    return at;
  };
  it('swings in a row get 15% faster, up to three times, and a second idle resets it', () => {
    const s = arena('pipeWrench', ['flywheel']);
    const at = swingTimes(s, 4);
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    expect(gaps[0]).toBeGreaterThan(gaps[1]);
    expect(gaps[1]).toBeGreaterThan(gaps[2]);
    expect(gaps[2]).toBeGreaterThan(gaps[3] - 0.001);
    expect(gaps[3]).toBeCloseTo(gaps[4], 1); // topped out
    expect(gaps[4]).toBeLessThan(0.45); // 0.55 s / 1.45, to the frame
    expect(s.lug.fly.n).toBe(3);
    step(s, 1.2); // idle
    s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 100) });
    expect(s.lug.fly.n).toBe(0);
  });
  it('without it the rate is the weapon\'s own', () => {
    expect(swingTimes(arena('pipeWrench', ['flywheel']), 4).length).toBeGreaterThan(swingTimes(arena('pipeWrench', []), 4).length);
  });
});

describe('Tuning Fork', () => {
  it('every third hit rings: every foe within 70 px of the one struck is Staggered, and no one farther', () => {
    const s = arena('pipeWrench', ['tuningFork']);
    const hit = foe(s, 30), near = foe(s, 100), far = foe(s, 220);
    for (const h of [hit, near, far]) hold(s, h);
    let rang = 0;
    for (let i = 0; i < 30 * 3 && !rang; i++) {
      s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 30) });
      if (status(s, near, 'staggered')) rang = i;
    }
    expect(rang).toBeGreaterThan(30); // not on the first swing: the third hit (the wrench swings every 0.55 s)
    expect(status(s, far, 'staggered')).toBeFalsy();
  });
});

describe('Magnet Head', () => {
  it('a hit pulls the loot within 150 px to him, and no farther', () => {
    const s = arena('pipeWrench', ['magnetHead']);
    hold(s, foe(s, 30));
    const near = s.drop(s.controller.x - 120, s.controller.y, 'scrap');
    const far = s.drop(s.controller.x + 300, s.controller.y, 'scrap');
    const d0 = Math.hypot(near.x - s.controller.x, near.y - s.controller.y);
    step(s, 0.3, { fire: true, ...aim(s, 30) });
    expect(Math.hypot(near.x - s.controller.x, near.y - s.controller.y)).toBeLessThan(d0 - 40);
    expect(far.pull ?? 0).toBe(0);
  });
});

describe('Boot Spur', () => {
  it('the kick carries the weapon\'s damage type: a kicked foe takes its status', () => {
    const s = arena('steamGun', ['bootSpur']);
    const h = foe(s, 30);
    step(s, 0.05, { kick: true, ...aim(s, 30) });
    expect(status(s, h, 'punctured')).toBeTruthy(); // pierce
    const t = arena('steamGun', []);
    const h2 = foe(t, 30);
    step(t, 0.05, { kick: true, ...aim(t, 30) });
    expect(status(t, h2, 'punctured')).toBeFalsy();
  });
  it('a tazer in hand: Shocked', () => {
    const s = arena('tazer', ['bootSpur']);
    const h = foe(s, 30);
    step(s, 0.034, { kick: true, ...aim(s, 30) });
    expect(status(s, h, 'shocked')).toBeTruthy();
  });
});

// ---- The wild mods (part B) ----------------------------------------------------------------------------------------------

/** Fire `n` single shots 0.25 s apart (the gun's rate is 0.2 s). */
const volley = (s: Sim, n: number, dx = 300, dy = 0) => {
  for (let i = 0; i < n; i++) {
    step(s, 1 / 30, { fire: true, ...aim(s, dx, dy) });
    step(s, 0.25);
  }
};

describe('Gramophone Horn', () => {
  it('every fourth shot is a chord: a cone that Staggers and shoves everything in front, and shoots no bolt', () => {
    const s = arena('steamGun', ['gramophoneHorn']);
    const front = foe(s, 100), behind = foe(s, -100), far = foe(s, 400), side = foe(s, 0, 120);
    volley(s, 3, 300);
    expect(status(s, front, 'staggered')).toBeFalsy();
    const bolts = s.shots.length;
    const x0 = front.x;
    s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 300) });
    expect(s.shots.length).toBe(bolts); // a chord, not a bolt
    expect(status(s, front, 'staggered')).toBeTruthy();
    expect(front.vx).toBeGreaterThan(200);
    for (const h of [behind, far, side]) expect(status(s, h, 'staggered'), String(h.id)).toBeFalsy();
    step(s, 0.3, aim(s, 300));
    expect(front.x).toBeGreaterThan(x0);
    expect(s.events.some((e) => e.e === 'mod' && e.what === 'chord')).toBe(true);
  });
  it('the count starts over after the chord, and the chord costs a shot of steam', () => {
    const s = arena('steamGun', ['gramophoneHorn']);
    foe(s, 100);
    volley(s, 3, 300);
    const steam = s.controller.steam;
    s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 300) });
    expect(steam - s.controller.steam).toBeCloseTo(s.cfg.steamShot, 5);
    expect(s.lug.n.gramophoneHorn).toBe(4);
  });
});

describe('Pigeon Loft', () => {
  it('every sixth shot is a pigeon: it homes on the nearest foe, pecks it three times and Marks it', () => {
    const s = arena('steamGun', ['pigeonLoft']);
    const h = foe(s, 40, 160); // off the line of fire: the bolts miss it
    volley(s, 5, 300, 0);
    expect(s.shots.some((x) => x.pigeon)).toBe(false);
    s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 300) });
    const bird = s.shots.find((x) => x.pigeon)!;
    expect(bird).toBeTruthy();
    const hp = h.hp;
    step(s, 0.2, aim(s, 300));
    expect(status(s, h, 'marked')).toBeFalsy(); // not yet: it is still flying
    let pecks = 0;
    for (let i = 0; i < 30 * 4; i++) {
      s.step(1 / 30, NO_INPUT);
      pecks += s.events.filter((e) => e.e === 'mod' && e.what === 'peck').length;
      s.events.length = 0;
    }
    expect(pecks).toBe(3);
    expect(h.hp).toBeLessThan(hp - 10);
    expect(status(s, h, 'marked')).toBeTruthy();
    expect(bird.dead).toBe(true);
  });
  it('picks the nearest foe, not the one aimed at', () => {
    const s = arena('steamGun', ['pigeonLoft']);
    const near = foe(s, -60, 60);
    foe(s, 400);
    volley(s, 5, 300, 0);
    s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 300) });
    step(s, 2.5);
    expect(status(s, near, 'marked')).toBeTruthy();
  });
});

describe('Echo Chamber', () => {
  it('each bolt fires again 0.6 s later from where he stood when he fired', () => {
    const s = arena('steamGun', ['echoChamber']);
    const x0 = s.controller.x;
    s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 300) });
    const first = s.shots.length;
    expect(first).toBe(1);
    s.controller.x += 250; // he is somewhere else when the echo goes
    let echo: { x: number; y: number } | undefined;
    for (let i = 0; i < 30 && !echo; i++) {
      s.step(1 / 30, NO_INPUT);
      if (s.events.some((e) => e.e === 'mod' && e.what === 'echo')) echo = s.shots.at(-1);
    }
    expect(echo).toBeTruthy();
    expect(s.time).toBeGreaterThan(0.55);
    expect(Math.abs(echo!.x - x0)).toBeLessThan(60); // from the old spot, not from 250 px on
    expect(Math.abs(echo!.x - s.controller.x)).toBeGreaterThan(150);
  });
  it('an echo is not echoed, and costs no steam', () => {
    const s = arena('steamGun', ['echoChamber']);
    s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 300) });
    s.events.length = 0;
    const steam = s.controller.steam;
    let n = 0;
    for (let i = 0; i < 30 * 3; i++) {
      s.step(1 / 30, NO_INPUT);
      n += s.events.filter((e) => e.e === 'shot').length;
      s.events.length = 0;
    }
    expect(n).toBe(1);
    expect(s.controller.steam).toBeGreaterThanOrEqual(steam);
  });
});

describe('Boomerang Gimbal', () => {
  it('every fifth swing throws the weapon: out 220 px and back, hitting each foe on the way both ways, and no swing till it is back', () => {
    const s = arena('pipeWrench', ['boomerangGimbal']);
    const a = foe(s, 120), b = foe(s, 200), out = foe(s, 330);
    for (const h of [a, b, out]) hold(s, h);
    const hits = new Map<Hornet, number>();
    const count = () => {
      for (const h of [a, b, out]) if (h.hp < (hits.get(h) ?? h.maxHp) - 0.01 && (hits.set(h, h.hp), true)) void 0;
    };
    void count;
    // four swings in place (the foes are out of the wrench's reach)
    let thrown = 0, swingsWhileOut = 0, back = false;
    for (let i = 0; i < 30 * 14 && !back; i++) {
      s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 120) });
      if (s.events.some((e) => e.e === 'mod' && e.what === 'throw')) thrown++;
      if (s.lug.boom) swingsWhileOut += swings(s);
      if (thrown && !s.lug.boom) back = true;
      s.events.length = 0;
    }
    expect(thrown).toBe(1);
    expect(back).toBe(true);
    expect(swingsWhileOut).toBe(0);
    expect(s.lug.n.boomerangGimbal).toBe(5);
    expect(out.hp).toBe(out.maxHp); // 330 px is past the throw
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('hits a foe on both legs: once out, once back', () => {
    const s = arena('pipeWrench', ['boomerangGimbal']);
    const a = foe(s, 120);
    hold(s, a);
    s.lug.n.boomerangGimbal = 4; // the next swing throws
    let legs = 0, last = a.hp;
    for (let i = 0; i < 30 * 6; i++) {
      s.step(1 / 30, { ...NO_INPUT, fire: i === 0, ...aim(s, 120) });
      if (a.hp < last - 0.01) legs++;
      last = a.hp;
      s.events.length = 0;
    }
    expect(legs).toBe(2);
    expect(s.lug.boom).toBeNull();
  });
});

describe('Grandfather Clock', () => {
  it('every twelfth hit stops the clock round the foe struck: foes within 90 px Frozen', () => {
    const s = arena('pipeWrench', ['grandfatherClock']);
    const hit = foe(s, 30), near = foe(s, 100), far = foe(s, 220);
    for (const h of [hit, near, far]) hold(s, h);
    let froze = -1;
    for (let i = 0; i < 30 * 12 && froze < 0; i++) {
      s.step(1 / 30, { ...NO_INPUT, fire: true, ...aim(s, 30) });
      if (status(s, near, 'frozen')) froze = i;
    }
    expect(froze).toBeGreaterThan(30 * 5); // 11 swings first: 0.55 s each
    expect(status(s, hit, 'frozen')).toBeTruthy();
    expect(status(s, far, 'frozen')).toBeFalsy();
    expect(s.engine.flag(near, 'frozen')).toBe(true); // a kick shatters it (D44)
  });
});

describe('Teapot Governor', () => {
  it('at full steam the next hit bursts in a Scald pulse and spends half the steam', () => {
    const s = arena('pipeWrench', ['teapotGovernor']);
    const hit = foe(s, 30), near = foe(s, 100), far = foe(s, 260);
    for (const h of [hit, near, far]) hold(s, h);
    expect(s.controller.steam).toBe(s.controller.maxSteam);
    step(s, 0.1, { fire: true, ...aim(s, 30) });
    expect(status(s, near, 'scalded')).toBeTruthy();
    expect(status(s, far, 'scalded')).toBeFalsy();
    expect(s.controller.steam).toBeCloseTo(s.controller.maxSteam / 2, 0);
    // not full any more: the next swing is a plain one
    step(s, 0.6, { fire: true, ...aim(s, 30) });
    expect(status(s, near, 'scalded')!.stacks).toBe(1);
    expect(s.controller.steam).toBeLessThan(s.controller.maxSteam * 0.7);
    expect(s.events.some((e) => e.e === 'mod' && e.what === 'whistle')).toBe(true);
  });
  it('without full steam it is a plain hit', () => {
    const s = arena('pipeWrench', ['teapotGovernor']);
    const hit = foe(s, 30), near = foe(s, 100);
    hold(s, hit);
    hold(s, near);
    s.controller.steam = 60;
    step(s, 0.1, { fire: true, ...aim(s, 30) });
    expect(status(s, near, 'scalded')).toBeFalsy();
  });
});

describe('Lightning Rod', () => {
  const hitFoe = (mods: ModId[], wet: boolean) => {
    const s = arena('pipeWrench', mods);
    const h = foe(s, 30), other = foe(s, 110);
    hold(s, h);
    hold(s, other);
    if (wet) {
      s.engine.apply(h, 'wet');
      s.engine.apply(other, 'wet');
    }
    step(s, 0.1, { fire: true, ...aim(s, 30) });
    return { s, h, other, lost: h.maxHp - h.hp, otherLost: other.maxHp - other.hp };
  };
  it('a hit on a Wet foe calls 30 Shock down on it, chaining through the Wet', () => {
    const plain = hitFoe([], true), rod = hitFoe(['lightningRod'], true);
    expect(rod.lost - plain.lost).toBeGreaterThanOrEqual(30);
    expect(rod.otherLost).toBeGreaterThan(plain.otherLost); // the Wet foe beside it took the arc
    expect(rod.s.events.some((e) => e.e === 'mod' && e.what === 'skybolt')).toBe(true);
  });
  it('a dry foe gets no bolt', () => {
    const plain = hitFoe([], false), rod = hitFoe(['lightningRod'], false);
    expect(rod.lost).toBe(plain.lost);
    expect(rod.s.events.some((e) => e.e === 'mod' && e.what === 'skybolt')).toBe(false);
  });
});

describe('two lugs make combos', () => {
  it('a gun with a Bayonet Lug and a Ricochet Cog does both', () => {
    const s = arena('steamGun', ['bayonetLug', 'ricochetCog'], { lugs: 2 });
    foe(s, 40);
    step(s, 0.05, { fire: true, ...aim(s, 40) });
    expect(s.events.some((e) => e.e === 'mod' && e.what === 'stab')).toBe(true);
    step(s, 0.3);
    step(s, 0.05, { fire: true, ...aim(s, 300) });
    expect(s.shots[0].ric).toBe(1);
  });
  it('a Leyden arc-gun with a Bayonet Lug and a Boot Spur: the stab and the kick both come from it, the kick Shocks', () => {
    const s = arena('arcGun', ['bayonetLug', 'bootSpur'], { lugs: 2 });
    expect(s.lug.fitted.arcGun).toEqual(['bayonetLug', 'bootSpur']);
    const h = foe(s, 30);
    step(s, 0.034, { kick: true, ...aim(s, 30) });
    expect(status(s, h, 'shocked')).toBeTruthy();
  });
});

describe("a boss's first cache", () => {
  it('holds its wild mod: the fall raises it, and the other bosses hold none', () => {
    for (const m of MOD_IDS.filter((x) => MODS[x].wild)) {
      const kind = MODS[m].boss!;
      const s = new Sim(3, [], 'desert');
      s.bots = [s.controller];
      s.god = true;
      const h = s.spawnBoss(kind);
      hornetDown(s, h, null);
      expect(h.dead, kind).toBe(true);
      expect(s.events.filter((e) => e.e === 'modFound')).toEqual([{ e: 'modFound', mod: m, x: h.x, y: h.y }]);
      expect(s.lug.found).toEqual([m]);
    }
    const s = new Sim(3, [], 'desert');
    s.bots = [s.controller];
    const croc = s.spawnBoss('croc');
    hornetDown(s, croc, null);
    expect(s.lug.found).toEqual([]);
  });
});

describe('arena', () => {
  it('is quiet: no foes, the gun is in hand', () => {
    const s = arena('steamGun', ['ricochetCog']);
    expect(s.hornets.length).toBe(0);
    expect(s.weapon).toBe('steamGun');
    expect(s.lug.fitted).toEqual({ steamGun: ['ricochetCog'] });
    void MOD;
  });
});
