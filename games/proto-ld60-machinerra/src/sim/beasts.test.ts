import { describe, expect, it } from 'vitest';
import { BEAST, BIOMES, SCREAM, STEAL, T, TWISTED, landCounters, type Enemy } from './defs';
import { NO_INPUT, Sim } from './sim';
import { beastDash, beastHit, fleeing, setMods } from './beasts';
import { dashCount, foeDash } from './tiers';
import { damageHornet } from './combat';
import { Ter } from './mapgen';
import { spawnAtRim } from './spider';

/** A quiet land of the biome: no hives, no arrivals, his robots gone, unless a test brings them. */
const quiet = (biome: 'jungle' | 'city' | 'mountains', seed = 5) => {
  const s = new Sim(seed, [], biome);
  s.cfg.edge = 0;
  s.cfg.morningSwarm = 0;
  for (const n of s.nests) n.dead = true;
  for (const b of s.crew) b.dead = true;
  return s;
};
const foe = (s: Sim, kind: Enemy, dx = 120, o: { elite?: boolean; twisted?: boolean; tier?: number } = {}) =>
  s.spawnHornet(s.controller.x + dx, s.controller.y, 0, !!o.elite, !!o.twisted, kind, { tier: o.tier, menacing: false });
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < sec * 30; i++) s.step(1 / 30, NO_INPUT);
};

describe('beast mods (P31, D32)', () => {
  it('a jungle beast rolls one of its family\'s mods; an elite of tier II two; a desert hornet none', () => {
    const s = quiet('jungle');
    for (let i = 0; i < 6; i++) {
      const c = foe(s, 'cat');
      expect(c.mods).toHaveLength(1);
      expect(['plates', 'springs', 'purr']).toContain(c.mods![0]);
      const b = foe(s, 'boar');
      expect(['tusks', 'mud', 'bell']).toContain(b.mods![0]);
    }
    const e = foe(s, 'boar', 120, { elite: true, tier: 2 });
    expect(e.mods).toHaveLength(2);
    expect(new Set(e.mods).size).toBe(2);
    expect(foe(s, 'hornet').mods).toBeUndefined();
    expect(foe(s, 'monkey').mods).toBeUndefined();
  });

  it('Armour plates halve an Impact hit from the front, not from behind', () => {
    const s = quiet('jungle');
    const c = s.controller;
    const front = foe(s, 'cat', 100), back = foe(s, 'cat', 100);
    setMods(s, front, ['plates']);
    setMods(s, back, ['plates']);
    front.target = back.target = c.id;
    back.target = 0;
    back.vx = 1; // facing away from him
    const h0 = front.hp, b0 = back.hp;
    damageHornet(s, front, 10, c, 'impact', { via: 'melee' });
    damageHornet(s, back, 10, c, 'impact', { via: 'melee' });
    expect(h0 - front.hp).toBeLessThan(b0 - back.hp);
  });

  it('Spring legs leap 7 tiles; a twisted pounce-cat and ram-goat chain two', () => {
    const s = quiet('jungle');
    const c = foe(s, 'cat');
    setMods(s, c, ['springs']);
    expect(foeDash(c)!.range).toBe(BEAST.springs);
    expect(dashCount(foe(s, 'cat', 120, { twisted: true }), 0)).toBe(2);
    expect(dashCount(foe(s, 'goat', 120, { twisted: true }), 0)).toBe(2);
    expect(dashCount(foe(s, 'boar', 120, { twisted: true }), 0)).toBe(1);
  });

  it('a Purr box mends its packmates', () => {
    const s = quiet('jungle');
    const p = foe(s, 'cat', 300), mate = foe(s, 'boar', 340);
    setMods(s, p, ['purr']);
    mate.hp = mate.maxHp / 2;
    const was = mate.hp;
    s.controller.x -= 2000;
    run(s, 2);
    expect(mate.hp).toBeGreaterThan(was);
  });

  it('Piston tusks Stagger in a charge; a Mud tank lays mud; a Bell collar sets the pack on its target', () => {
    const s = quiet('jungle');
    const c = s.controller;
    const b = foe(s, 'boar');
    setMods(s, b, ['tusks', 'mud', 'bell']);
    const other = foe(s, 'cat', 220);
    other.target = 0;
    b.target = c.id;
    beastHit(s, b, c, 5, true);
    expect(s.engine.stacks(c, 'staggered')).toBe(1);
    beastDash(s, b, 'go');
    expect(other.target).toBe(c.id);
    beastDash(s, b, 'on', 1);
    expect(s.props.zones.some((z) => z.kind === 'mud')).toBe(true);
  });
});

describe('the kinds\' counters and twisted forms (P31)', () => {
  it('a ram-goat is Heavy; an Officer unit Grounded: it takes no Shock, and the next blow is charged', () => {
    const s = quiet('mountains');
    expect(s.engine.flag(foe(s, 'goat'), 'steady')).toBe(true);
    const t = quiet('city');
    const o = foe(t, 'officer');
    const hp = o.hp;
    damageHornet(t, o, 20, t.controller, 'shock', { via: 'gun' });
    expect(o.hp).toBe(hp);
    expect(o.charge).toBe(true);
    expect(beastHit(t, o, t.controller, 5, false)).toBe(5 * BEAST.grounded.charge);
    expect(o.charge).toBe(false);
  });

  it('the course table shows the kinds\' counters', () => {
    const ids = (b: 'jungle' | 'city' | 'mountains') => landCounters(BIOMES[b].foes.map(([k]) => k), 1).map((c) => c.id);
    expect(ids('mountains')).toContain('heavy');
    expect(ids('city')).toContain('grounded');
    expect(ids('jungle')).toContain('mender');
  });

  it('a twisted ram-goat\'s blow Chills', () => {
    const s = quiet('mountains');
    beastHit(s, foe(s, 'goat', 120, { twisted: true }), s.controller, 5, false);
    expect(s.engine.stacks(s.controller, 'chilled')).toBeGreaterThan(0);
    expect(TWISTED.charger.name).toMatch(/Fire/);
  });

  it('an officer whistles the pack over when it first sees a robot', () => {
    const s = quiet('city');
    const c = s.controller;
    const o = foe(s, 'officer', 200);
    const m = foe(s, 'commuter', 260);
    m.target = 0;
    run(s, 0.2);
    expect(o.target).toBe(c.id);
    expect(m.target).toBe(c.id);
    expect(m.alertT ?? 0).toBeGreaterThan(s.time);
  });
});

describe('the bleaters\' scream (P31)', () => {
  it('a herd near a robot rears, then screams: Chilled; a twisted herd Freezes', () => {
    for (const twisted of [false, true]) {
      const s = quiet('mountains');
      const c = s.controller;
      for (let i = 0; i < SCREAM.herd; i++) {
        const h = foe(s, 'bleater', 40 + i * 12, { twisted });
        h.target = c.id;
        h.screamAt = 0;
      }
      run(s, SCREAM.tell + 0.4);
      expect(s.engine.stacks(c, twisted ? 'frozen' : 'chilled') + (twisted ? 0 : s.engine.stacks(c, 'frozen'))).toBeGreaterThan(0);
    }
  });
});

describe('the spanner monkey\'s theft (P31)', () => {
  it('a blow on him takes scrap; it runs for the edge; brought down it drops it', () => {
    const s = quiet('jungle');
    const c = s.controller;
    s.scrap = 50;
    const m = foe(s, 'monkey');
    beastHit(s, m, c, 4, false);
    expect(s.scrap).toBe(50 - STEAL.scrap);
    expect(m.stolen).toBe(STEAL.scrap);
    expect(fleeing(s, m, 100)!.sp).toBeGreaterThan(100);
    damageHornet(s, m, 999, c, 'impact', { via: 'gun' });
    const pile = s.loot.find((l) => l.kind === 'scrap' && l.amt === STEAL.scrap);
    expect(pile).toBeTruthy();
    expect(s.stats.monkeysCaught).toBe(1);
  });

  it('at the edge it is gone with the scrap', () => {
    const s = quiet('jungle');
    s.scrap = 30;
    const m = foe(s, 'monkey');
    beastHit(s, m, s.controller, 4, false);
    m.x = T;
    const piles = s.loot.length;
    fleeing(s, m, 100);
    expect(m.dead).toBe(true);
    expect(s.stats.monkeysAway).toBe(1);
    run(s, 0.1);
    expect(s.loot.length).toBe(piles);
  });
});

describe('the edge band (P31)', () => {
  it('every land has a rock rim at least two tiles deep, and an arrival crossing it says when it steps onto the land', () => {
    const s = quiet('jungle');
    const m = s.map;
    for (let x = 0; x < m.w; x++) for (const y of [0, 1, m.h - 1, m.h - 2]) expect(m.ter[y * m.w + x]).toBe(Ter.Rock);
    const h = spawnAtRim(s, 'cat');
    h.target = s.controller.id;
    let seen = false;
    for (let i = 0; i < 30 * 8 && !seen; i++) {
      s.step(1 / 30, NO_INPUT);
      seen = s.events.some((e) => e.e === 'beast' && e.what === 'rimIn' && e.h === h);
      s.events.length = 0;
    }
    expect(seen).toBe(true);
  });
});
