/** Grafting (Gasket's capstone): the drop on an elite's death, the hold, the claw's half, the tentacle's locked spot, one at a time, the lift, and only after gasket.3. */
import { describe, expect, it } from 'vitest';
import { companionsAfter } from '../hub/companions';
import { freshBook } from '../hub/questbook';
import { freshHub } from '../hub/state';
import { STORY_LINES } from '../hub/storylines';
import { GRAFT, LIMBS, type Enemy } from './defs';
import { hornetDown } from './foes';
import { handsOf } from '../missionstart';
import { devBlow, graftNear, graftOn, graftStep, graftSummary, layGraft, wear } from './graft';
import { addProp } from './props';
import { NO_INPUT, Sim, type Hornet } from './sim';
import { tap } from './testkit';
import { rise } from './use';

/** The Communicator alone on a quiet desert with the ability (the perk Gasket's capstone pays), facing east. */
const alone = (perks: string[] = ['grafting']) => {
  const s = new Sim(5, [], 'desert', perks);
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.god = false;
  s.props.list.length = 0;
  s.props.solid.fill(0);
  s.props.at.clear();
  s.facing = 0;
  s.controller.x += 400; // off the lift (there Use is the lift's)
  return s;
};
/** A foe at (x, y), not stepped by the sim; elite and twisted/menacing for the drops. */
const foe = (s: Sim, x: number, y: number, o: { elite?: boolean; twisted?: boolean; menacing?: boolean; kind?: Enemy } = {}) => {
  const h = s.spawnHornet(x, y, 0, o.elite ?? false, o.twisted ?? !!o.menacing, o.kind ?? 'swarmer', o.menacing ? { menacing: true } : {});
  h.x = x;
  h.y = y;
  return h;
};
const tick = (s: Sim, secs: number, each?: () => void) => {
  for (let i = 0; i < Math.round(secs * 30); i++) {
    graftStep(s, 1 / 30);
    each?.();
  }
};
const wearing = (s: Sim, kind: 'claw' | 'whip') => graftOn(s, layGraft(s, kind, 'cat', s.controller.x, s.controller.y, devBlow(kind)));
const struck = (s: Sim) => s.events.filter((e) => e.e === 'graft' && e.what === 'strike');

describe('the drop', () => {
  it('a killed twisted elite drops a claw and a menacing elite a tentacle, where they fell', () => {
    const s = alone();
    const twisted = foe(s, 900, 900, { elite: true, twisted: true, kind: 'cat' });
    const menacing = foe(s, 1100, 900, { elite: true, menacing: true, kind: 'cat' });
    hornetDown(s, twisted, null);
    hornetDown(s, menacing, null);
    expect(s.grafts.map((g) => g.kind)).toEqual(['claw', 'whip']);
    expect([s.grafts[0].x, s.grafts[0].y]).toEqual([900, 900]);
    expect(s.grafts.every((g) => g.dmg > 0)).toBe(true);
    expect(s.events.filter((e) => e.e === 'graft' && e.what === 'drop')).toHaveLength(2);
  });
  it('only an elite with limbs drops one: not a day elite, a plain twisted foe, or a plain foe', () => {
    const s = alone();
    for (const h of [foe(s, 900, 900, { elite: true, twisted: false, kind: 'cat' }), foe(s, 900, 900, { twisted: true, kind: 'cat' }), foe(s, 900, 900)]) hornetDown(s, h, null);
    expect(s.grafts).toHaveLength(0);
  });
  it('nothing falls before Gasket\'s capstone (no perk)', () => {
    const s = alone([]);
    hornetDown(s, foe(s, 900, 900, { elite: true, twisted: true, kind: 'cat' }), null);
    expect(s.grafts).toHaveLength(0);
  });
  it('the blow is the donor\'s own times the limb and GRAFT.dmg, so a stronger elite drops a stronger part', () => {
    const s = alone();
    const weak = foe(s, 900, 900, { elite: true, twisted: true, kind: 'cat' });
    const strong = foe(s, 1000, 900, { elite: true, twisted: true, kind: 'boar' });
    hornetDown(s, weak, null);
    hornetDown(s, strong, null);
    expect(s.grafts[0].dmg).toBeCloseTo(devBlow('claw'), 5);
    expect(s.grafts[1].dmg).toBeGreaterThan(s.grafts[0].dmg);
  });
});

describe('the hold', () => {
  it('holding Use beside a part grafts it after GRAFT.hold seconds, and not before', () => {
    const s = alone();
    const c = s.controller;
    const g = layGraft(s, 'claw', 'cat', c.x + 20, c.y, 10);
    tap(s);
    expect(s.action?.graft).toBe(g);
    for (let t = 0; t < GRAFT.hold - 0.3; t += 1 / 30) s.step(1 / 30, NO_INPUT);
    expect(s.graft).toBeNull();
    expect(s.grafts).toHaveLength(1);
    for (let t = 0; t < 0.6; t += 1 / 30) s.step(1 / 30, NO_INPUT);
    expect(s.graft?.kind).toBe('claw');
    expect(s.grafts).toHaveLength(0);
    expect(s.action).toBeNull();
  });
  it('walking off pauses the hold, and a part out of reach is not pressed', () => {
    const s = alone();
    const c = s.controller;
    layGraft(s, 'whip', 'cat', c.x + 20, c.y, 10);
    tap(s);
    c.x += 400;
    for (let t = 0; t < GRAFT.hold + 1; t += 1 / 30) s.step(1 / 30, NO_INPUT);
    expect(s.graft).toBeNull();
    expect(s.action?.paused).toBe(true);
    s.action = null;
    tap(s);
    expect(s.action).toBeNull();
    expect(graftNear(s, c.x, c.y)).toBeNull();
  });
  it('a limb is shown in the state', () => {
    const s = alone();
    expect(graftSummary(s)).toMatchObject({ can: true, lying: [], worn: null });
    wearing(s, 'whip');
    expect(graftSummary(s).worn).toMatchObject({ kind: 'whip', mode: 'idle' });
  });
});

describe('the claw', () => {
  it('rakes only the foes in its half beside him within reach, never a robot or a prop', () => {
    const s = alone();
    const c = s.controller;
    const R = GRAFT.claw.reach;
    wearing(s, 'claw');
    // Facing east, the claw's half (side +1) is the south.
    const south = foe(s, c.x + 10, c.y + R * 0.6);
    const north = foe(s, c.x + 10, c.y - R * 0.6);
    const far = foe(s, c.x + 10, c.y + R * 3);
    const crate = addProp(s, { kind: 'crate', x: 0, y: 0, wear: 1 }, undefined, { x: c.x + 5, y: c.y + 20 });
    const mate = s.addBot('guard', 'Brass', c.x, c.y + 30, 0);
    const hp = [south.hp, north.hp, far.hp, crate.hp, mate.hp, c.hp];
    tick(s, 0.4 + LIMBS.claw.wind + LIMBS.claw.strike + 0.1);
    expect(struck(s)).toHaveLength(1);
    expect(south.hp).toBeLessThan(hp[0]);
    expect([north.hp, far.hp, crate.hp, mate.hp, c.hp]).toEqual(hp.slice(1));
  });
  it('follows his aim: turned west, the half beside him is the north', () => {
    const s = alone();
    const c = s.controller;
    wearing(s, 'claw');
    s.facing = Math.PI;
    const south = foe(s, c.x, c.y + 40);
    const north = foe(s, c.x, c.y - 40);
    const [a, b] = [south.hp, north.hp];
    tick(s, 0.4 + LIMBS.claw.wind + 0.1);
    expect(south.hp).toBe(a);
    expect(north.hp).toBeLessThan(b);
  });
  it('winds up first and rakes again after resting', () => {
    const s = alone();
    const c = s.controller;
    wearing(s, 'claw');
    const h = foe(s, c.x + 5, c.y + 40);
    h.hp = h.maxHp = 100000;
    tick(s, 0.35);
    expect(s.graft!.limb.mode).toBe('idle');
    tick(s, 0.2);
    expect(s.graft!.limb.mode).toBe('wind');
    tick(s, 6);
    expect(struck(s).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the tentacle', () => {
  it('whips the spot it locked as the wind-up began: a foe that left is spared, one that stepped in is hit', () => {
    const s = alone();
    const c = s.controller;
    wearing(s, 'whip');
    const near = foe(s, c.x + 110, c.y);
    const stray = foe(s, c.x - 60, c.y + 400);
    tick(s, 0.4 + 0.05);
    const l = s.graft!.limb;
    expect(l.mode).toBe('wind');
    expect([l.tx, l.ty]).toEqual([near.x, near.y]);
    // The target walks off; another foe steps onto the locked spot.
    near.x += 400;
    stray.x = l.tx;
    stray.y = l.ty;
    const hp = [near.hp, stray.hp];
    tick(s, LIMBS.whip.wind + 0.1);
    expect(near.hp).toBe(hp[0]);
    expect(stray.hp).toBeLessThan(hp[1]);
    expect(c.hp).toBe(c.maxHp);
  });
  it('goes for the nearest foe in reach, and for none beyond it', () => {
    const s = alone();
    const c = s.controller;
    wearing(s, 'whip');
    const out = foe(s, c.x + GRAFT.whip.reach + 60, c.y);
    tick(s, 1);
    expect(s.graft!.limb.mode).toBe('idle');
    const closer = foe(s, c.x, c.y + 100);
    const nearest = foe(s, c.x - 70, c.y);
    tick(s, 0.2);
    const l = s.graft!.limb;
    expect(l.mode).toBe('wind');
    expect([l.tx, l.ty]).toEqual([nearest.x, nearest.y]);
    expect(out.hp).toBe(out.maxHp);
    expect(closer.hp).toBe(closer.maxHp);
  });
  it('spares a robot and a prop on its line', () => {
    const s = alone();
    const c = s.controller;
    wearing(s, 'whip');
    const h = foe(s, c.x + 110, c.y);
    h.hp = h.maxHp = 100000;
    const mate = s.addBot('guard', 'Brass', c.x + 55, c.y, 0);
    const crate = addProp(s, { kind: 'crate', x: 0, y: 0, wear: 1 }, undefined, { x: c.x + 80, y: c.y + 2 });
    tick(s, 0.4 + LIMBS.whip.wind + LIMBS.whip.strike + 0.1);
    expect(h.hp).toBeLessThan(h.maxHp);
    expect(mate.hp).toBe(mate.maxHp);
    expect(crate.hp).toBe(crate.maxHp);
  });
});

describe('one at a time, and the lift', () => {
  it('grafting another replaces the first', () => {
    const s = alone();
    wearing(s, 'claw');
    wearing(s, 'whip');
    expect(s.graft?.kind).toBe('whip');
    expect(s.events.filter((e) => e.e === 'graft' && e.what === 'off')).toHaveLength(1);
    expect(s.stats.grafts).toBe(2);
  });
  it('falls off as the lift rises, and the docking says so in Gasket\'s voice', () => {
    const s = alone();
    wearing(s, 'claw');
    rise(s);
    expect(s.graft).toBeNull();
    expect(s.stats.grafted).toBe(1);
    const news = companionsAfter(freshHub(), freshBook(), { grafted: 1 }).news;
    expect(news).toEqual(['Dr. Gasket: "Splendid. I\'ll take that for study."']);
    expect(companionsAfter(freshHub(), freshBook(), {}).news).toEqual([]);
  });
  it('a mission ended without the ride drops it too', () => {
    const s = alone();
    wearing(s, 'whip');
    s.finish();
    expect(s.graft).toBeNull();
    expect(s.stats.grafted).toBe(1);
  });
  it('goes down a dungeon with him (the hands) and comes back up', () => {
    const land = alone();
    wearing(land, 'claw');
    const hands = handsOf(land);
    expect(hands.graft).toEqual({ kind: 'claw', from: 'cat', dmg: land.graft!.dmg });
    const below = alone();
    wear(below, hands.graft);
    expect(below.graft).toMatchObject({ kind: 'claw', dmg: land.graft!.dmg, limb: { mode: 'idle', side: 1 } });
    // One grafted below comes up; none below takes it off.
    wearing(below, 'whip');
    wear(land, handsOf(below).graft);
    expect(land.graft?.kind).toBe('whip');
    wear(land, handsOf(alone()).graft);
    expect(land.graft).toBeNull();
  });
  it('a limb does nothing while he is out of oil', () => {
    const s = alone();
    const c = s.controller;
    wearing(s, 'claw');
    const h = foe(s, c.x + 5, c.y + 30);
    c.hp = 0;
    tick(s, 3);
    expect(h.hp).toBe(h.maxHp);
  });
});

describe('only after gasket.3', () => {
  it('the capstone pays the perk, in Gasket\'s story line', () => {
    const steps = STORY_LINES['gasket.story'].steps;
    expect(steps).toHaveLength(3);
    expect(steps[2].reward.perk).toBe('grafting');
    expect(steps[0].reward.perk).toBeUndefined();
  });
  it('a land without the perk has no way to graft: a part is only dropped by the ability', () => {
    const s = alone([]);
    const h: Hornet = foe(s, 900, 900, { elite: true, menacing: true, kind: 'cat' });
    hornetDown(s, h, null);
    expect(s.grafts).toHaveLength(0);
    expect(graftSummary(s).can).toBe(false);
  });
});
