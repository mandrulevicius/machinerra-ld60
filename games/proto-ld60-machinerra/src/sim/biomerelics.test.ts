import { describe, expect, it } from 'vitest';
import { BIOMES, T } from './defs';
import { RELICS, RUIN_JUNK, type RelicId } from './junk';
import { lightAt, RELIC_FX } from './junkplay';
import { NO_INPUT, Sim } from './sim';
import type { CrewBot } from './types';

/** The eight biome relics (D50: J21 sprinkler, J23 zapper, J24 Tamagotchi, J26 traffic light, J28 selfie stick, J30 beacon, J31 hand warmer, J33 thermos). */
const BIOME_RELICS: RelicId[] = ['sprinkler', 'zapper', 'tamagotchi', 'trafficlight', 'selfiestick', 'beacon', 'handwarmer', 'thermos'];

const bot = (role: CrewBot['role'], name: string, relic?: string): CrewBot => ({ role, name, uid: name, ...(relic && { relic }) });
const sim = (...crew: CrewBot[]) => {
  const s = new Sim(3, [], 'desert', [], undefined, undefined, { crew });
  s.god = true;
  return s;
};
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    s.events.length = 0;
  }
};
/** A guard wearing `relic`, held where it stands with the Communicator beside it. */
const wearer = (relic: string) => {
  const s = sim(bot('guard', 'W', relic));
  const w = s.bots.find((b) => b.role === 'guard')!;
  const c = s.controller;
  w.x = c.x + 40;
  w.y = c.y;
  w.hold = { x: w.x, y: w.y };
  return { s, w, c };
};
/** A foe `dx` px from `b` that stays where it is and cannot hurt. */
const foe = (s: Sim, b: { x: number; y: number }, dx: number, kind: 'hornet' | 'cat' = 'hornet') => {
  const h = s.spawnHornet(b.x + dx, b.y, 0, false, false, kind);
  h.cd = 9999;
  h.hp = h.maxHp = 1e6;
  return h;
};

describe('biome relics (D50)', () => {
  it('there are eight, with the doc numbers and sockets, and each is found in its biome\'s ruins', () => {
    expect(BIOME_RELICS.map((r) => RELICS[r].no)).toEqual(['J21', 'J23', 'J24', 'J26', 'J28', 'J30', 'J31', 'J33']);
    expect(BIOME_RELICS.map((r) => RELICS[r].socket)).toEqual(['back', 'arms', 'head', 'back', 'arms', 'head', 'back', 'back']);
    const byBiome = (id: 'jungle' | 'city' | 'mountains') => new Set((BIOMES[id].ruins ?? []).flatMap((k) => RUIN_JUNK[k]));
    for (const r of ['sprinkler', 'zapper', 'tamagotchi'] as const) expect(byBiome('jungle').has(r), r).toBe(true);
    for (const r of ['trafficlight', 'selfiestick'] as const) expect(byBiome('city').has(r), r).toBe(true);
    for (const r of ['beacon', 'handwarmer', 'thermos'] as const) expect(byBiome('mountains').has(r), r).toBe(true);
  });

  it('the sprinkler wets the foes and the crew within 100 px, not those beyond', () => {
    const { s, w, c } = wearer('sprinkler');
    const near = foe(s, w, 60), far = foe(s, w, 1500);
    let shown = false;
    for (let i = 0; i < 5.2 * 30; i++) {
      s.step(1 / 30, NO_INPUT);
      if (s.events.some((e) => e.e === 'junk' && e.what === 'sprinkle')) shown = true;
      s.events.length = 0;
    }
    expect(shown).toBe(true);
    expect(s.engine.stacks(near, 'wet')).toBeGreaterThan(0);
    expect(s.engine.stacks(c, 'wet')).toBeGreaterThan(0); // the flaw: your crew too
    expect(s.engine.stacks(w, 'wet')).toBeGreaterThan(0);
    expect(s.engine.stacks(far, 'wet')).toBe(0);
  });

  it('the bug-zapper swats 12 Shock, a flyer triple; a Wet bearer is zapped back', () => {
    const { s, w } = wearer('zapper');
    const fly = foe(s, w, 30);
    const before = fly.hp;
    run(s, 1);
    const dealt = before - fly.hp;
    expect(dealt).toBeGreaterThan(0);
    // The mechahornet is weak to Shock (x1.5): one swat is 12 x 3 flyer x 1.5. The cat (a ground foe) takes a third as much.
    fly.hp = 1e6;
    const g = foe(s, w, 30, 'cat');
    fly.x = w.x + 500; // out of reach: the zapper takes the cat
    g.hp = 1e6;
    const gb = g.hp;
    run(s, 1);
    expect(gb - g.hp).toBeGreaterThan(0);
    expect(gb - g.hp).toBe(12);
    expect(dealt).toBeGreaterThanOrEqual(3 * 12); // a flyer takes triple (and the hornet is weak to Shock)
    const hp = w.hp;
    s.engine.apply(w, 'wet', { duration: 30 });
    run(s, 1);
    expect(hp - w.hp).toBe(5);
  });

  it('the Tamagotchi grows +2.5% damage every 75 s, to 20%', () => {
    const { s, w } = wearer('tamagotchi');
    expect(s.engine.stat(w, 'damage', 1)).toBeCloseTo(1, 5);
    run(s, 76);
    expect(s.engine.stat(w, 'damage', 1)).toBeCloseTo(1.025, 5);
    s.engine.apply(w, 'charge', { stacks: 12 }); // eight is the most
    expect(s.engine.stat(w, 'damage', 1)).toBeCloseTo(1.2, 5);
  });

  it('the traffic light slows the foes near it at red, nothing at amber, hastes the crew at green', () => {
    const { s, w, c } = wearer('trafficlight');
    const near = foe(s, w, 60), far = foe(s, w, 400);
    const P = RELIC_FX.trafficlight.phase;
    expect([0, P, 2 * P, 3 * P].map(lightAt)).toEqual([0, 1, 2, 0]);
    s.time = 0.5;
    run(s, 1);
    expect(s.engine.stacks(near, 'slowed')).toBeGreaterThan(0);
    expect(s.engine.stacks(far, 'slowed')).toBe(0);
    expect(s.engine.stacks(c, 'haste')).toBe(0);
    s.time = P + 0.5;
    run(s, 1);
    expect(s.engine.stacks(near, 'slowed')).toBe(0);
    expect(s.engine.stacks(c, 'haste')).toBe(0);
    s.time = 2 * P + 0.5;
    run(s, 1);
    expect(s.engine.stacks(c, 'haste')).toBeGreaterThan(0);
    expect(s.engine.stacks(w, 'haste')).toBeGreaterThan(0);
    expect(s.engine.stacks(near, 'slowed')).toBe(0);
  });

  it('the selfie stick pokes from 90 px for 10 Impact, and after a pose flashes: the foes near are Blinded', () => {
    const { s, w } = wearer('selfiestick');
    const h = foe(s, w, 85);
    const hp = h.hp;
    run(s, 1.5);
    expect(hp - h.hp).toBeGreaterThan(0);
    expect(s.engine.stacks(h, 'blinded')).toBe(0);
    run(s, RELIC_FX.selfiestick.every + 1);
    let flashed = false;
    for (let i = 0; i < 30 * 12 && !flashed; i++) {
      s.step(1 / 30, NO_INPUT);
      if (s.events.some((e) => e.e === 'junk' && e.what === 'flash')) flashed = true;
      s.events.length = 0;
    }
    expect(flashed || s.engine.stacks(h, 'blinded') > 0).toBe(true);
  });

  it('the avalanche beacon shows downed robots and opens buried caches within 20 tiles, not beyond', () => {
    const s = sim(bot('guard', 'W', 'beacon'), bot('guard', 'D'));
    const w = s.bots.find((b) => b.name === 'W')!, d = s.bots.find((b) => b.name === 'D')!;
    w.hold = { x: w.x, y: w.y };
    d.x = w.x + 10 * T;
    d.y = w.y;
    d.downed = { by: null };
    const tx = Math.round(w.x / T) + 12, ty = Math.round(w.y / T);
    const near = { id: 'cacheA', kind: 'cache' as const, x: tx, y: ty, r: 6, at: { x: tx, y: ty } };
    const far = { id: 'cacheB', kind: 'cache' as const, x: tx + 40, y: ty, r: 6, at: { x: tx + 40, y: ty } };
    s.signals.push(near, far);
    s.fog.clear();
    expect(s.fog.found(near)).toBe(false);
    run(s, 0.5);
    expect(s.junkw.found).toContain(d);
    expect(s.fog.found(near)).toBe(true);
    expect(s.fog.found(far)).toBe(false);
    d.x = w.x + 30 * T;
    run(s, 0.5);
    expect(s.junkw.found).not.toContain(d);
  });

  it('the hand warmer keeps the crew within 100 px from Chilling and thaws Frozen; the thermos gives them 30% more steam regen', () => {
    const { s, w, c } = wearer('handwarmer');
    s.engine.apply(c, 'chilled');
    expect(s.engine.stacks(c, 'chilled')).toBe(0);
    s.engine.apply(c, 'frozen', { duration: 30 });
    c.x = w.x + 400;
    s.engine.apply(c, 'chilled');
    expect(s.engine.stacks(c, 'chilled')).toBeGreaterThan(0);
    c.x = w.x + 40;
    s.engine.apply(c, 'frozen', { duration: 30 });
    run(s, 9);
    expect(s.engine.stacks(c, 'frozen')).toBe(0);
    const t = wearer('thermos');
    expect(t.s.engine.stat(t.c, 'steamRegen', 1)).toBeCloseTo(1.3, 5);
    t.c.x = t.w.x + 400;
    expect(t.s.engine.stat(t.c, 'steamRegen', 1)).toBeCloseTo(1, 5);
  });
});
