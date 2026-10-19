/**
 * P36: what the graveyard's calm, the Cold Box and the seven new places do, each as its `places.md` entry (or `systems.md`,
 * Calm and secrets) says. Cheap: one land, short spans.
 */
import { describe, expect, it } from 'vitest';
import { BATTERY, BELL, CALM, COLDBOX, EXPEDITION, LANES, LIGHTHOUSE, T, WINGS } from './defs';
import { flingProp } from './crash';
import { carriedProps } from './placeparts';
import type { PlaceRT } from './placeplay';
import { forced, placesTagged, type PlaceId } from './places';
import { NO_INPUT, Sim } from './sim';
import { rideLift, tap } from './testkit';

const run = (s: Sim, sec: number, input = NO_INPUT) => {
  for (let i = 0; i < Math.round(sec * 30); i++) s.step(1 / 30, input);
};
/** A desert land with every P36 place (the rare Scripture forced in), the Communicator alone, nothing arriving. */
const land = (seed = 4) => {
  forced.add('scripture');
  let s: Sim;
  try {
    s = new Sim(seed, ['sprocket']);
  } finally {
    forced.delete('scripture');
  }
  s.bots = [s.controller];
  s.cfg.morningSwarm = 0;
  s.cfg.edge = 0;
  s.god = true;
  return s;
};
const place = (s: Sim, id: PlaceId) => s.places.find((p) => p.id === id) as PlaceRT;
const at = (p: PlaceRT, kind: string) => p.parts.find((q) => q.kind === kind)!;
const stand = (s: Sim, a: { x: number; y: number }, dy = 30) => {
  s.controller.x = a.x;
  s.controller.y = a.y + dy;
};

describe('every P36 place in a land, found by its tag', () => {
  it('the desert has all eight (the Scripture when its roll says so), and each tag finds its place', () => {
    const s = land();
    for (const id of ['core-vault', 'hornet-rest', 'lanes', 'expedition', 'lighthouse', 'bell', 'battery', 'scripture'] as PlaceId[]) expect(place(s, id), id).toBeTruthy();
    expect(placesTagged('wings')).toEqual(['hornet-rest']);
    expect(placesTagged('bowl')).toEqual(['lanes']);
    expect(placesTagged('expedition')).toEqual(['expedition']);
    expect(placesTagged('beam')).toEqual(['lighthouse']);
    expect(placesTagged('bell')).toEqual(['bell']);
    expect(placesTagged('gun')).toEqual(['battery']);
    expect(placesTagged('scripture')).toEqual(['scripture']);
    expect(placesTagged('core')).toEqual(['core-vault']);
  });
});

describe('the graveyard\'s calm', () => {
  it('no enemy near him in it: his oil refills, a grave lights every 15 s, and three lit give him 20 more oil this mission', () => {
    const s = land();
    const g = place(s, 'graveyard');
    const c = s.controller;
    s.god = false;
    stand(s, g, 0);
    s.loot.length = 0; // Seven's oil can lies at its heart
    c.hp = 40;
    run(s, 1);
    expect(g.state).toBe('calm');
    expect(c.hp).toBeCloseTo(40 + CALM.refill, 0);
    const max = s.engine.maxHp(c);
    run(s, CALM.light);
    expect(g.v.lit).toBe(1);
    run(s, CALM.light * 2);
    expect(g.v.lit).toBe(3);
    expect(s.engine.maxHp(c)).toBe(max + CALM.maxOil);
  });

  it('an enemy within 8 tiles breaks it: no oil, the grave count waits', () => {
    const s = land();
    const g = place(s, 'graveyard');
    const c = s.controller;
    s.god = false;
    stand(s, g, 0);
    s.loot.length = 0;
    c.hp = 40;
    const h = s.spawnHornet(c.x + (CALM.calm - 2) * T, c.y, 0, false, false, 'swarmer');
    h.hp = h.maxHp = 1e6;
    run(s, 0.2);
    expect(g.state).toBe('quiet');
    run(s, 0.1);
    expect(c.hp).toBeLessThanOrEqual(40);
  });
});

describe('1: the Cold Box', () => {
  it('pried, its alarm calls the foes near it until the fridge is kicked over, and the kicked fridge slides', () => {
    const s = land();
    const p = place(s, 'core-vault');
    const f = p.props[0];
    expect(f.kind).toBe('fridge');
    expect(s.triggerPlace('core-vault')).toBe(true);
    expect(p.v.alarm).toBe(1);
    expect(p.zone?.kind).toBe('alarm');
    expect(p.zone?.r).toBe(COLDBOX.alarm);
    stand(s, f);
    const x0 = f.x;
    flingProp(s, f, 400, 0, s.controller);
    run(s, 1.5);
    expect(p.v.alarm).toBe(0);
    expect(s.props.zones.includes(p.zone!)).toBe(false);
    expect(f.x).toBeGreaterThan(x0 + 20);
  });
});

describe('2: Where Hornets Go', () => {
  it('wings lie there; old hornets drift in calm, settle, die and leave a wing; a swatted one leaves its wing too', () => {
    const s = land();
    const p = place(s, 'hornet-rest');
    const st = at(p, 'stump');
    stand(s, st, (WINGS.sight - 1) * T);
    run(s, 1 / 30);
    const wings = () => s.loot.filter((l) => !l.dead && l.part === 'hornet-wings').length;
    expect(wings()).toBe(p.parts.filter((q) => q.kind === 'wing').length);
    s.controller.x += 2000; // out of the way: wings are picked up by walking over them
    const first = wings();
    run(s, WINGS.every[1] + 0.1);
    const old = s.hornets.filter((h) => h.calm);
    expect(old.length).toBeGreaterThan(0);
    expect(old[0].target).toBe(0);
    run(s, (WINGS.from * T) / (WINGS.speed * 60) + WINGS.rest + 4);
    expect(wings()).toBeGreaterThan(first);
    const h = s.hornets.find((x) => x.calm) ?? s.spawnHornet(st.x + 200, st.y, 0, false, false, 'hornet');
    h.calm ??= { x: st.x, y: st.y, speed: 10 };
    p.foes.push(h);
    const before = wings();
    s.damageHornet(h, 1e6, s.controller);
    run(s, 0.1);
    expect(wings()).toBe(before + 1);
  });

  it('at dusk the twisted come to mourn, as a pack', () => {
    const s = land();
    const p = place(s, 'hornet-rest');
    s.setClock('evening');
    run(s, 0.1);
    expect(p.v.mourned).toBe(1);
    expect(s.hornets.filter((h) => h.twisted).length).toBe(WINGS.pack);
  });
});

describe('3: the Strike Lanes', () => {
  it('ten sleeping crawlcams a lane; a roll that crashes all ten is a strike (its cache, once), and the lane wakes', () => {
    const s = land();
    const p = place(s, 'lanes');
    stand(s, p, 0);
    run(s, 0.1);
    expect(p.foes.length).toBe(40);
    expect(p.foes.every((h) => h.kind === 'spider' && h.sleep === 'lanes')).toBe(true);
    run(s, 1);
    expect(p.foes.every((h) => h.sleep)).toBe(true);
    const loot = s.loot.length;
    for (const h of p.foes.slice(0, 10)) h.crashT = s.time;
    run(s, LANES.settle + 0.2);
    expect(p.v.score0).toBe(10);
    expect(p.v.strike).toBe(1);
    expect(s.loot.length).toBe(loot + LANES.cache + 1);
    expect(p.foes.slice(0, 10).every((h) => !h.sleep)).toBe(true);
    expect(p.foes.slice(10).every((h) => h.sleep)).toBe(true);
  });

  it('a kicked bowling ball rolls into a lane\'s pins: the roll counts them, and the pins left standing wake', () => {
    const s = land();
    const p = place(s, 'lanes');
    stand(s, p, 0);
    run(s, 0.1);
    const pins = p.foes.slice(10, 20);
    const head = at(p, 'pin') && p.parts.filter((q) => q.kind === 'pin')[10];
    const foul = p.parts.filter((q) => q.kind === 'foul')[1];
    const ball = p.props.find((q) => q.kind === 'ball')!;
    const d = Math.hypot(head.x - foul.x, head.y - foul.y);
    // The ball a little way up the lane from the pins, kicked straight at the head pin.
    ball.x = head.x - ((head.x - foul.x) / d) * 70;
    ball.y = head.y - ((head.y - foul.y) / d) * 70;
    flingProp(s, ball, ((head.x - foul.x) / d) * 600, ((head.y - foul.y) / d) * 600, s.controller);
    run(s, LANES.settle + 1.5);
    expect(p.v.score1).toBeGreaterThan(0);
    expect(pins.every((h) => h.dead || !h.sleep)).toBe(true);
  });
});

describe('4: the Lost Expedition', () => {
  it('five husks lie downed, not crew; fixed, one walks to the lift by itself, and rides up a citizen', () => {
    const s = land();
    const p = place(s, 'expedition');
    stand(s, at(p, 'fire'), 0);
    run(s, 0.1);
    expect(p.bots.length).toBe(5);
    expect(p.bots.every((b) => b.downed && !s.crew.includes(b))).toBe(true);
    // The field fix, as any downed robot's: one press beside it, then stay.
    const b = p.bots[0];
    stand(s, b, 4);
    tap(s);
    run(s, 8.2);
    expect(b.downed).toBeUndefined();
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    for (let i = 0; i < 30 * 120 && !s.onLift(b, 1); i++) s.step(1 / 30, NO_INPUT);
    expect(s.onLift(b, 1.6)).toBe(true);
    rideLift(s);
    expect(s.stats.civilians).toBe(1);
  });

  it('the fire costs scrap and lights everything in its light', () => {
    const s = land();
    const p = place(s, 'expedition');
    const f = at(p, 'fire');
    stand(s, f, 0);
    run(s, 0.1);
    expect(s.placeUse(s.controller.x, s.controller.y)).toBeNull(); // no scrap
    s.scrap = 25;
    tap(s);
    run(s, EXPEDITION.hold + 0.2);
    expect(p.v.lit).toBe(1);
    expect(s.scrap).toBe(25 - EXPEDITION.fire);
    run(s, 0.1);
    expect(s.engine.status(s.controller, 'lit')).toBeTruthy();
  });
});

describe('13: the Lighthouse', () => {
  it('filled and lit, its beam takes a twisted foe\'s aura off and it calls the land\'s foes; put out, it stops; lit again, free', () => {
    const s = land();
    const p = place(s, 'lighthouse');
    const t = at(p, 'lighthouse');
    s.scrap = 40;
    stand(s, t);
    tap(s);
    run(s, LIGHTHOUSE.hold + 0.2);
    expect(p.state).toBe('lit');
    expect(s.scrap).toBe(40 - LIGHTHOUSE.fill);
    expect(p.zone?.kind).toBe('alarm');
    const a = p.v.a + 0.4; // just ahead of the beam
    const h = s.spawnHornet(t.x + Math.cos(a) * 300, t.y + Math.sin(a) * 300, 0, false, true, 'hornet');
    h.hp = h.maxHp = 1e6;
    h.sleep = 'lighthouse'; // held where it is (a sleeper stands still), so only the beam reaches it
    run(s, 1.5);
    expect(h.dimT).toBeGreaterThan(s.time); // the beam has crossed it: no halo for 3 s
    expect(s.auraOf(h)).toBeNull();
    run(s, LIGHTHOUSE.dim + 0.2);
    expect(s.auraOf(h)).toBeTruthy();
    tap(s);
    run(s, LIGHTHOUSE.hold + 0.2);
    expect(p.state).toBe('dark');
    s.scrap = 0;
    tap(s);
    run(s, LIGHTHOUSE.hold + 0.2);
    expect(p.state).toBe('lit');
  });
});

describe('14: the Dinner Bell', () => {
  it('each of three tolls stacks spawns x1.5, elites x2 and loot x1.5 for the rest of the mission; a fourth does nothing', () => {
    const s = land();
    const p = place(s, 'bell');
    stand(s, at(p, 'bell'));
    for (let i = 0; i < BELL.tolls; i++) {
      tap(s);
      run(s, BELL.hold + 0.2);
    }
    expect(p.v.tolls).toBe(3);
    expect(s.mods.spawn).toBeCloseTo(BELL.spawn ** 3);
    expect(s.mods.elite).toBeCloseTo(BELL.elite ** 3);
    expect(s.mods.loot).toBeCloseTo(BELL.loot ** 3);
    expect(s.placeUse(s.controller.x, s.controller.y)).toBeNull();
  });
});

describe('16: the Old Battery', () => {
  it('carry a shell up, load it, aim at the wheel and fire: the blast lands where he looked', () => {
    const s = land();
    const p = place(s, 'battery');
    const g = at(p, 'gun');
    const shell = p.props.find((q) => q.kind === 'shell')!;
    stand(s, shell, -10);
    tap(s); // picks it up
    expect(carriedProps(s, s.controller)).toEqual([shell]);
    stand(s, g);
    tap(s);
    run(s, BATTERY.load + 0.2);
    expect(p.v.loaded).toBe(1);
    expect(shell.gone).toBe(true);
    // A foe out there, and his aim on it: the gun turns, the press fires, the shell lands on it.
    const target = { x: g.x + 400, y: g.y + 100 };
    const h = s.spawnHornet(target.x, target.y, 0, false, false, 'swarmer');
    h.hp = h.maxHp = 100;
    h.sleep = 'battery'; // it stands where it is
    const aim = { ...NO_INPUT, ax: target.x, ay: target.y };
    run(s, 2, aim);
    s.step(1 / 30, { ...aim, use: true });
    run(s, BATTERY.flight + 0.3, aim);
    expect(p.v.shots).toBe(1);
    expect(Math.hypot(p.v.tx - target.x, p.v.ty - target.y)).toBeLessThan(BATTERY.shell.blast);
    expect(h.dead).toBe(true);
  });
});

describe('25: the First Scripture', () => {
  it('read: its mark in the stats and a sign to carry; on the lift as it rises, the sign goes home', () => {
    const s = land();
    const p = place(s, 'scripture');
    stand(s, at(p, 'sign'));
    tap(s);
    run(s, 2.2);
    expect(p.state).toBe('read');
    expect(s.stats.scripture).toBe(1);
    const sign = p.props.find((q) => q.kind === 'sign')!;
    stand(s, sign, -6);
    tap(s);
    expect(sign.carriedBy).toBe(s.controller.id);
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    run(s, 0.1);
    rideLift(s);
    expect(s.stats.signHome).toBe(1);
  });
});
