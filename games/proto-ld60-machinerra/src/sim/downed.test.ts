import { describe, expect, it } from 'vitest';
import { DOWNED } from './defs';
import { carriedBy, downedNear, loadSpeed, pickUp } from './downed';
import { DEV_SOURCES } from './missionfx';
import { NO_INPUT, Sim, type Bot } from './sim';
import { tap } from './testkit';

/** The Communicator, with the robots asked for, on a quiet land; the first robot is returned. */
function field(...roles: ('guard' | 'mule' | 'gatherer')[]) {
  const crew = roles.map((role, i) => ({ role, name: `${role}${i}`, uid: `r${i + 1}` }));
  const s = new Sim(7, [], 'desert', [], undefined, undefined, { crew });
  s.setClock('day');
  for (const n of s.nests) n.dead = true;
  return s;
}
const run = (s: Sim, sec: number, input = NO_INPUT) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, input);
    s.events.length = 0;
  }
};
const away = (s: Sim, tiles = 12) => ({ x: s.lift.x + tiles * 32, y: s.lift.y });
/** Out of oil, where it stands. */
const down = (s: Sim, b: Bot) => {
  s.hurt(b, b.maxHp * 2);
  return b;
};
const lie = (s: Sim, b: Bot, at: { x: number; y: number }) => {
  b.x = at.x;
  b.y = at.y;
  return down(s, b);
};
const stand = (s: Sim, at: { x: number; y: number }) => {
  s.controller.x = at.x + 20;
  s.controller.y = at.y;
};

describe('at 0 oil a robot goes down and is never destroyed (P5)', () => {
  it('lies where it fell, out of the crew, not dead; nothing destroys it', () => {
    const s = field('guard');
    const g = s.crew[0];
    const at = away(s);
    lie(s, g, at);
    expect(g.downed).toEqual({ by: null });
    expect(g.dead).toBe(false);
    expect(g.hp).toBe(0);
    expect(s.crew).not.toContain(g);
    expect(s.fielded).toContain(g);
    expect(s.stats.lost).toBe(0);
    // Hits do nothing, a hornet beside it picks another target or none, and a boss's sting passes it by.
    s.hurt(g, 500);
    expect(g.dead).toBe(false);
    const h = s.spawnHornet(at.x + 10, at.y);
    run(s, 6);
    expect(g.dead).toBe(false);
    expect(g.hp).toBe(0);
    expect(h.target).not.toBe(g.id);
  });

  it('a downed robot is not pushed about by the crew and does not act', () => {
    const s = field('guard', 'gatherer');
    const [g, other] = s.crew;
    lie(s, g, away(s));
    other.x = g.x + 2;
    other.y = g.y;
    const x = g.x, y = g.y;
    run(s, 2);
    expect(g.x).toBe(x);
    expect(g.y).toBe(y);
    expect(g.state).toBe('idle');
  });

  it('a called robot (the Brass Guard) is not crew: it is only gone', () => {
    const s = field();
    const b = s.addBot('guard', 'Brass Guard 1', s.lift.x, s.lift.y, 0);
    b.ttl = 30;
    s.hurt(b, 1000);
    expect(b.dead).toBe(true);
    expect(b.downed).toBeUndefined();
  });
});

describe('carrying (P5)', () => {
  it('Use picks a lying robot up on the second press and puts it down; it rides on him, 60% speed, guns off, the kick on', () => {
    const s = field('guard');
    const g = s.crew[0];
    const at = away(s);
    lie(s, g, at);
    stand(s, at);
    // his free walk: the same second on a land with nobody to carry
    const twin = field('guard');
    stand(twin, at);
    const xs = twin.controller.x;
    run(twin, 1, { ...NO_INPUT, mx: -1 });
    const free = xs - twin.controller.x;
    tap(s); // starts the fix
    expect(s.action?.bot).toBe(g);
    tap(s); // a second press carries it instead
    expect(g.downed).toEqual({ by: s.controller.id });
    expect(s.action).toBeNull();
    expect(carriedBy(s, s.controller)).toEqual([g]);
    // 60% of his speed: a second's walk back along the way he came, against the same walk before
    expect(s.walk(s.controller)).toBeCloseTo(DOWNED.carry, 3);
    const x0 = s.controller.x;
    run(s, 1, { ...NO_INPUT, mx: -1 });
    const walked = x0 - s.controller.x;
    expect(walked / free).toBeGreaterThan(DOWNED.carry * 0.9);
    expect(walked / free).toBeLessThan(DOWNED.carry * 1.1);
    expect(Math.hypot(g.x - s.controller.x, g.y - s.controller.y)).toBeLessThan(12);
    // a gun does not fire, the kick works
    s.give('steamGun');
    s.equip('steamGun', 'primary');
    s.controller.steam = s.controller.maxSteam;
    const shots = s.shots.length;
    s.step(1 / 30, { ...NO_INPUT, ax: s.controller.x + 100, ay: s.controller.y, fire: true });
    expect(s.shots.length).toBe(shots);
    expect(s.controller.steam).toBe(s.controller.maxSteam);
    s.kickCd = 0;
    s.step(1 / 30, { ...NO_INPUT, ax: s.controller.x + 100, ay: s.controller.y, kick: true });
    expect(s.kickCd).toBeGreaterThan(0);
    // Use puts it down (off the lift); his speed is his own again
    tap(s);
    expect(g.downed).toEqual({ by: null });
    expect(carriedBy(s, s.controller)).toEqual([]);
    const x1 = s.controller.x;
    run(s, 1, { ...NO_INPUT, mx: -1 });
    expect((x1 - s.controller.x) / free).toBeGreaterThan(0.95);
  });

  it('on the lift Use asks the lift, and what he carries rides up', () => {
    const s = field('guard');
    const g = s.crew[0];
    lie(s, g, { x: s.lift.x + 200, y: s.lift.y });
    pickUp(s, s.controller, g);
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    run(s, 0.5);
    tap(s);
    expect(s.armed).toMatchObject({ key: 'lift' });
    expect(g.downed?.by).toBe(s.controller.id);
    expect(s.downedHome).toEqual(['r1']);
  });

  it("on the lift Use is the lift's, even with a robot lying beside him (it rides home carried); beyond the disc it is the robot's", () => {
    const s = field('guard');
    const g = s.crew[0];
    lie(s, g, { x: s.lift.x + 20, y: s.lift.y });
    s.controller.x = s.lift.x + 40;
    s.controller.y = s.lift.y + 30;
    tap(s);
    expect(s.armed).toMatchObject({ key: 'lift' });
    expect(s.action).toBeNull();
    s.armed = null;
    s.controller.x = s.lift.x + 200; // beyond the disc
    s.controller.y = s.lift.y;
    g.x = s.controller.x + 20;
    g.y = s.controller.y;
    tap(s);
    expect(s.action?.bot).toBe(g);
  });

  it('he goes down: what he carries is put down beside him', () => {
    const s = field('guard');
    const g = s.crew[0];
    lie(s, g, away(s));
    pickUp(s, s.controller, g);
    s.hurt(s.controller, 9999);
    run(s, 0.2);
    expect(g.downed).toEqual({ by: null });
  });

  it('he may carry any number: his speed falls with each, never under 50%; the engine\'s carry stats (an augment) change it', () => {
    const s = field('guard', 'guard', 'guard', 'guard');
    const [a, b, c, d] = s.crew;
    const at = away(s);
    for (const [i, r] of [a, b, c, d].entries()) lie(s, r, { x: at.x + i * 6, y: at.y });
    stand(s, at);
    const speeds: number[] = [];
    for (const r of [a, b, c, d]) {
      pickUp(s, s.controller, r);
      s.step(1 / 30, NO_INPUT);
      speeds.push(s.walk(s.controller));
    }
    expect(carriedBy(s, s.controller)).toHaveLength(4);
    expect(speeds[0]).toBeCloseTo(DOWNED.carry, 3);
    expect(speeds[1]).toBeCloseTo(DOWNED.floor, 3); // 0.6 / sqrt(2) is under the floor
    expect(speeds[3]).toBeCloseTo(DOWNED.floor, 3);
    expect(loadSpeed(4, DOWNED.carry, DOWNED.floor)).toBe(DOWNED.floor);
    // An augment that lifts `carry` (here the dev "porter" source, +50%) lifts it, and the floor stays a floor
    const porter = new Sim(7, [], 'desert', [], undefined, undefined, { crew: [{ role: 'guard', name: 'g', uid: 'r1' }] });
    porter.addSource(porter.controller, DEV_SOURCES.porter);
    const pg = porter.crew[0];
    lie(porter, pg, away(porter));
    pickUp(porter, porter.controller, pg);
    porter.step(1 / 30, NO_INPUT);
    expect(porter.walk(porter.controller)).toBeCloseTo(DOWNED.carry * 1.5, 3);
  });

  it('beside a robot lying, Use works it even while carrying others; with none in reach, Use puts the load down', () => {
    const s = field('guard', 'guard');
    const [a, b] = s.crew;
    const at = away(s);
    lie(s, a, at);
    lie(s, b, { x: at.x + 300, y: at.y });
    stand(s, at);
    tap(s);
    tap(s);
    expect(a.downed?.by).toBe(s.controller.id);
    s.controller.x = b.x + 20;
    s.controller.y = b.y;
    run(s, 0.1);
    tap(s);
    expect(s.action?.bot).toBe(b);
    tap(s);
    expect(carriedBy(s, s.controller)).toEqual([a, b]);
    tap(s); // nothing lying: all down
    expect(carriedBy(s, s.controller)).toEqual([]);
  });

  it('a carried robot is not lost to a hit and cannot be picked up twice', () => {
    const s = field('guard');
    const g = s.crew[0];
    lie(s, g, away(s));
    pickUp(s, s.controller, g);
    expect(downedNear(s, g.x, g.y)).toBeNull();
    s.hurt(g, 99);
    expect(g.dead).toBe(false);
  });
});

describe('the field fix (P5)', () => {
  it('press Use, stay near: 8 s of work; a hit does not cancel it, leaving the zone pauses it', () => {
    const s = field('guard');
    const g = s.crew[0];
    const at = away(s);
    lie(s, g, at);
    stand(s, at);
    tap(s);
    expect(s.action).toMatchObject({ need: DOWNED.fix, paused: false });
    run(s, DOWNED.fix - 1);
    expect(g.downed).toBeDefined();
    s.hurt(s.controller, 5); // a hit
    run(s, 0.4);
    expect(s.action?.bot).toBe(g);
    // out of the zone: paused, the clock does not run
    const t = s.action!.t;
    s.controller.x += 400;
    run(s, 2);
    expect(s.action?.paused).toBe(true);
    expect(s.action?.t).toBe(t);
    // back in: it goes on and finishes
    stand(s, at);
    run(s, DOWNED.fix - t + 0.3);
    expect(g.downed).toBeUndefined();
    expect(g.hp).toBeCloseTo(g.maxHp * DOWNED.oil, 0);
    expect(s.crew).toContain(g);
    expect(s.stats.fixed).toBe(1);
    expect(s.action).toBeNull();
  });

  it('takes exactly its 8 seconds', () => {
    const s = field('guard');
    const g = s.crew[0];
    const at = away(s);
    lie(s, g, at);
    stand(s, at);
    tap(s);
    run(s, DOWNED.fix - 0.5);
    expect(g.downed).toBeDefined();
    run(s, 0.8);
    expect(g.downed).toBeUndefined();
  });

  it('a fixed robot is a crew robot again: it can be downed again and fixed again', () => {
    const s = field('guard');
    const g = s.crew[0];
    const at = away(s);
    lie(s, g, at);
    stand(s, at);
    tap(s);
    run(s, DOWNED.fix + 0.3);
    expect(s.crew).toContain(g);
    down(s, g);
    expect(g.downed).toEqual({ by: null });
    stand(s, { x: g.x, y: g.y });
    tap(s);
    run(s, DOWNED.fix + 0.3);
    expect(g.downed).toBeUndefined();
    expect(s.stats.fixed).toBe(2);
  });
});

describe('the Mule carries too (P5, Minos on the Mule)', () => {
  it('its speed with n carried: 60% for one, over the square root of n for more, never a stop', () => {
    expect(loadSpeed(0)).toBe(1);
    expect(loadSpeed(1)).toBeCloseTo(0.6);
    expect(loadSpeed(2)).toBeCloseTo(0.6 / Math.SQRT2);
    expect(loadSpeed(4)).toBeCloseTo(0.3);
    expect(loadSpeed(9)).toBeCloseTo(0.2);
    expect(loadSpeed(100)).toBeGreaterThan(0);
  });

  it('a Mule loaded with two is slowed (x0.6 / sqrt(2))', () => {
    const s = field('mule', 'guard', 'guard');
    const [m, a, b] = s.crew;
    lie(s, a, away(s));
    lie(s, b, away(s, 13));
    pickUp(s, m, a);
    pickUp(s, m, b);
    s.step(1 / 30, NO_INPUT);
    expect(s.engine.stat(m, 'speed', 1)).toBeCloseTo(loadSpeed(2), 3);
    expect(s.walk(m)).toBeCloseTo(loadSpeed(2), 3);
  });

  it('picks up a downed robot lying near its crew and brings it to the lift', () => {
    const s = field('mule', 'guard');
    const [m, g] = s.crew;
    const at = { x: s.lift.x + 8 * 32, y: s.lift.y + 3 * 32 };
    m.x = at.x - 60;
    m.y = at.y;
    s.controller.x = at.x - 100;
    s.controller.y = at.y;
    lie(s, g, at);
    let carried = false;
    for (let i = 0; i < 30 * 60 && !(carried && !carriedBy(s, m).length); i++) {
      s.step(1 / 30, NO_INPUT);
      s.events.length = 0;
      if (carriedBy(s, m).length) carried = true;
    }
    expect(carried).toBe(true);
    expect(g.downed).toEqual({ by: null });
    expect(s.onLift(g, 1)).toBe(true);
    // set down on the lift, it is left alone: the Mule does not pick it up again
    run(s, 10);
    expect(g.downed).toEqual({ by: null });
    expect(carriedBy(s, m)).toEqual([]);
    expect(s.downedHome).toEqual(['r2']);
  });

  it('does not leave its crew for a robot lying far off', () => {
    const s = field('mule', 'guard');
    const [m, g] = s.crew;
    lie(s, g, away(s, 40));
    run(s, 20);
    expect(carriedBy(s, m)).toEqual([]);
    expect(g.downed).toEqual({ by: null });
  });
});

describe('the end of the mission (P5)', () => {
  it('robots on the lift ride home, a downed one among them comes home carried; one left behind is lost', () => {
    const s = field('guard', 'guard', 'guard');
    const [a, b, c] = s.crew;
    const far = away(s, 30);
    lie(s, b, { x: s.lift.x + 20, y: s.lift.y });
    lie(s, c, far);
    a.x = s.lift.x - 20;
    a.y = s.lift.y;
    s.finish();
    expect(s.stats.saved).toBe(2);
    expect(s.stats.left).toBe(1);
    expect(s.stats.lost).toBe(1);
    expect(s.downedHome).toEqual(['r2']);
    expect(s.went).toEqual(['r1', 'r2', 'r3']);
  });
});
