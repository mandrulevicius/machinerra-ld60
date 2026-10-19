import { describe, expect, it } from 'vitest';
import { DOWNED, PLACE_PARTS, T, ZONES } from './defs';
import { Ter } from './mapgen';
import { beamAngle, beamSweep, carriedProps, freshMods, lure, onBeam, pickUpProp, putDownProps, sleepFoe, slide, stackMods, unlure, walkToLift } from './placeparts';
import { addProp } from './props';
import { NO_INPUT, Sim } from './sim';
import { lootChance } from './loot';
import { eliteChance } from './tiers';
import { tap } from './testkit';

/** A land with nothing on it but the Communicator: no crew, no props, no foes. */
const bare = (seed = 5) => {
  const s = new Sim(seed);
  s.bots = [s.controller];
  s.props.list.length = 0;
  s.props.solid.fill(0);
  s.props.at.clear();
  s.hornets = [];
  return s;
};
const run = (s: Sim, secs: number, input = NO_INPUT) => {
  for (let i = 0; i < Math.round(secs * 30); i++) s.step(1 / 30, input);
};
const tileAt = (s: Sim, dx: number, dy = 0) => ({ x: Math.floor(s.lift.x / T) + dx, y: Math.floor(s.lift.y / T) + dy });

describe('A: sleeping place foes', () => {
  it('a sleeper stands still and hunts no one, until a hit wakes it', () => {
    const s = bare();
    const c = s.controller;
    const h = s.spawnHornet(c.x + 90, c.y, 0, false, false, 'swarmer');
    sleepFoe(h, 'lanes');
    const x0 = h.x;
    run(s, 2);
    expect(h.sleep).toBe('lanes');
    expect(h.target).toBe(0);
    expect(Math.abs(h.x - x0)).toBeLessThan(2);
    s.damageHornet(h, 1, c);
    expect(h.sleep).toBeUndefined();
    expect(s.events.some((e) => e.e === 'place' && e.what === 'wake')).toBe(true);
    run(s, 1);
    expect(h.target).toBe(c.id);
  });

  it('a noise near it wakes it; one farther off does not', () => {
    const s = bare();
    const c = s.controller;
    const near = s.spawnHornet(c.x + 300, c.y, 0, false, false, 'swarmer');
    const far = s.spawnHornet(c.x + 300 + PLACE_PARTS.sleep.noise * T * 2, c.y, 0, false, false, 'swarmer');
    sleepFoe(near, 'lanes');
    sleepFoe(far, 'lanes');
    s.noise(c.x + 300, c.y + 10);
    expect(near.sleep).toBeUndefined();
    expect(far.sleep).toBe('lanes');
  });
});

describe('B: a lure', () => {
  it('calls a foe with no one to hunt to it, and stops when told', () => {
    const s = bare();
    const c = s.controller;
    c.x += 2000; // nobody for it to hunt
    const at = { x: s.lift.x + 200, y: s.lift.y };
    const h = s.spawnHornet(at.x + 260, at.y, 0, false, false, 'swarmer');
    const z = lure(s, at.x, at.y, 600)!;
    expect(z.kind).toBe('alarm');
    const d0 = Math.hypot(h.x - at.x, h.y - at.y);
    run(s, 3);
    expect(Math.hypot(h.x - at.x, h.y - at.y)).toBeLessThan(d0 - 60);
    unlure(z);
    run(s, ZONES.alarm.every * 2);
    expect(s.props.zones.includes(z)).toBe(false);
  });
});

describe('C: carrying a prop', () => {
  it('Use picks a carryable prop up; it rides on him at the downed-carry speed, blocks guns, and Use puts it down', () => {
    const s = bare();
    const c = s.controller;
    const p = addProp(s, { kind: 'shell', ...tileAt(s, 12), wear: 1 });
    c.x = p.x - 10;
    c.y = p.y;
    tap(s);
    expect(p.carriedBy).toBe(c.id);
    expect(carriedProps(s, c)).toEqual([p]);
    run(s, 0.5, { ...NO_INPUT, mx: 1 });
    expect(Math.abs(p.x - c.x)).toBeLessThan(20);
    expect(s.engine.stat(c, 'speed', 1)).toBeCloseTo(DOWNED.carry, 2);
    s.give('steamGun');
    s.equip('steamGun', 'primary');
    const shots = s.shots.length;
    run(s, 0.3, { ...NO_INPUT, fire: true, ax: c.x + 200, ay: c.y });
    expect(s.shots.length).toBe(shots);
    putDownProps(s, c);
    expect(p.carriedBy).toBeUndefined();
    expect(s.engine.stat(c, 'speed', 1)).toBeCloseTo(1, 2);
  });

  it('a swing never hurts what he carries', () => {
    const s = bare();
    const c = s.controller;
    const p = addProp(s, { kind: 'sign', ...tileAt(s, 12), wear: 1 });
    pickUpProp(s, c, p);
    run(s, 0.1);
    const hp = p.hp;
    run(s, 0.5, { ...NO_INPUT, fire: true, ax: c.x + 30, ay: c.y });
    expect(p.hp).toBe(hp);
  });
});

describe('D: hardpan', () => {
  it('a kick shoves what stands on hardpan farther', () => {
    const s = bare();
    const t = tileAt(s, 10);
    const i = t.y * s.W + t.x;
    s.map.ter[i] = Ter.Sand;
    expect(slide(s, (t.x + 0.5) * T, (t.y + 0.5) * T)).toBe(1);
    s.map.ter[i] = Ter.Hardpan;
    expect(slide(s, (t.x + 0.5) * T, (t.y + 0.5) * T)).toBe(PLACE_PARTS.hardpan);
  });
});

describe('F: a turning beam', () => {
  it('a point is on the beam along its length and width only', () => {
    expect(onBeam(100, 0, 0, 0, 0, 200, 10)).toBe(true);
    expect(onBeam(100, 15, 0, 0, 0, 200, 10)).toBe(false);
    expect(onBeam(-50, 0, 0, 0, 0, 200, 10)).toBe(false);
    expect(onBeam(250, 0, 0, 0, 0, 200, 10)).toBe(false);
    expect(onBeam(0, 100, 0, 0, Math.PI / 2, 200, 10)).toBe(true);
    expect(beamAngle(0, 8)).toBe(0);
    expect(beamAngle(4, 8)).toBeCloseTo(Math.PI);
  });

  it('the sweep reveals the fog along it and hands over the foes it crosses', () => {
    const s = bare();
    const x = s.lift.x, y = s.lift.y;
    const on = s.spawnHornet(x + 300, y, 0, false, false, 'swarmer');
    const off = s.spawnHornet(x, y + 300, 0, false, false, 'swarmer');
    const hit: number[] = [];
    beamSweep(s, x, y, 0, 600, 20, (h) => hit.push(h.id));
    expect(hit).toContain(on.id);
    expect(hit).not.toContain(off.id);
    expect(s.fog.seen[Math.floor(y / T) * s.W + Math.floor((x + 500) / T)]).toBe(1);
  });
});

describe('H: walkers to the lift', () => {
  it('a robot told to walk there gets onto the lift by itself', () => {
    const s = bare();
    const b = s.addBot('gatherer', 'Husk', s.lift.x + 220, s.lift.y, -4);
    b.place = 'expedition';
    for (let i = 0; i < 30 * 12 && !s.onLift(b, 1); i++) {
      walkToLift(s, b, 1 / 30);
      s.step(1 / 30, NO_INPUT);
    }
    expect(s.onLift(b, 1.6)).toBe(true);
  });
});

describe('L: a stacking mission modifier', () => {
  it('each stack multiplies spawns, elites and loot for the rest of the mission', () => {
    const s = bare();
    expect(s.mods).toEqual(freshMods());
    s.setClock('evening');
    const e0 = eliteChance(s), l0 = lootChance(s);
    stackMods(s, { spawn: 1.5, elite: 2, loot: 1.5 });
    stackMods(s, { spawn: 1.5, elite: 2, loot: 1.5 });
    expect(s.mods.spawn).toBeCloseTo(2.25);
    expect(eliteChance(s)).toBeCloseTo(e0 * 4);
    expect(lootChance(s)).toBeGreaterThan(l0);
  });
});
