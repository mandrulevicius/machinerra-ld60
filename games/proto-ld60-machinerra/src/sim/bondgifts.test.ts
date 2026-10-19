/**
 * The relationship track's gifts at work in a mission (P52, `hub/bonds.ts`): one test each for the ones that act on the sands.
 * The hub-side gifts (the Planner's two blueprints, the Trader's back room, the Fourth Slot, the Second Heart) are in their own tests.
 */
import { describe, expect, it } from 'vitest';
import { ITEMS, addItem, equip, freshGear } from './gear';
import { RUIN_PIECES, REVIVE, T, WEAPONS } from './defs';
import { NO_INPUT, Sim, type Bot } from './sim';
import { isTaught, recipesOf } from '../hub/taught';
import { rideLift } from './testkit';
import { addProp } from './props';
import { crashStep, flingBot, flingFoe } from './crash';
import { PERK_FX } from './perks';

const field = (perks: string[] = [], ...roles: ('guard' | 'mule' | 'gatherer')[]) => {
  const crew = roles.map((role, i) => ({ role, name: `${role}${i}`, uid: `r${i + 1}` }));
  const s = new Sim(7, [], 'desert', perks, undefined, undefined, { crew });
  s.setClock('day');
  for (const n of s.nests) n.dead = true;
  return s;
};
const lieAt = (s: Sim, b: Bot, x: number, y: number) => {
  b.x = x;
  b.y = y;
  s.hurt(b, b.maxHp * 2);
};

describe('the Roll-call (Sprocket)', () => {
  const far = (s: Sim) => ({ x: s.lift.x + 14 * 32, y: s.lift.y });

  it('with it, every downed robot comes up with the lift, wherever it lies', () => {
    const s = field(['rollCall'], 'guard', 'gatherer');
    const [a, b] = s.crew;
    lieAt(s, a, far(s).x, far(s).y);
    lieAt(s, b, s.lift.x - 12 * 32, s.lift.y + 5 * 32);
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    rideLift(s);
    expect(s.phase).toBe('done');
    expect(s.stats.saved).toBe(2);
    expect(s.stats.lost).toBe(0);
    expect(s.downedHome.sort()).toEqual(['r1', 'r2']);
  });

  it('without it, a downed robot far from the lift is left and lost', () => {
    const s = field([], 'guard');
    const [a] = s.crew;
    lieAt(s, a, far(s).x, far(s).y);
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    rideLift(s);
    expect(s.stats.saved).toBe(0);
    expect(s.stats.lost).toBe(1);
  });

  it('a type wreck is not one of ours: it is left where it lies', () => {
    const s = field(['rollCall'], 'guard');
    expect(s.perks.has('rollCall')).toBe(true);
    const wreck = s.addBot('gatherer', 'Wreck', far(s).x, far(s).y, 0);
    wreck.hp = 0;
    wreck.downed = { by: null, wreck: true, found: true, fix: 3 };
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    rideLift(s);
    expect(s.downedHome).toEqual([]);
    expect(Math.hypot(wreck.x - s.lift.x, wreck.y - s.lift.y)).toBeGreaterThan(200);
  });
});

describe('Old Earful (Hob)', () => {
  const armed = (clock: 'day' | 'morning' = 'day') => {
    // Worn as gear, so its pellets (an engine effect of the weapon's source) fly.
    let g = addItem(freshGear(), 'oldEarful').gear;
    g = equip(g, g.items.find((o) => o.id === 'oldEarful')!.uid, 'comm', 'primary');
    const s = new Sim(5, [], 'desert', ['oldEarful'], undefined, g, { tier: 1 });
    s.bots = [s.controller];
    s.cfg.swarm = 0;
    s.controller.hp = s.controller.maxHp = 1e6;
    s.setClock(clock);
    s.props.list.length = 0;
    s.props.solid.fill(0);
    s.props.at.clear();
    s.step(1 / 30, NO_INPUT); // the clock's own beat (the day wakes its hives) passes first
    return s;
  };
  const fire = (s: Sim, ax: number, ay: number) => {
    s.step(1 / 30, { ...NO_INPUT, fire: true, ax, ay });
    s.step(1 / 30, NO_INPUT);
  };

  it('is a wide cone of heavy, flinging pellets, and nobody teaches it', () => {
    const w = WEAPONS.oldEarful as Extract<(typeof WEAPONS)['oldEarful'], { kind: 'gun' }>;
    expect(w.pellets!.n).toBeGreaterThan(5);
    expect(w.pellets!.spread).toBeGreaterThan(WEAPONS.rivetScatter.pellets!.spread);
    expect(w.shove).toBeGreaterThan(WEAPONS.megaphone.shove!);
    expect(ITEMS.oldEarful.gift).toBe('hob');
    expect(isTaught({ stations: { hob: 'slot-1' } }, 'oldEarful', true)).toBe(false);
    expect(recipesOf('hob')).not.toContain('oldEarful');
  });

  it('a shot flings what it hits, so the crash is his, not a kick kill', () => {
    const s = armed();
    const c = s.controller;
    for (const n of s.nests) n.dead = true;
    const h = s.spawnHornet(c.x + 50, c.y, 0, false, false, 'hornet');
    h.vx = h.vy = 0;
    for (let i = 0; i < 6 && !h.fling; i++) {
      fire(s, c.x + 200, c.y);
      c.cd = 0;
    }
    expect(h.vx).toBeGreaterThan(200);
    expect(h.fling).toBeTruthy();
    expect(h.fling!.kick).toBeFalsy();
  });

  /** A boar `d` px ahead takes a kick or one volley; returns how many pellets landed and how far it was thrown (its farthest point from where it stood). */
  const throwBoar = (d: number, how: 'kick' | 'shot') => {
    const s = armed();
    const c = s.controller;
    for (const n of s.nests) n.dead = true;
    const h = s.spawnHornet(c.x + d, c.y, 0, false, false, 'boar');
    h.hp = h.maxHp = 5000;
    h.vx = h.vy = 0;
    const x0 = h.x;
    let landed = 0, far = 0;
    const count = () => {
      for (const e of s.events) if (e.e === 'hit' && e.on === 'hornet' && e.dmg > 0) landed++;
      s.events.length = 0;
    };
    s.step(1 / 30, { ...NO_INPUT, ax: c.x + 200, ay: c.y, ...(how === 'kick' ? { kick: true } : { fire: true }) });
    count();
    for (let i = 0; i < 60; i++) {
      s.step(1 / 30, NO_INPUT);
      count();
      far = Math.max(far, h.x - x0);
    }
    return { landed, far };
  };

  it('a close-range blast: most of the cone lands on a boar at its own range, none past the range', () => {
    const w = WEAPONS.oldEarful as Extract<(typeof WEAPONS)['oldEarful'], { kind: 'gun' }>;
    expect(w.range).toBeLessThanOrEqual(110);
    expect(w.pellets!.spread).toBeGreaterThanOrEqual(0.9); // still wide
    expect(throwBoar(45, 'shot').landed).toBeGreaterThanOrEqual(5); // of 7, a boar closing to bite
    expect(throwBoar(w.range + 40, 'shot').landed).toBe(0);
  });

  it('a point-blank hit throws a boar about as far as a kick, and less the farther off it stands', () => {
    const kick = throwBoar(40, 'kick').far;
    const near = throwBoar(40, 'shot').far;
    const mid = throwBoar(75, 'shot').far;
    const edge = throwBoar(95, 'shot').far;
    expect(kick).toBeGreaterThan(60);
    expect(near).toBeGreaterThan(kick * 0.7);
    expect(near).toBeLessThan(kick * 1.3); // not every pellet's shove stacked on one foe
    expect(mid).toBeLessThan(near);
    expect(edge).toBeLessThan(mid);
  });

  it('its flaw: each shot wakes the nearest sleeping hive in earshot, not one far off, not in the morning', () => {
    const s = armed();
    const c = s.controller;
    const [a, b] = s.nests;
    s.nests.length = 0;
    s.nests.push(a, b);
    for (const n of s.nests) n.awake = false;
    a.x = c.x + 10 * T;
    a.y = c.y;
    b.x = c.x - 14 * T;
    b.y = c.y;
    fire(s, c.x + 100, c.y + 1);
    expect(a.awake).toBe(true);
    expect(b.awake).toBe(false);
    c.cd = 0;
    c.steam = 100;
    fire(s, c.x + 100, c.y + 1);
    expect(b.awake).toBe(true);
    // Far hives are out of earshot; the morning has not woken the day.
    const far = armed();
    for (const n of far.nests) n.awake = false;
    far.nests.forEach((n) => ((n.x = far.controller.x + 80 * T), (n.y = far.controller.y)));
    fire(far, far.controller.x + 100, far.controller.y + 1);
    expect(far.nests.every((n) => !n.awake)).toBe(true);
    const dawn = armed('morning');
    for (const n of dawn.nests) ((n.awake = false), (n.x = dawn.controller.x + 10 * T), (n.y = dawn.controller.y));
    fire(dawn, dawn.controller.x + 100, dawn.controller.y + 1);
    expect(dawn.nests.every((n) => !n.awake)).toBe(true);
  });
});

describe('the Old Map (the Expeditioner)', () => {
  const tileOf = (px: number) => px / T - 0.5;
  it("the land's biggest ruin is on the map from the start; without it the fog is whole there", () => {
    let proved = 0;
    for (const seed of [3, 7, 11, 21, 42]) {
      const withMap = new Sim(seed, [], 'desert', ['oldMap']);
      const plain = new Sim(seed, [], 'desert', []);
      const pay = (r: Sim['ruins'][number]) => (r.size ? RUIN_PIECES.size[r.size].pay : 0);
      const big = withMap.ruins.filter((r) => r.trail === undefined).reduce((b, r) => (pay(r) > pay(b) ? r : b));
      expect(withMap.fog.at(tileOf(big.x), tileOf(big.y))).toBe(true);
      if (!plain.fog.at(tileOf(big.x), tileOf(big.y))) proved++;
      // Only a disc: the rest of the land is still dark.
      expect(withMap.fog.fraction).toBeLessThan(0.2);
    }
    expect(proved).toBeGreaterThan(0);
  });
});

describe('the Open Door (the Kicker)', () => {
  const room = (perks: string[]) => {
    const s = new Sim(3, [], 'desert', perks);
    s.bots = [s.controller];
    s.props.list.length = 0;
    s.props.solid.fill(0);
    s.props.at.clear();
    s.setClock('day');
    const c = s.controller;
    const wall = addProp(s, { kind: 'wall', x: Math.floor(s.lift.x / T) + 3, y: Math.floor(s.lift.y / T), wear: 1 });
    wall.hp = wall.maxHp = 99999; // far more than any crash
    return { s, c, wall };
  };
  const kickFoe = (s: Sim) => {
    const c = s.controller;
    const h = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'swarmer');
    h.hp = h.maxHp = 5000;
    s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y, kick: true });
    for (let i = 0; i < 40 && s.stats.crashes === 0; i++) s.step(1 / 30, NO_INPUT);
    return h;
  };

  it('a kicked foe breaks a wall that would stand against any crash, and flies on', () => {
    const { s, wall } = room(['openDoor']);
    const h = kickFoe(s);
    expect(s.stats.crashes).toBe(1);
    expect(wall.broken).toBe(true);
    expect(Math.hypot(h.vx, h.vy)).toBeGreaterThan(100);
  });

  it('without it the wall stands and the foe stops', () => {
    const { s, wall } = room([]);
    const h = kickFoe(s);
    expect(s.stats.crashes).toBe(1);
    expect(wall.broken).toBeFalsy();
    expect(Math.hypot(h.vx, h.vy)).toBeLessThan(1);
  });

  it('a body that breaks the wall bursts out: at least PERK_FX.openDoor.speed, or the speed it had times keep', () => {
    const D = PERK_FX.openDoor;
    expect(D.keep).toBeGreaterThan(0.5);
    expect(D.keep).toBeLessThan(1);
    for (const [vx, want] of [[200, D.speed], [1000, 1000 * D.keep]] as const) {
      const { s, c, wall } = room(['openDoor']);
      const h = s.spawnHornet(wall.x, wall.y, 0, false, false, 'swarmer'); // inside the wall's tile
      h.hp = h.maxHp = 5000;
      h.vx = vx;
      h.vy = 0;
      flingFoe(s, h, c);
      crashStep(s, 1 / 30);
      expect(wall.broken).toBe(true);
      expect(h.vx).toBeCloseTo(want, 5);
      expect(h.fling).toBeTruthy(); // still flying
    }
  });

  it('a kicked boar carries on well past the wall and is not steered back for the burst', () => {
    const { s, c, wall } = room(['openDoor']);
    s.cfg.swarm = 0;
    const edge = wall.x + T / 2;
    const h = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'boar');
    h.hp = h.maxHp = 5000;
    s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y, kick: true });
    let peak = h.x;
    for (let i = 0; i < 60; i++) {
      s.step(1 / 30, NO_INPUT);
      peak = Math.max(peak, h.x);
      if (wall.broken && s.time < h.fling?.door!) expect(h.vx).toBeGreaterThan(0); // it chases the Communicator, back the way it came, only after
    }
    expect(wall.broken).toBe(true);
    expect(peak - edge).toBeGreaterThan(3 * T);
  });

  it('a flung foe that is not kicked (Old Earful) gets no door', () => {
    const { s, c, wall } = room(['openDoor']);
    const h = s.spawnHornet(wall.x, wall.y, 0, false, false, 'swarmer');
    h.hp = h.maxHp = 5000;
    h.vx = 600;
    flingFoe(s, h, c, false);
    crashStep(s, 1 / 30);
    expect(h.fling?.door).toBeUndefined();
    expect(wall.broken).toBeFalsy();
  });

  it('a kicked robot goes through a wall too', () => {
    const { s, c, wall } = room(['openDoor']);
    const g = s.addBot('guard', 'G', c.x + 30, c.y, 1);
    flingBot(s, g, 900, 0, c);
    for (let i = 0; i < 40; i++) s.step(1 / 30, NO_INPUT);
    expect(wall.broken).toBe(true);
    expect(g.x).toBeGreaterThan(wall.x);
  });

  it('a robot loses the same share of its speed in the door', () => {
    const { s, c, wall } = room(['openDoor']);
    const g = s.addBot('guard', 'G', wall.x - 30, wall.y, 1);
    flingBot(s, g, 900, 0, c);
    const before = g.fling!.vx;
    crashStep(s, 1 / 30); // one step of 30 px puts it in the wall
    expect(wall.broken).toBe(true);
    expect(g.fling!.vx).toBeLessThan(before * PERK_FX.openDoor.keep + 1);
    expect(g.fling!.vx).toBeGreaterThan(before * PERK_FX.openDoor.keep * 0.9);
  });
});

describe('the Homing Signal (the Princess)', () => {
  const dead = (s: Sim) => s.hurt(s.controller, 99999);
  const wait = (s: Sim, sec: number) => {
    for (let i = 0; i < Math.round(sec * 30); i++) s.step(1 / 30, NO_INPUT);
  };
  const alone = (perks: string[], wife: 'home' | 'stolen' | 'none' = 'home') => {
    const s = new Sim(3, [], 'desert', perks, undefined, undefined, { wife });
    s.bots = [s.controller];
    s.cfg.swarm = 0;
    s.setClock('day');
    s.reserve = 0; // no can: the winch would be the fall
    return s;
  };

  it('once a mission, with her home, a fall stands him again where he fell at a quarter oil, spending nothing', () => {
    const s = alone(['homingSignal']);
    const c = s.controller;
    const at = { x: c.x, y: c.y };
    s.reserve = REVIVE.cost;
    dead(s);
    expect(s.downKind).toBe('homing');
    expect(s.events.some((e) => e.e === 'downed' && e.revive)).toBe(true);
    wait(s, REVIVE.time + 0.3);
    expect(c.x).toBeCloseTo(at.x, 0);
    expect(c.hp).toBeCloseTo(c.maxHp * 0.25, 0);
    expect(s.reserve).toBe(REVIVE.cost); // the can is still there
    expect(s.stats.winched).toBe(0);
    expect(s.stats.homing).toBe(1);
    // The second fall is not hers: the can goes.
    wait(s, REVIVE.grace + 0.5);
    dead(s);
    expect(s.downKind).toBe('revive');
  });

  it('with no can the signal is still the first thing that answers; the second fall is the winch', () => {
    const s = alone(['homingSignal']);
    dead(s);
    expect(s.downKind).toBe('homing');
    wait(s, REVIVE.time + REVIVE.grace + 1);
    dead(s);
    expect(s.downKind).toBe('winch');
  });

  it('stops the moment she is taken, and without the perk it never answers', () => {
    const stolen = alone(['homingSignal'], 'stolen');
    dead(stolen);
    expect(stolen.downKind).toBe('winch');
    const without = alone([]);
    dead(without);
    expect(without.downKind).toBe('winch');
  });
});
